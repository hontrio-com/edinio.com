import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Walk a PostgREST query past the silent 1000-row cap by fetching .range()
 * windows until a short window signals the end.
 *
 * PostgREST caps EVERY response at 1000 rows (Supabase default max-rows) and
 * does not error past the cap — it silently truncates. Any read that needs the
 * complete result set (exports, syncs, sitemap, aggregation inputs) must walk
 * windows. NOTE: the order-scale surfaces (Comenzi, Clienti, dashboard sums)
 * do NOT use this — they paginate/aggregate in SQL; this helper is for the
 * moderate-volume tables where the full set is genuinely needed.
 *
 * The caller builds the query for each window and MUST give it a stable,
 * deterministic ORDER BY (e.g. created_at + id tiebreaker) so rows don't shift
 * between windows while we paginate. Keep windows at 1000 (= max-rows) so a
 * short window reliably means "done".
 *
 * On a mid-walk error: log and return what we have — no worse than the silent
 * truncation this replaces, and the next request retries.
 */
const WINDOW = 1000;

export async function fetchAllRows<T>(
  label: string,
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += WINDOW) {
    const { data, error } = await query(from, from + WINDOW - 1);
    if (error) {
      console.error(`[fetch-all] ${label}: window at ${from} failed:`, error.message);
      break;
    }
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < WINDOW) break;
  }
  return all;
}
