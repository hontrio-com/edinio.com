import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { applyStockPlan } from "./applier";
import type { StockChange, StockPlan } from "./types";

/**
 * Punerea planului in randuri si procesarea pe bucati.
 *
 * Refoloseste `product_import_rows`, tabelul importului de produse. Motivul nu e
 * economia de un tabel, ci ca vin la pachet lucruri care altfel s-ar scrie de la
 * zero: urmarirea progresului, reluarea dupa o pagina inchisa si raportul de
 * erori descarcabil de la `/api/imports/[id]/error-report`.
 *
 * Ca raportul acela sa functioneze si aici, fara sa fie modificat, fiecare rand
 * pune un `name` in `parsed` si codul din fisier in `external_id`: exact
 * coloanele pe care le citeste el.
 */

type Client = SupabaseClient<Database>;

/** Cate randuri se scriu deodata la stagiere. */
const STAGE_BATCH = 500;
/** Cate scrieri se duc la capat intr-o singura trecere. */
export const STOCK_CHUNK = 300;

export interface StockTotals {
  /** Randuri citite din fisier. */
  total: number;
  /** Scrieri reusite. */
  written: number;
  /** Potrivite, dar cu aceleasi valori. */
  unchanged: number;
  not_found: number;
  ambiguous: number;
  invalid: number;
  duplicate: number;
  /** Scrieri care au esuat. */
  failed: number;
  /** Cate mai sunt de scris. */
  pending: number;
}

export const EMPTY_STOCK_TOTALS: StockTotals = {
  total: 0,
  written: 0,
  unchanged: 0,
  not_found: 0,
  ambiguous: 0,
  invalid: 0,
  duplicate: 0,
  failed: 0,
  pending: 0,
};

/** Numele afisat pentru un rand, in raport si in previzualizare. */
function displayName(change: StockChange): string {
  return change.variantTitle
    ? `${change.productName} (${change.variantTitle})`
    : change.productName;
}

/**
 * Scrie planul in randuri.
 *
 * Si problemele intra, nu doar scrierile: un rand negasit sau ambiguu trebuie sa
 * ajunga in raportul descarcabil, altfel omul nu are de unde sa afle care coduri
 * din fisierul lui n-au prins nimic.
 */
export async function stageStockPlan(
  admin: Client,
  importId: string,
  businessId: string,
  plan: StockPlan,
): Promise<{ pending: number }> {
  /* Reluare curata: stergem ce a rimas de la o incercare anterioara. */
  await admin.from("product_import_rows").delete().eq("import_id", importId);

  const rows: Record<string, unknown>[] = [];

  for (const change of plan.changes) {
    rows.push({
      import_id: importId,
      business_id: businessId,
      row_index: change.rowIndex,
      external_id: change.identifier,
      parsed: { ...change, name: displayName(change) },
      product_id: change.productId,
      status: "pending",
    });
  }

  for (const issue of plan.issues) {
    rows.push({
      import_id: importId,
      business_id: businessId,
      row_index: issue.rowIndex,
      external_id: issue.identifier,
      parsed: { name: issue.identifier, problem: issue.problem },
      status: "skipped",
      error: issue.detail,
    });
  }

  for (let i = 0; i < rows.length; i += STAGE_BATCH) {
    const { error } = await admin
      .from("product_import_rows")
      .insert(rows.slice(i, i + STAGE_BATCH) as never);
    if (error) throw new Error(error.message);
  }

  return { pending: plan.changes.length };
}

/** Numara randurile pe status. Interogari de numarare, deci cifre exacte. */
async function countTotals(
  admin: Client,
  importId: string,
  plan: { total: number; unchanged: number },
): Promise<StockTotals> {
  const statuses = ["pending", "updated", "failed", "skipped"] as const;
  const counts: Record<string, number> = {};
  for (const status of statuses) {
    const { count: c } = await admin
      .from("product_import_rows")
      .select("id", { count: "exact", head: true })
      .eq("import_id", importId)
      .eq("status", status);
    counts[status] = c ?? 0;
  }

  /* Problemele se numara pe tip, din `parsed.problem`. */
  const { data: skipped } = await admin
    .from("product_import_rows")
    .select("parsed")
    .eq("import_id", importId)
    .eq("status", "skipped");

  const byProblem = { not_found: 0, ambiguous: 0, invalid: 0, duplicate: 0 };
  for (const row of skipped ?? []) {
    const problem = (row.parsed as { problem?: string } | null)?.problem;
    if (problem && problem in byProblem) byProblem[problem as keyof typeof byProblem]++;
  }

  return {
    total: plan.total,
    written: counts.updated ?? 0,
    unchanged: plan.unchanged,
    failed: counts.failed ?? 0,
    pending: counts.pending ?? 0,
    ...byProblem,
  };
}

