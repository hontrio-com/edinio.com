"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadToR2, deleteFromR2, r2KeyFromUrl } from "@/lib/r2";
import { getProductLimit } from "@/lib/plan-limits";
import { logError } from "@/lib/error-logger";
import { parseCsv } from "@/lib/import/csv";
import { detectFormat, autoMapColumns } from "@/lib/import/presets";
import { toStagedProducts } from "@/lib/import/adapters";
import { stageProducts, validateStaged, processImport } from "@/lib/import/committer";
import {
  DEFAULT_OPTIONS,
  EMPTY_TOTALS,
  type ColumnMapping,
  type ImportOptions,
  type ImportPreview,
  type ImportSource,
  type ImportStatus,
  type ImportTotals,
  type StagedProduct,
  type ValidationSummary,
} from "@/lib/import/types";

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const SAMPLE_SIZE = 5;

type ServerClient = Awaited<ReturnType<typeof createClient>>;

async function getOwnedBusinessId(supabase: ServerClient, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("businesses")
    .select("id")
    .eq("user_id", userId)
    .order("created_at")
    .limit(1)
    .single();
  return data?.id ?? null;
}

async function fetchRawCsv(fileUrl: string): Promise<string> {
  const res = await fetch(fileUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`Nu am putut citi fisierul (HTTP ${res.status})`);
  return res.text();
}

/** Step 1: parse an uploaded CSV, detect the format, return a preview + job id. */
export async function createImportJob(
  formData: FormData,
): Promise<{ importId: string; preview: ImportPreview } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const businessId = await getOwnedBusinessId(supabase, user.id);
  if (!businessId) return { error: "Magazin negasit" };

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Niciun fisier incarcat" };
  if (file.size === 0) return { error: "Fisierul este gol" };
  if (file.size > MAX_FILE_BYTES) return { error: "Fisierul este prea mare (maximum 15MB)" };

  const nameOk = file.name.toLowerCase().endsWith(".csv");
  if (!nameOk) return { error: "Momentan acceptam doar fisiere CSV" };

  let text: string;
  try {
    text = await file.text();
  } catch {
    return { error: "Nu am putut citi fisierul" };
  }

  const parsed = parseCsv(text);
  if (parsed.headers.length === 0) return { error: "Fisierul nu are un antet valid" };
  if (parsed.rows.length === 0) return { error: "Fisierul nu contine produse" };

  const source = detectFormat(parsed.headers);
  const mapping: ColumnMapping = source === "generic_csv" ? autoMapColumns(parsed.headers) : {};

  let staged: StagedProduct[];
  try {
    staged = toStagedProducts(source, parsed, mapping, DEFAULT_OPTIONS);
  } catch (e) {
    logError({ action: "createImportJob.adapt", message: e instanceof Error ? e.message : "adapt failed", details: { source }, userId: user.id });
    return { error: "Nu am putut interpreta fisierul. Verifica formatul." };
  }

  const sampleProducts = staged.slice(0, SAMPLE_SIZE);
  const totalRows = staged.length;

  // Store the raw CSV (non-guessable key) so later steps + the cron can re-read it.
  const admin = createAdminClient();
  const { data: job, error: jobErr } = await admin
    .from("product_imports")
    .insert({
      business_id: businessId,
      user_id: user.id,
      source,
      status: "mapping",
      file_name: file.name,
      mapping: mapping as unknown as never,
      options: DEFAULT_OPTIONS as unknown as never,
      totals: { ...EMPTY_TOTALS, total: totalRows } as unknown as never,
    })
    .select("id")
    .single();

  if (jobErr || !job) {
    logError({ action: "createImportJob.insert", message: jobErr?.message ?? "insert failed", userId: user.id });
    return { error: "Eroare la initierea importului" };
  }

  try {
    const buffer = Buffer.from(text, "utf-8");
    const url = await uploadToR2(buffer, `imports/${user.id}/${job.id}.csv`, "text/csv; charset=utf-8");
    await admin.from("product_imports").update({ file_url: url }).eq("id", job.id);
  } catch (e) {
    await admin.from("product_imports").delete().eq("id", job.id);
    logError({ action: "createImportJob.upload", message: e instanceof Error ? e.message : "upload failed", userId: user.id });
    return { error: "Eroare la incarcarea fisierului" };
  }

  return {
    importId: job.id,
    preview: { source, headers: parsed.headers, mapping, sampleProducts, totalRows },
  };
}

/** Step 2 (review): re-map with the chosen mapping/options, return sample + validation. */
export async function previewMapping(
  importId: string,
  mapping: ColumnMapping,
  options: ImportOptions,
): Promise<{ sample: StagedProduct[]; summary: ValidationSummary } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const businessId = await getOwnedBusinessId(supabase, user.id);
  if (!businessId) return { error: "Magazin negasit" };

  const admin = createAdminClient();
  const { data: job } = await admin
    .from("product_imports")
    .select("id, business_id, source, file_url")
    .eq("id", importId)
    .single();
  if (!job || job.business_id !== businessId || !job.file_url) return { error: "Import negasit" };

  let products: StagedProduct[];
  try {
    const parsed = parseCsv(await fetchRawCsv(job.file_url));
    products = toStagedProducts(job.source as ImportSource, parsed, mapping, options);
  } catch {
    return { error: "Nu am putut reinterpreta fisierul" };
  }

  const [{ data: cats }, { count }, { data: profile }] = await Promise.all([
    supabase.from("categories").select("name").eq("business_id", businessId),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("business_id", businessId),
    supabase.from("users_profile").select("plan").eq("id", user.id).single(),
  ]);

  const existingCategories = new Set((cats ?? []).map((c) => c.name.toLowerCase()));
  const summary = validateStaged(products, {
    existingCategories,
    currentCount: count ?? 0,
    limit: getProductLimit(profile?.plan ?? "free"),
  });

  return { sample: products.slice(0, SAMPLE_SIZE), summary };
}

