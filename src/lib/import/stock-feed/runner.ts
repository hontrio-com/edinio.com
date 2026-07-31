import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { parseCsv } from "@/lib/import/csv";
import { safeFetchText } from "@/lib/import/ssrf";
import { loadCatalog } from "./catalog";
import { buildStockPlan } from "./matcher";
import { readFeedRows } from "./mapping";
import {
  EMPTY_STOCK_TOTALS,
  processStockChunk,
  stageStockPlan,
  type StockTotals,
} from "./committer";
import { markRun, type StockFeedSource } from "./sources";

/**
 * Rularea unei surse: citeste adresa, calculeaza planul, scrie.
 *
 * Fiecare rulare isi face propriul rand in `product_imports`, cu
 * `source = 'stock_csv'`. Asa apare in acelasi istoric ca incarcarile manuale si
 * foloseste acelasi raport de erori descarcabil, fara cod in plus.
 *
 * Rularea are un TERMEN. Cronul are un minut, iar un feed mare nu incape.
 * Ce nu apuca sa scrie rimane in `importing`, iar tura urmatoare a cronului
 * continua exact de unde s-a oprit: randurile ramase sunt tot acolo, cu status
 * `pending`.
 */

type Client = SupabaseClient<Database>;

export interface RunResult {
  ok: boolean;
  importId?: string;
  totals?: StockTotals;
  error?: string;
  /** A ramas de lucru: cronul urmator continua acelasi job. */
  unfinished?: boolean;
}

export async function runSource(
  admin: Client,
  source: StockFeedSource,
  deadline: number,
): Promise<RunResult> {
  /* ── Citirea adresei ── */
  const fetched = await safeFetchText(source.url);
  if ("error" in fetched) {
    await markRun(admin, source, { ok: false, error: fetched.error });
    return { ok: false, error: fetched.error };
  }

  let parsed: ReturnType<typeof parseCsv>;
  try {
    parsed = parseCsv(fetched.text);
  } catch {
    const error = "Fisierul de la adresa nu poate fi citit ca CSV";
    await markRun(admin, source, { ok: false, error });
    return { ok: false, error };
  }

  if (parsed.headers.length === 0 || parsed.rows.length === 0) {
    const error = "Fisierul de la adresa e gol sau nu are antet";
    await markRun(admin, source, { ok: false, error });
    return { ok: false, error };
  }

  if (!source.mapping.identifier) {
    const error = "Sursa nu are aleasa coloana cu identificatorul";
    await markRun(admin, source, { ok: false, error });
    return { ok: false, error };
  }

  /* ── Planul, calculat pe catalogul de ACUM ── */
  const rows = readFeedRows(parsed, source.mapping, {
    updatePrice: source.options.update_price,
  });
  const catalog = await loadCatalog(admin, source.business_id, source.options.match_key);
  const plan = buildStockPlan(rows, catalog, {
    matchKey: source.options.match_key,
    updatePrice: source.options.update_price,
  });

  /* ── Jobul, in acelasi tabel ca incarcarile manuale ── */
  const { data: job, error: jobErr } = await admin
    .from("product_imports")
    .insert({
      business_id: source.business_id,
      user_id: source.user_id,
      source: "stock_csv",
      status: plan.changes.length > 0 ? "importing" : "completed",
      file_name: source.name || source.url,
      mapping: source.mapping as unknown as never,
      options: source.options as unknown as never,
      totals: {
        ...EMPTY_STOCK_TOTALS,
        total: plan.totalRows,
        unchanged: plan.unchanged,
        pending: plan.changes.length,
      } as unknown as never,
      started_at: new Date().toISOString(),
      ...(plan.changes.length === 0 ? { finished_at: new Date().toISOString() } : {}),
    })
    .select("id")
    .single();

  if (jobErr || !job) {
    const error = jobErr?.message ?? "Nu am putut initia actualizarea";
    await markRun(admin, source, { ok: false, error });
    return { ok: false, error };
  }

  try {
    await stageStockPlan(admin, job.id, source.business_id, plan);
  } catch (e) {
    const error = e instanceof Error ? e.message : "Eroare la pregatire";
    await admin
      .from("product_imports")
      .update({ status: "failed", error, finished_at: new Date().toISOString() })
      .eq("id", job.id);
    await markRun(admin, source, { ok: false, error });
    return { ok: false, error };
  }

  /* ── Scrierea, pana la termen ── */
  let totals: StockTotals = {
    ...EMPTY_STOCK_TOTALS,
    total: plan.totalRows,
    unchanged: plan.unchanged,
    pending: plan.changes.length,
  };
  let done = plan.changes.length === 0;

  while (!done && Date.now() < deadline) {
    const res = await processStockChunk(admin, job.id);
    totals = res.totals;
    done = res.done;
  }

  /*
   * Sursa se marcheaza ca reusita si cand a ramas de lucru: adresa a fost citita,
   * planul e scris in randuri, iar restul se termina la tura urmatoare. Marcata ca
   * eșec, ar fi numarat degeaba spre dezactivarea automata.
   */
  await markRun(admin, source, { ok: true, importId: job.id, totals });

  return { ok: true, importId: job.id, totals, unfinished: !done };
}

/**
 * Continua joburile de stoc ramase neterminate.
 *
 * Cronul de importuri de produse nu le atinge, pentru ca filtreaza pe o lista
 * permisa de surse. Deci feedurile de stoc au nevoie de propria plasa: o pagina
 * inchisa la mijlocul unei incarcari manuale ar lasa altfel jobul blocat pe veci.
 */
export async function resumeStalledStockJobs(
  admin: Client,
  deadline: number,
  staleMs: number,
): Promise<number> {
  const staleBefore = new Date(Date.now() - staleMs).toISOString();

  const { data: jobs } = await admin
    .from("product_imports")
    .select("id")
    .eq("source", "stock_csv")
    .eq("status", "importing")
    .lt("updated_at", staleBefore)
    .order("created_at", { ascending: true })
    .limit(5);

  let resumed = 0;
  for (const job of jobs ?? []) {
    if (Date.now() >= deadline) break;
    resumed++;
    let done = false;
    while (!done && Date.now() < deadline) {
      const res = await processStockChunk(admin, job.id);
      done = res.done;
    }
  }
  return resumed;
}