/**
 * Duce la capat o bucata din plan.
 *
 * Bucatile merg una dupa alta, niciodata deodata: asa doua bucati nu pot scrie in
 * acelasi produs in acelasi timp, iar citirea si rescrierea JSON-ului de variante
 * rimane in siguranta.
 */
export async function processStockChunk(
  admin: Client,
  importId: string,
): Promise<{ status: string; totals: StockTotals; done: boolean }> {
  const { data: job } = await admin
    .from("product_imports")
    .select("id, business_id, source, status, options, totals")
    .eq("id", importId)
    .single();

  if (!job) return { status: "failed", totals: EMPTY_STOCK_TOTALS, done: true };

  /* Bariera: acest committer scrie stocuri, nu creeaza produse. */
  if (job.source !== "stock_csv") {
    return { status: job.status, totals: EMPTY_STOCK_TOTALS, done: true };
  }

  const stored = (job.totals as Partial<StockTotals> | null) ?? {};
  const base = { total: stored.total ?? 0, unchanged: stored.unchanged ?? 0 };

  if (job.status !== "importing") {
    return { status: job.status, totals: await countTotals(admin, importId, base), done: true };
  }

  const { data: pending } = await admin
    .from("product_import_rows")
    .select("id, parsed")
    .eq("import_id", importId)
    .eq("status", "pending")
    .order("row_index", { ascending: true })
    .limit(STOCK_CHUNK);

  if (pending && pending.length > 0) {
    /*
     * Legatura rand-din-tabel <-> schimbare se face pe `row_index`, NU pe
     * identitatea obiectului. Un `Map` cu chei obiect ar merge azi, pentru ca
     * scriitorul intoarce exact referintele primite, dar ar ceda in ziua in care
     * ar intoarce copii: randurile ar rimane la nesfarsit "in asteptare", iar
     * bucla clientului s-ar inverti degeaba.
     */
    const rowIdByIndex = new Map<number, string>();
    const changes: StockChange[] = [];
    for (const row of pending) {
      const change = row.parsed as unknown as StockChange;
      rowIdByIndex.set(change.rowIndex, row.id);
      changes.push(change);
    }

    const outcome = await applyStockPlan(admin, job.business_id, changes);

    const resolved = new Set<number>();

    for (const change of outcome.written) {
      const id = rowIdByIndex.get(change.rowIndex);
      if (!id) continue;
      resolved.add(change.rowIndex);
      await admin.from("product_import_rows").update({ status: "updated", error: null }).eq("id", id);
    }
    for (const { change, message } of outcome.failed) {
      const id = rowIdByIndex.get(change.rowIndex);
      if (!id) continue;
      resolved.add(change.rowIndex);
      await admin.from("product_import_rows").update({ status: "failed", error: message }).eq("id", id);
    }

    /*
     * Plasa de siguranta contra buclei infinite. Daca un rand nu primeste nici
     * reusita, nici eroare, ar rimane "in asteptare" pe veci si bucla ar cere
     * mereu aceeasi bucata. Mai bine il inchidem ca eroare, cu un mesaj cinstit.
     */
    for (const [rowIndex, id] of rowIdByIndex) {
      if (resolved.has(rowIndex)) continue;
      await admin
        .from("product_import_rows")
        .update({ status: "failed", error: "Randul nu a primit niciun rezultat la scriere" })
        .eq("id", id);
    }
  }

  const totals = await countTotals(admin, importId, base);
  const done = totals.pending === 0;
  const status = done ? (totals.failed > 0 ? "completed_with_errors" : "completed") : "importing";

  await admin
    .from("product_imports")
    .update({
      status,
      totals: totals as unknown as never,
      ...(done ? { finished_at: new Date().toISOString() } : {}),
    })
    .eq("id", importId);

  return { status, totals, done };
}
