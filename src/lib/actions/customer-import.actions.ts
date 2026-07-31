"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database.types";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { logError } from "@/lib/error-logger";
import type { ParsedCsv } from "@/lib/import/csv";
import { parseTabular } from "@/lib/import/tabular";
import { hasAcceptedExtension } from "@/lib/import/tabular-formats";
import { autoMapCustomerColumns, readCustomerRows } from "@/lib/import/customers/mapping";
import { buildCustomerPlan, customerKey, summarizeCustomerPlan } from "@/lib/import/customers/planner";
import {
  MAX_CUSTOMER_ROWS,
  type CustomerFeedMapping,
  type CustomerPlan,
  type CustomerRowIssue,
  type ExistingCustomer,
} from "@/lib/import/customers/types";

/**
 * Importul de clienti dintr-un fisier.
 *
 * FARA tabel de joburi si FARA fisier pastrat in R2, altfel decat la produse si
 * stocuri. Motivul: un import de clienti e o singura scriere scurta, nu o coada
 * care trebuie reluata de un cron. Fisierul se trimite la fiecare pas, iar la
 * 8MB maximum asta costa mai putin decat un tabel de stare in plus si un cron
 * care sa curete dupa el.
 *
 * Planul se RECALCULEAZA la scriere, nu se ia cel din previzualizare: intre cele
 * doua ecrane cineva poate adauga un client de mana.
 */

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const SAMPLE_SIZE = 8;
/** Cate randuri se scriu deodata. */
const WRITE_BATCH = 500;

type ServerClient = Awaited<ReturnType<typeof createClient>>;

async function getOwnedBusinessId(supabase: ServerClient, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("businesses")
    .select("id")
    .eq("user_id", userId)
    .eq("type", "ministore")
    .order("created_at")
    .limit(1)
    .single();
  return data?.id ?? null;
}

type Owner =
  | { ok: false; error: string }
  | { ok: true; admin: ReturnType<typeof createAdminClient>; businessId: string };

async function requireOwner(): Promise<Owner> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Neautorizat" };

  const businessId = await getOwnedBusinessId(supabase, user.id);
  if (!businessId) return { ok: false, error: "Magazin negasit" };

  return { ok: true, admin: createAdminClient(), businessId };
}

type ReadFileResult = { error: string } | { parsed: ParsedCsv; fileName: string };

