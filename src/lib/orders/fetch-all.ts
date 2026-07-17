import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/**
 * Fetch every order of a business, past PostgREST's silent 1000-row cap.
 *
 * Supabase caps each response at 1000 rows (max-rows) and does NOT error when a
 * query matches more — it silently truncates. Pages that aggregate a store's
 * full order history (Comenzi, Clienti) must walk .range() windows or their
 * lists and totals go quietly wrong once a store passes 1000 orders.
 *
 * Windows are walked oldest-first with an id tiebreaker so orders placed while
 * we paginate append after the last window instead of shifting rows between
 * windows; the result is returned newest-first, as the dashboard lists expect.
 * On a mid-walk error we log and return what we have — no worse than the empty
 * state the pages rendered before, and the next refresh retries.
 */
const BATCH_SIZE = 1000; // keep equal to Supabase max-rows: a short window is the end-of-data signal

export async function fetchAllOrders<T>(
  supabase: SupabaseClient<Database>,
  businessId: string,
  columns: string
): Promise<T[]> {
  const all: unknown[] = [];
  for (let from = 0; ; from += BATCH_SIZE) {
    const { data, error } = await supabase
      .from("orders")
      .select(columns)
      .eq("business_id", businessId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + BATCH_SIZE - 1);
    if (error) {
      console.error("[orders] fetchAllOrders window failed:", error.message, { businessId, from });
      break;
    }
    const rows = (data ?? []) as unknown[];
    all.push(...rows);
    if (rows.length < BATCH_SIZE) break;
  }
  return all.reverse() as T[];
}
