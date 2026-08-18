"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadToR2, deleteFromR2, r2KeyFromUrl } from "@/lib/r2";
import { logError } from "@/lib/error-logger";
import { parseCsv, MAX_STOCK_ROWS } from "@/lib/import/csv";
import { parseTabular, recordsToCsv } from "@/lib/import/tabular";
import { hasAcceptedExtension } from "@/lib/import/tabular-formats";
import { autoMapStockColumns, coloaneLipsa, readFeedRows } from "@/lib/import/stock-feed/mapping";
import { buildStockPlan, summarizePlan } from "@/lib/import/stock-feed/matcher";
import { loadCatalog } from "@/lib/import/stock-feed/catalog";
import {
  EMPTY_STOCK_TOTALS,
  numaraProbleme,
  processStockChunk,
  stageStockPlan,
  type StockTotals,
} from "@/lib/import/stock-feed/committer";
import {
  DEFAULT_STOCK_OPTIONS,
  type StockChange,
  type StockFeedMapping,
  type StockFeedOptions,
  type StockRowIssue,
} from "@/lib/import/stock-feed/types";

/**
 * Feedul de actualizare a stocurilor.
 *
 * Sursa jobului e `stock_csv`. Coloana `source` din `product_imports` e text
 * liber, deci nu a fost nevoie de nicio migratie pentru joburi. In schimb, cronul
 * de importuri si `processImport` filtreaza acum pe o lista PERMISA de surse, ca
 * un job de stoc sa nu ajunga niciodata pe conducta care creeaza produse.
 */

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const SAMPLE_SIZE = 8;

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

interface OwnedJob {
  id: string;
  business_id: string;
  source: string;
  status: string;
  file_url: string | null;
  totals: unknown;
}

/**
 * Autorizare plus jobul cerut, intr-un singur loc.
 *
 * Uniune discriminata pe `ok`, nu pe prezenta lui `error`. Cu a doua varianta,
 * TypeScript unea formele si facea `businessId` optional, deci se pierdea exact
 * garantia pentru care exista functia.
 */
type JobContext =
  | { ok: false; error: string }
  | {
      ok: true;
      admin: ReturnType<typeof createAdminClient>;
      businessId: string;
      job: OwnedJob;
    };

async function loadOwnedJob(importId: string): Promise<JobContext> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Neautorizat" };

  const businessId = await getOwnedBusinessId(supabase, user.id);
  if (!businessId) return { ok: false, error: "Magazin negasit" };

  const admin = createAdminClient();
  const { data: job } = await admin
    .from("product_imports")
    .select("id, business_id, source, status, file_url, totals")
    .eq("id", importId)
    .single();

  if (!job || job.business_id !== businessId) return { ok: false, error: "Job negasit" };
  /* Nu lasam actiunile de stoc sa atinga joburi de import de produse. */
  if (job.source !== "stock_csv") return { ok: false, error: "Job negasit" };

  return { ok: true, admin, businessId, job: job as OwnedJob };
}

async function fetchRawCsv(fileUrl: string): Promise<string> {
  const res = await fetch(fileUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`Nu am putut citi fisierul (HTTP ${res.status})`);
  return res.text();
}

export interface StockFeedStart {
  importId: string;
  headers: string[];
  mapping: StockFeedMapping;
  /** Primele randuri brute, ca omul sa vada ce a incarcat. */
  sampleRows: Record<string, string>[];
  totalRows: number;
}