/** Citeste fisierul primit, cu aceleasi limite ca la celelalte importuri. */
async function readFile(formData: FormData): Promise<ReadFileResult> {
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Niciun fisier incarcat" as const };
  if (file.size === 0) return { error: "Fisierul este gol" as const };
  if (file.size > MAX_FILE_BYTES) return { error: "Fisierul este prea mare (maximum 8MB)" as const };
  if (!hasAcceptedExtension(file.name)) {
    return { error: "Acceptam fisiere CSV, XLSX sau XLSM" as const };
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch {
    return { error: "Nu am putut citi fisierul" as const };
  }

  const read = await parseTabular(buffer, file.name, MAX_CUSTOMER_ROWS);
  if ("error" in read) return { error: read.error };
  if (read.parsed.truncated) {
    return {
      error: `Fisierul are peste ${MAX_CUSTOMER_ROWS.toLocaleString("ro-RO")} de randuri. Imparte-l in mai multe fisiere.` as const,
    };
  }
  return { parsed: read.parsed, fileName: file.name };
}

export interface CustomerFileInfo {
  fileName: string;
  headers: string[];
  mapping: CustomerFeedMapping;
  sampleRows: Record<string, string>[];
  totalRows: number;
}

/** Pasul 1: citeste antetul si ghiceste coloanele. Nu scrie nimic. */
export async function analyzeCustomerFile(
  formData: FormData,
): Promise<CustomerFileInfo | { error: string }> {
  const owner = await requireOwner();
  if (!owner.ok) return { error: owner.error };

  const read = await readFile(formData);
  if ("error" in read) return { error: read.error };

  return {
    fileName: read.fileName,
    headers: read.parsed.headers,
    mapping: autoMapCustomerColumns(read.parsed.headers),
    sampleRows: read.parsed.rows.slice(0, SAMPLE_SIZE),
    totalRows: read.parsed.rows.length,
  };
}

/**
 * Ce exista deja: fisele de clienti si cheile din comenzi.
 *
 * Cheile din comenzi se aduc ca sa putem SPUNE cati clienti importati au deja
 * comenzi, deci se vor contopi. Se citesc doar telefonul si emailul, si prin
 * `fetchAllRows`, pentru ca Supabase taie silentios la 1000 de randuri.
 */
async function loadExisting(admin: ReturnType<typeof createAdminClient>, businessId: string) {
  const customerRows = await fetchAllRows("customer-import.existing", (from, to) =>
    admin
      .from("customers")
      .select("id, key, name, email, phone, address, city, county, postcode, external_id")
      .eq("business_id", businessId)
      .order("id")
      .range(from, to),
  );

  const existingByKey = new Map<string, ExistingCustomer>();
  for (const r of customerRows as unknown as Record<string, string | null>[]) {
    existingByKey.set(String(r.key), {
      id: String(r.id),
      name: r.name ?? "",
      email: r.email ?? null,
      phone: r.phone ?? null,
      address: r.address ?? null,
      city: r.city ?? null,
      county: r.county ?? null,
      postcode: r.postcode ?? null,
      externalId: r.external_id ?? null,
    });
  }

  const orderRows = await fetchAllRows("customer-import.order-keys", (from, to) =>
    admin
      .from("orders")
      .select("customer_phone, customer_email")
      .eq("business_id", businessId)
      .order("id")
      .range(from, to),
  );

  const orderKeys = new Set<string>();
  for (const r of orderRows as unknown as { customer_phone: string | null; customer_email: string | null }[]) {
    const k = customerKey(r.customer_phone, r.customer_email);
    if (k) orderKeys.add(k);
  }

  return { existingByKey, orderKeys };
}

async function planFromForm(
  formData: FormData,
  admin: ReturnType<typeof createAdminClient>,
  businessId: string,
): Promise<{ plan: CustomerPlan } | { error: string }> {
  const raw = formData.get("mapping");
  if (typeof raw !== "string") return { error: "Lipseste alegerea coloanelor" };

  let mapping: CustomerFeedMapping;
  try {
    mapping = JSON.parse(raw) as CustomerFeedMapping;
  } catch {
    return { error: "Alegerea coloanelor nu a putut fi citita" };
  }

  if (!mapping.email && !mapping.phone) {
    return { error: "Alege cel putin coloana de email sau cea de telefon" };
  }

  const read = await readFile(formData);
  if ("error" in read) return { error: read.error };

  const rows = readCustomerRows(read.parsed, mapping);
  const { existingByKey, orderKeys } = await loadExisting(admin, businessId);
  return { plan: buildCustomerPlan(rows, existingByKey, orderKeys) };
}

export interface CustomerImportPreview {
  summary: ReturnType<typeof summarizeCustomerPlan>;
  sampleNew: { name: string; phone: string | null; email: string | null; city: string | null }[];
  sampleIssues: CustomerRowIssue[];
}

/** Pasul 2: spune exact ce se va scrie. Nu scrie nimic. */
export async function previewCustomerImport(
  formData: FormData,
): Promise<CustomerImportPreview | { error: string }> {
  const owner = await requireOwner();
  if (!owner.ok) return { error: owner.error };

  try {
    const res = await planFromForm(formData, owner.admin, owner.businessId);
    if ("error" in res) return { error: res.error };

    return {
      summary: summarizeCustomerPlan(res.plan),
      sampleNew: res.plan.toInsert.slice(0, SAMPLE_SIZE).map((c) => ({
        name: c.name, phone: c.phone, email: c.email, city: c.city,
      })),
      sampleIssues: res.plan.issues.slice(0, SAMPLE_SIZE),
    };
  } catch (e) {
    logError({ action: "previewCustomerImport", message: e instanceof Error ? e.message : "preview failed", businessId: owner.businessId });
    return { error: "Nu am putut calcula previzualizarea" };
  }
}

export interface CustomerImportResult {
  inserted: number;
  enriched: number;
  skipped: number;
}

/** Pasul 3: scrie. Planul se recalculeaza pe starea de ACUM. */
export async function commitCustomerImport(
  formData: FormData,
): Promise<CustomerImportResult | { error: string }> {
  const owner = await requireOwner();
  if (!owner.ok) return { error: owner.error };
  const { admin, businessId } = owner;

  try {
    const res = await planFromForm(formData, admin, businessId);
    if ("error" in res) return { error: res.error };
    const { plan } = res;

    /*
     * `upsert` cu `ignoreDuplicates`, nu `insert`. Face reimportarea aceluiasi
     * fisier inofensiva si ne apara de cazul in care cineva adauga acelasi client
     * intre previzualizare si scriere: randul se sare, nu cade toata bucata.
     * `key` NU se trimite, e coloana generata de baza.
     */
    let inserted = 0;
    for (let i = 0; i < plan.toInsert.length; i += WRITE_BATCH) {
      const batch = plan.toInsert.slice(i, i + WRITE_BATCH).map((c) => ({
        business_id: businessId,
        name: c.name,
        email: c.email,
        phone: c.phone,
        address: c.address,
        city: c.city,
        county: c.county,
        postcode: c.postcode,
        external_id: c.externalId,
        source: "import",
      }));

      const { data, error } = await admin
        .from("customers")
        .upsert(batch, { onConflict: "business_id,key", ignoreDuplicates: true })
        .select("id");
      if (error) throw new Error(error.message);
      inserted += data?.length ?? 0;
    }

    let enriched = 0;
    for (const up of plan.toUpdate) {
      const patch: Database["public"]["Tables"]["customers"]["Update"] = {};
      if (up.patch.name !== undefined) patch.name = up.patch.name;
      if (up.patch.email !== undefined) patch.email = up.patch.email;
      if (up.patch.phone !== undefined) patch.phone = up.patch.phone;
      if (up.patch.address !== undefined) patch.address = up.patch.address;
      if (up.patch.city !== undefined) patch.city = up.patch.city;
      if (up.patch.county !== undefined) patch.county = up.patch.county;
      if (up.patch.postcode !== undefined) patch.postcode = up.patch.postcode;
      if (up.patch.externalId !== undefined) patch.external_id = up.patch.externalId;
      if (Object.keys(patch).length === 0) continue;

      const { error } = await admin
        .from("customers")
        .update(patch)
        .eq("id", up.id)
        /* Aparare in adancime: un id ratacit nu poate atinge alt magazin. */
        .eq("business_id", businessId);
      if (!error) enriched++;
    }

    revalidatePath("/dashboard/customers");
    return { inserted, enriched, skipped: plan.issues.filter((i) => i.problem === "no_key").length };
  } catch (e) {
    logError({ action: "commitCustomerImport", message: e instanceof Error ? e.message : "commit failed", businessId });
    return { error: "Eroare la scrierea clientilor" };
  }
}