/** Step 3: stage all rows with the confirmed mapping/options and start importing. */
export async function startImport(
  importId: string,
  mapping: ColumnMapping,
  options: ImportOptions,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const businessId = await getOwnedBusinessId(supabase, user.id);
  if (!businessId) return { error: "Magazin negasit" };

  const admin = createAdminClient();
  const { data: job } = await admin
    .from("product_imports")
    .select("id, business_id, source, status, file_url")
    .eq("id", importId)
    .single();
  if (!job || job.business_id !== businessId || !job.file_url) return { error: "Import negasit" };
  if (job.status !== "mapping") return { error: "Importul a fost deja pornit" };

  let products: StagedProduct[];
  try {
    const parsed = parseCsv(await fetchRawCsv(job.file_url));
    products = toStagedProducts(job.source as ImportSource, parsed, mapping, options);
  } catch (e) {
    logError({ action: "startImport.adapt", message: e instanceof Error ? e.message : "adapt failed", businessId, userId: user.id });
    return { error: "Nu am putut interpreta fisierul" };
  }

  if (products.length === 0) return { error: "Nu exista produse de importat" };

  try {
    // Fresh start: clear any rows from a previous attempt on this job.
    await admin.from("product_import_rows").delete().eq("import_id", importId);
    const { total, imagesTotal } = await stageProducts(admin, importId, businessId, products, options.import_images);

    await admin
      .from("product_imports")
      .update({
        status: "importing",
        mapping: mapping as unknown as never,
        options: options as unknown as never,
        totals: { ...EMPTY_TOTALS, total, images_total: imagesTotal } as unknown as never,
        started_at: new Date().toISOString(),
      })
      .eq("id", importId);
  } catch (e) {
    logError({ action: "startImport.stage", message: e instanceof Error ? e.message : "stage failed", businessId, userId: user.id });
    return { error: "Eroare la pregatirea importului" };
  }

  return { ok: true };
}

/** Step 4: advance the import by one chunk (called in a loop by the client). */
export async function processImportChunk(
  importId: string,
): Promise<{ status: ImportStatus; totals: ImportTotals; done: boolean } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const businessId = await getOwnedBusinessId(supabase, user.id);
  if (!businessId) return { error: "Magazin negasit" };

  const admin = createAdminClient();
  const { data: job } = await admin.from("product_imports").select("business_id").eq("id", importId).single();
  if (!job || job.business_id !== businessId) return { error: "Import negasit" };

  try {
    const result = await processImport(admin, importId);
    if (result.done) {
      await cleanupRawFile(importId, admin);
      revalidatePath("/dashboard/products");
    }
    return result;
  } catch (e) {
    logError({ action: "processImportChunk", message: e instanceof Error ? e.message : "process failed", businessId, userId: user.id });
    await admin.from("product_imports").update({ status: "failed", error: "Eroare la procesare", finished_at: new Date().toISOString() }).eq("id", importId);
    return { error: "Eroare la procesarea importului" };
  }
}

/** Read current job status (for resuming the UI / history). */
export async function getImportStatus(
  importId: string,
): Promise<{ status: ImportStatus; totals: ImportTotals } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: job } = await supabase
    .from("product_imports")
    .select("status, totals")
    .eq("id", importId)
    .single();
  if (!job) return { error: "Import negasit" };

  return {
    status: job.status as ImportStatus,
    totals: { ...EMPTY_TOTALS, ...((job.totals as Partial<ImportTotals>) ?? {}) },
  };
}

export async function cancelImport(importId: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const businessId = await getOwnedBusinessId(supabase, user.id);
  if (!businessId) return { error: "Magazin negasit" };

  const admin = createAdminClient();
  const { data: job } = await admin.from("product_imports").select("business_id, status").eq("id", importId).single();
  if (!job || job.business_id !== businessId) return { error: "Import negasit" };

  await admin
    .from("product_imports")
    .update({ status: "cancelled", finished_at: new Date().toISOString() })
    .eq("id", importId);
  await cleanupRawFile(importId, admin);
  revalidatePath("/dashboard/products");
  return { ok: true };
}

async function cleanupRawFile(importId: string, admin: ReturnType<typeof createAdminClient>): Promise<void> {
  const { data: job } = await admin.from("product_imports").select("file_url").eq("id", importId).single();
  if (job?.file_url) {
    const key = r2KeyFromUrl(job.file_url);
    if (key) deleteFromR2(key).catch(() => {});
    await admin.from("product_imports").update({ file_url: null }).eq("id", importId);
  }
}