/** Pasul 1: incarca fisierul, ghiceste coloanele, nu scrie nimic in catalog. */
export async function createStockFeedJob(
  formData: FormData,
): Promise<StockFeedStart | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const businessId = await getOwnedBusinessId(supabase, user.id);
  if (!businessId) return { error: "Magazin negasit" };

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Niciun fisier incarcat" };
  if (file.size === 0) return { error: "Fisierul este gol" };
  if (file.size > MAX_FILE_BYTES) return { error: "Fisierul este prea mare (maximum 8MB)" };
  if (!hasAcceptedExtension(file.name)) {
    return { error: "Acceptam fisiere CSV, XLSX sau XLSM" };
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch {
    return { error: "Nu am putut citi fisierul" };
  }

  /*
   * Fisierul se aduce la CSV AICI, o singura data, si asa se pastreaza in R2.
   * Pasii de mai departe (previzualizare, pornire) il recitesc de acolo si nu
   * trebuie sa stie nimic despre XLSX.
   */
  const read = await parseTabular(buffer, file.name, MAX_STOCK_ROWS);
  if ("error" in read) return { error: read.error };
  const parsed = read.parsed;

  /*
   * Taierea se spune, nu se trece cu vederea. Un feed taiat la jumatate arata pe
   * ecran exact ca unul intreg: acelasi verde, aceleasi cifre, doar ca jumatate
   * din stocuri raman vechi si nimeni nu afla de ce.
   */
  if (parsed.truncated) {
    return {
      error: `Fisierul are peste ${MAX_STOCK_ROWS.toLocaleString("ro-RO")} de randuri. Imparte-l in mai multe fisiere.`,
    };
  }

  /*
   * Copia pastrata in R2 se scrie din randurile DEJA citite, nu din octetii bruti.
   *
   * Ramura veche (`buffer.toString("utf-8")` pentru CSV) aducea inapoi exact
   * problema pe care `decodeazaText` tocmai o rezolvase: un fisier cp1250 era
   * citit corect la prima trecere, dar in R2 ajungeau octetii lui interpretati ca
   * UTF-8 — mutilati — iar toti pasii de dupa (previzualizare, pornire, cronul de
   * reluare) citeau versiunea stricata. Diacriticele se pierdeau intre doua
   * ecrane, fara nicio eroare.
   */
  const text = recordsToCsv(parsed);

  const mapping = autoMapStockColumns(parsed.headers);

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (e) {
    logError({ action: "createStockFeedJob.admin", message: e instanceof Error ? e.message : "admin init failed", userId: user.id });
    return { error: "Eroare de configurare a serverului" };
  }

  const { data: job, error: jobErr } = await admin
    .from("product_imports")
    .insert({
      business_id: businessId,
      user_id: user.id,
      source: "stock_csv",
      status: "mapping",
      file_name: file.name,
      mapping: mapping as unknown as never,
      options: DEFAULT_STOCK_OPTIONS as unknown as never,
      totals: { ...EMPTY_STOCK_TOTALS, total: parsed.rows.length } as unknown as never,
    })
    .select("id")
    .single();

  if (jobErr || !job) {
    logError({ action: "createStockFeedJob.insert", message: jobErr?.message ?? "insert failed", businessId, userId: user.id });
    return { error: "Eroare la initierea actualizarii" };
  }

  try {
    const buffer = Buffer.from(text, "utf-8");
    const url = await uploadToR2(buffer, `stock-feeds/${user.id}/${job.id}.csv`, "text/csv; charset=utf-8");
    await admin.from("product_imports").update({ file_url: url }).eq("id", job.id);
  } catch (e) {
    await admin.from("product_imports").delete().eq("id", job.id);
    logError({ action: "createStockFeedJob.upload", message: e instanceof Error ? e.message : "upload failed", businessId, userId: user.id });
    return { error: "Eroare la incarcarea fisierului" };
  }

  return {
    importId: job.id,
    headers: parsed.headers,
    mapping,
    sampleRows: parsed.rows.slice(0, SAMPLE_SIZE),
    totalRows: parsed.rows.length,
  };
}

export interface StockFeedPreview {
  summary: ReturnType<typeof summarizePlan>;
  sampleChanges: StockChange[];
  sampleIssues: StockRowIssue[];
}

/**
 * Pasul 2: spune EXACT ce se va schimba. Nu scrie nimic.
 *
 * Ecranul care iese de aici e singura aparare a omului: dupa el nu mai are cum
 * sa vada ce a stricat.
 */
export async function previewStockFeed(
  importId: string,
  mapping: StockFeedMapping,
  options: StockFeedOptions,
): Promise<StockFeedPreview | { error: string }> {
  const ctx = await loadOwnedJob(importId);
  if (!ctx.ok) return { error: ctx.error };
  const { admin, businessId, job } = ctx;

  if (!mapping.identifier) return { error: "Alege coloana cu identificatorul produsului" };
  if (!mapping.stock && !(options.update_price && mapping.price)) {
    return { error: "Alege cel putin coloana de stoc sau, daca actualizezi preturi, coloana de pret" };
  }
  if (!job.file_url) return { error: "Fisierul nu mai este disponibil. Incarca-l din nou." };

  try {
    const parsed = parseCsv(await fetchRawCsv(job.file_url), MAX_STOCK_ROWS);
    /* Fisierul din R2 e scris de noi, deci n-ar trebui sa aiba ghilimele rupte.
       „N-ar trebui" nu e o plasa: daca totusi are, `rows` e GOL, si fara
       verificarea asta o rulare pe zero randuri s-ar raporta drept reusita. */
    if (parsed.parseError) return { error: parsed.parseError };
    /* Coloanele alese trebuie sa mai existe: altfel se citeste tot fisierul si
       nu se schimba nimic, iar rularea pare reusita. */
    const lipsa = coloaneLipsa(parsed, mapping, { updatePrice: options.update_price });
    if (lipsa.length > 0) {
      return { error: `Fisierul nu mai are coloanele: ${lipsa.join(", ")}. Alege-le din nou.` };
    }
    const rows = readFeedRows(parsed, mapping, { updatePrice: options.update_price });
    const catalog = await loadCatalog(admin, businessId, options.match_key);
    const plan = buildStockPlan(rows, catalog, {
      matchKey: options.match_key,
      updatePrice: options.update_price,
    });

    return {
      summary: summarizePlan(plan),
      sampleChanges: plan.changes.slice(0, SAMPLE_SIZE),
      sampleIssues: plan.issues.slice(0, SAMPLE_SIZE),
    };
  } catch (e) {
    logError({ action: "previewStockFeed", message: e instanceof Error ? e.message : "preview failed", businessId });
    return { error: "Nu am putut calcula previzualizarea" };
  }
}

