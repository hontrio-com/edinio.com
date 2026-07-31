import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { StockFeedMapping, StockFeedOptions } from "./types";
import type { StockTotals } from "./committer";

/**
 * Sursele de feed citite automat de la o adresa.
 *
 * Tabelul e creat de `migrations/2026-07-31-stock-feed-sources.sql`, aplicata pe
 * 31 iulie, iar `database.types.ts` a fost regenerat dupa, deci clientul tipizat
 * cunoaste tabelul. Formele de mai jos rimane scrise de mana pentru `mapping` si
 * `options`, care in baza sunt `jsonb`: tipurile generate le dau ca `Json`, iar
 * aici ne trebuie forma lor adevarata.
 */

export const TABLE = "stock_feed_sources";

export type FeedFrequency = "hourly" | "daily";

export interface StockFeedSource {
  id: string;
  business_id: string;
  user_id: string;
  name: string;
  url: string;
  mapping: StockFeedMapping;
  options: StockFeedOptions;
  enabled: boolean;
  frequency: FeedFrequency;
  /** Ora in UTC la care ruleaza sursa zilnica. */
  run_hour: number;
  last_run_at: string | null;
  last_status: "ok" | "error" | null;
  last_error: string | null;
  last_totals: StockTotals | null;
  last_import_id: string | null;
  consecutive_failures: number;
  created_at: string;
  updated_at: string;
}

/** Dupa atatea eșecuri la rand, sursa se dezactiveaza singura. */
export const MAX_FAILURES = 5;

type AnyClient = SupabaseClient<Database>;

/** Tabelul, dintr-un singur loc. */
function table(client: AnyClient) {
  return client.from(TABLE);
}

/*
 * Conversia la granita, si de ce e nevoie de ea.
 *
 * `mapping`, `options` si `last_totals` sunt `jsonb` in baza, iar tipurile
 * generate le dau ca `Json`, adica "orice". Formele adevarate le stim doar noi,
 * din cod. Deci la citire spunem ce e, iar la scriere trecem prin `never`, exact
 * tiparul folosit deja pentru `jsonb` in restul importului.
 *
 * Nu e o gaura de siguranta: valorile scrise vin din tipuri stricte, iar la
 * citire orice forma neasteptata ar fi tot un `jsonb` valid, care oricum trebuie
 * tratat defensiv de apelant.
 */
function asSource(row: unknown): StockFeedSource {
  return row as StockFeedSource;
}

export async function listSources(
  client: AnyClient,
  businessId: string,
): Promise<StockFeedSource[]> {
  const { data, error } = await table(client)
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });

  /* Aruncam, nu inghitim. Cat timp migratia nu e aplicata, tabelul nu exista, iar
     o lista goala ar arata exact ca "n-ai nicio sursa inca" si ar trimite pe
     nimeni nicaieri. */
  if (error) throw new Error(error.message);

  return (data ?? []).map(asSource);
}

export async function getSource(
  client: AnyClient,
  id: string,
): Promise<StockFeedSource | null> {
  const { data } = await table(client).select("*").eq("id", id).maybeSingle();
  return data ? asSource(data) : null;
}

export async function insertSource(
  client: AnyClient,
  row: Pick<StockFeedSource, "business_id" | "user_id" | "name" | "url" | "mapping" | "options" | "frequency" | "run_hour">,
): Promise<{ id: string } | { error: string }> {
  const { data, error } = await table(client).insert(row as never).select("id").single();
  if (error) return { error: error.message };
  return { id: (data as { id: string }).id };
}

export async function patchSource(
  client: AnyClient,
  id: string,
  patch: Partial<Omit<StockFeedSource, "id" | "business_id" | "user_id" | "created_at" | "updated_at">>,
): Promise<{ error?: string }> {
  const { error } = await table(client).update(patch as never).eq("id", id);
  return error ? { error: error.message } : {};
}

export async function removeSource(client: AnyClient, id: string): Promise<{ error?: string }> {
  const { error } = await table(client).delete().eq("id", id);
  return error ? { error: error.message } : {};
}

/**
 * Marcheaza rezultatul unei rulari.
 *
 * O sursa care eșueaza de prea multe ori la rand se stinge singura. O adresa
 * moarta nu trebuie cerută in fiecare zi la nesfarsit, iar comerciantul vede in
 * ecran de ce s-a oprit.
 */
export async function markRun(
  client: AnyClient,
  source: StockFeedSource,
  result:
    | { ok: true; importId: string; totals: StockTotals }
    | { ok: false; error: string },
): Promise<void> {
  if (result.ok) {
    await patchSource(client, source.id, {
      last_run_at: new Date().toISOString(),
      last_status: "ok",
      last_error: null,
      last_totals: result.totals,
      last_import_id: result.importId,
      consecutive_failures: 0,
    });
    return;
  }

  const failures = source.consecutive_failures + 1;
  await patchSource(client, source.id, {
    last_run_at: new Date().toISOString(),
    last_status: "error",
    last_error: result.error,
    consecutive_failures: failures,
    ...(failures >= MAX_FAILURES ? { enabled: false } : {}),
  });
}

/**
 * Sursele care au ce rula acum.
 *
 * Filtrarea se face in cod, nu in SQL, pentru ca regula depinde de ora curenta
 * si de frecventa; scrisa in SQL ar fi fost o conditie greu de citit si de
 * verificat. Sursele active sunt putine, deci nu conteaza.
 */
export function isDue(source: StockFeedSource, now: Date): boolean {
  if (!source.enabled) return false;
  if (!source.last_run_at) return true;

  const last = new Date(source.last_run_at).getTime();
  const elapsedMs = now.getTime() - last;

  if (source.frequency === "hourly") {
    /* 55 de minute, nu 60: cronul nu bate exact la secunda, iar la 60 fix o
       rulare ar fi sarita in fiecare ora in care cronul intarzie putin. */
    return elapsedMs >= 55 * 60 * 1000;
  }

  /* Zilnic: la ora stabilita, si doar daca n-a mai rulat in ultimele 23 de ore. */
  if (now.getUTCHours() !== source.run_hour) return false;
  return elapsedMs >= 23 * 60 * 60 * 1000;
}

export async function dueSources(
  client: AnyClient,
  now: Date,
  limit: number,
): Promise<StockFeedSource[]> {
  const { data } = await table(client)
    .select("*")
    .eq("enabled", true)
    .order("last_run_at", { ascending: true, nullsFirst: true })
    .limit(200);

  return (data ?? []).map(asSource).filter((s) => isDue(s, now)).slice(0, limit);
}
