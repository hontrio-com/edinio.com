import type { SupabaseClient } from "@supabase/supabase-js";
import { dupaRaspuns } from "@/lib/marketplace/dupa-raspuns";
import type { Database } from "@/types/database.types";
import { applyStockPlan } from "./applier";
import { enqueueTrendyolInventoryMany } from "@/lib/trendyol/queue";
import { enqueueEmagStocMany } from "@/lib/emag/queue";
import { enqueueAboutYouStockMany } from "@/lib/aboutyou/queue";
import type { StockChange, StockPlan, StockRowIssue } from "./types";

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
  /** Randuri potrivite a caror scriere n-ar ajunge nicaieri. Vezi `StockRowProblem`. */
  ignored: number;
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
  ignored: 0,
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
  /* Reluare curata: stergem ce a ramas de la o incercare anterioara. */
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

/** Contoarele de probleme, numarate din problemele planului. */
export function numaraProbleme(issues: StockRowIssue[]): NumarProbleme {
  const out: NumarProbleme = { ...FARA_PROBLEME };
  for (const issue of issues) {
    if (issue.problem in out) out[issue.problem as keyof NumarProbleme]++;
  }
  return out;
}

/** Contoarele de probleme, asa cum le-a calculat planul. */
export type NumarProbleme = Pick<
  StockTotals,
  "not_found" | "ambiguous" | "invalid" | "duplicate" | "ignored"
>;

export const FARA_PROBLEME: NumarProbleme = {
  not_found: 0,
  ambiguous: 0,
  invalid: 0,
  duplicate: 0,
  ignored: 0,
};

/**
 * Numara randurile pe status. Interogari de numarare, deci cifre exacte.
 *
 * Contoarele de PROBLEME nu se mai numara din tabel: vin din plan si se poarta
 * mai departe prin `totals`. Doua motive, amandoua masurate:
 *
 * - interogarea veche aducea randurile `skipped` cu `.select("parsed")` fara
 *   paginare, iar PostgREST taie SILENTIOS la 1000 de randuri. In productie
 *   exista deja 3.674 de randuri `skipped`, deci cifrele raportate erau mai mici
 *   decat cele adevarate — si nu aveau cum sa arate a greseala.
 * - se repeta la FIECARE bucata, desi randurile `skipped` se scriu o singura
 *   data, la stagiere, si nu se mai schimba niciodata.
 */
async function countTotals(
  admin: Client,
  importId: string,
  base: { total: number; unchanged: number } & NumarProbleme,
): Promise<StockTotals> {
  const statuses = ["pending", "updated", "failed"] as const;
  const counts: Record<string, number> = {};

  for (const status of statuses) {
    const { count, error } = await admin
      .from("product_import_rows")
      .select("id", { count: "exact", head: true })
      .eq("import_id", importId)
      .eq("status", status);

    /*
     * Eroarea se ARUNCA, nu se inghite.
     *
     * Inainte: `const { count: c } = ...; counts[status] = c ?? 0`. La orice
     * eroare — retea, termen de instructiune, PostgREST picat — `count` iesea
     * `null`, deci `pending` devenea 0, `done` devenea `true`, iar jobul era
     * trecut pe „completed" cu `finished_at` pus. Randurile `pending` ramaneau in
     * tabel si nu le mai lua nimeni niciodata: stocurile neajunse ramaneau vechi,
     * iar ecranul spunea ca s-a terminat cu bine.
     *
     * Aruncarea e prinsa mai sus si lasa jobul in `importing`, deci tura
     * urmatoare il reia — exact ce trebuie sa se intample.
     */
    if (error) {
      throw new Error(`Nu am putut numara randurile (${status}): ${error.message}`);
    }
    counts[status] = count ?? 0;
  }

  return {
    total: base.total,
    written: counts.updated ?? 0,
    unchanged: base.unchanged,
    failed: counts.failed ?? 0,
    pending: counts.pending ?? 0,
    not_found: base.not_found,
    ambiguous: base.ambiguous,
    invalid: base.invalid,
    duplicate: base.duplicate,
    ignored: base.ignored,
  };
}

/**
 * Duce la capat o bucata din plan.
 *
 * Bucatile merg una dupa alta, niciodata deodata: asa doua bucati nu pot scrie in
 * acelasi produs in acelasi timp, iar citirea si rescrierea JSON-ului de variante
 * ramane in siguranta.
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
  const base = {
    total: stored.total ?? 0,
    unchanged: stored.unchanged ?? 0,
    /* Scrise o data, la stagiere. Vezi `countTotals`. */
    not_found: stored.not_found ?? 0,
    ambiguous: stored.ambiguous ?? 0,
    invalid: stored.invalid ?? 0,
    duplicate: stored.duplicate ?? 0,
    ignored: stored.ignored ?? 0,
  };

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
     * ar intoarce copii: randurile ar ramane la nesfarsit "in asteptare", iar
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

    /*
     * ⚠ MARKETPLACE-URILE AFLA CE S-A SCHIMBAT. Aici a fost defectul gasit 22.08.
     *
     * `applyStockPlan` scrie stocul (si pretul, cand sursa are voie) direct in
     * `products` si nu anunta pe nimeni. Toate celelalte cai de modificare o fac:
     * editarea unui produs, actiunea in masa, scaderea de stoc la o comanda.
     * Feedul, nu.
     *
     * Ce a insemnat la VetDepo: listarile pe Trendyol s-au facut pe 19.08, iar de
     * atunci feedul a schimbat stocul in fiecare zi, in Edinio. La Trendyol a
     * ramas cantitatea de la listare, la nesfarsit. Comerciantul vedea stoc in
     * panoul lui si zero la ei, fara nicio urma care sa explice de ce.
     *
     * Se anunta doar produsele CHIAR scrise (`outcome.written`), nu tot lotul:
     * un rand care n-a schimbat nimic n-are ce impinge, iar cozile pun oricum
     * doar produsele care au listare.
     *
     * `void`, ca la toate celelalte apeluri de acest fel: o pana la un
     * marketplace n-are voie sa opreasca importul de stoc. Esecul se scrie acum
     * in `error_logs` (vezi `trendyol/queue.ts`), deci nu mai dispare in tacere.
     */
    const atinse = [...new Set(outcome.written.map((c) => c.productId))];
    if (atinse.length > 0) {
      dupaRaspuns(() => enqueueTrendyolInventoryMany(job.business_id, atinse), "enqueueTrendyolInventoryMany", job.business_id);
      dupaRaspuns(() => enqueueEmagStocMany(job.business_id, atinse), "enqueueEmagStocMany", job.business_id);
      dupaRaspuns(() => enqueueAboutYouStockMany(job.business_id, atinse), "enqueueAboutYouStockMany", job.business_id);
    }

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
     * reusita, nici eroare, ar ramane "in asteptare" pe veci si bucla ar cere
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
      /*
       * `updated_at` se scrie AICI, la fiecare bucata.
       *
       * `resumeStalledStockJobs` alege joburile cu `.lt("updated_at", ...)`, pe
       * premisa (imprumutata de la importul de produse) ca o bucla vie tine
       * campul proaspat. Committer-ul de STOC nu-l scria niciodata si nu exista
       * niciun declansator pe `product_imports`, deci `updated_at` ramanea la
       * clipa insertului: un job viu, care tocmai scria, arata ca unul mort de
       * ore, si putea fi luat in paralel de reluare.
       */
      updated_at: new Date().toISOString(),
      ...(done ? { finished_at: new Date().toISOString() } : {}),
    })
    .eq("id", importId);

  return { status, totals, done };
}