/** Pasul 3: pune planul in randuri si porneste scrierea. */
export async function startStockFeed(
  importId: string,
  mapping: StockFeedMapping,
  options: StockFeedOptions,
): Promise<{ ok: true; pending: number } | { error: string }> {
  const ctx = await loadOwnedJob(importId);
  if (!ctx.ok) return { error: ctx.error };
  const { admin, businessId, job } = ctx;

  if (job.status !== "mapping") return { error: "Actualizarea a fost deja pornita" };
  if (!job.file_url) return { error: "Fisierul nu mai este disponibil. Incarca-l din nou." };
  if (!mapping.identifier) return { error: "Alege coloana cu identificatorul produsului" };

  try {
    /*
     * Planul se recalculeaza acum, nu se ia cel din previzualizare. Intre cele
     * doua ecrane catalogul poate fi editat, iar ce se scrie trebuie sa fie
     * calculat pe starea de ACUM, nu pe una de acum cinci minute.
     */
    const parsed = parseCsv(await fetchRawCsv(job.file_url), MAX_STOCK_ROWS);
    /* Fisierul din R2 e scris de noi, deci n-ar trebui sa aiba ghilimele rupte.
       „N-ar trebui" nu e o plasa: daca totusi are, `rows` e GOL, si fara
       verificarea asta o rulare pe zero randuri s-ar raporta drept reusita. */
    if (parsed.parseError) return { error: parsed.parseError };
    /* Coloanele alese trebuie sa mai existe: altfel se citeste tot fisierul si
       nu se schimba nimic, iar rularea pare reusita. */
    const lipsa = coloaneLipsa(parsed, mapping, { updatePrice: options.update_price });
    if (lipsa.length > 0) {
      return { error: `Fisierul nu mai are coloanele: ${lipsa.join(", ")}. Alege-le din nou.` };
    }
    const rows = readFeedRows(parsed, mapping, { updatePrice: options.update_price });
    const catalog = await loadCatalog(admin, businessId, options.match_key);
    const plan = buildStockPlan(rows, catalog, {
      matchKey: options.match_key,
      updatePrice: options.update_price,
    });

    const { pending } = await stageStockPlan(admin, importId, businessId, plan);

    const totals: StockTotals = {
      ...EMPTY_STOCK_TOTALS,
      total: plan.totalRows,
      unchanged: plan.unchanged,
      pending,
      ...numaraProbleme(plan.issues),
    };

    await admin
      .from("product_imports")
      .update({
        status: pending > 0 ? "importing" : "completed",
        mapping: mapping as unknown as never,
        options: options as unknown as never,
        totals: totals as unknown as never,
        started_at: new Date().toISOString(),
        ...(pending === 0 ? { finished_at: new Date().toISOString() } : {}),
      })
      .eq("id", importId);

    return { ok: true, pending };
  } catch (e) {
    logError({ action: "startStockFeed", message: e instanceof Error ? e.message : "stage failed", businessId });
    return { error: "Eroare la pregatirea actualizarii" };
  }
}

/** Pasul 4: duce la capat o bucata. Clientul apeleaza in bucla pana la `done`. */
export async function processStockFeedChunk(
  importId: string,
): Promise<{ status: string; totals: StockTotals; done: boolean } | { error: string }> {
  const ctx = await loadOwnedJob(importId);
  if (!ctx.ok) return { error: ctx.error };
  const { admin, businessId } = ctx;

  try {
    const result = await processStockChunk(admin, importId);
    if (result.done) {
      await cleanupRawFile(importId, admin);
      revalidatePath("/dashboard/products");
    }
    return result;
  } catch (e) {
    logError({ action: "processStockFeedChunk", message: e instanceof Error ? e.message : "process failed", businessId });
    await admin
      .from("product_imports")
      .update({ status: "failed", error: "Eroare la procesare", finished_at: new Date().toISOString() })
      .eq("id", importId);
    return { error: "Eroare la procesarea actualizarii" };
  }
}

export async function cancelStockFeed(importId: string): Promise<{ ok: true } | { error: string }> {
  const ctx = await loadOwnedJob(importId);
  if (!ctx.ok) return { error: ctx.error };
  const { admin } = ctx;

  await admin
    .from("product_imports")
    .update({ status: "cancelled", finished_at: new Date().toISOString() })
    .eq("id", importId);
  await cleanupRawFile(importId, admin);
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
