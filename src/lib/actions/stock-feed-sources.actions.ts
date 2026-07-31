"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { parseCsv } from "@/lib/import/csv";
import { safeFetchText } from "@/lib/import/ssrf";
import { autoMapStockColumns } from "@/lib/import/stock-feed/mapping";
import { runSource } from "@/lib/import/stock-feed/runner";
import {
  getSource, insertSource, listSources, patchSource, removeSource,
  type FeedFrequency, type StockFeedSource,
} from "@/lib/import/stock-feed/sources";
import {
  DEFAULT_STOCK_OPTIONS,
  type StockFeedMapping, type StockFeedOptions,
} from "@/lib/import/stock-feed/types";

/**
 * Sursele de feed citite automat.
 *
 * Verificarea proprietarului se face explicit, cu clientul de administrare, la
 * fel ca in restul actiunilor de import. Politicile RLS din migratie sunt un al
 * doilea strat, nu singurul.
 */

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

type Owner =
  | { ok: false; error: string }
  | { ok: true; admin: ReturnType<typeof createAdminClient>; businessId: string; userId: string };

async function requireOwner(): Promise<Owner> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Neautorizat" };

  const businessId = await getOwnedBusinessId(supabase, user.id);
  if (!businessId) return { ok: false, error: "Magazin negasit" };

  return { ok: true, admin: createAdminClient(), businessId, userId: user.id };
}

/** Sursa cerută, doar daca e a magazinului celui care intreaba. */
async function requireOwnedSource(id: string) {
  const owner = await requireOwner();
  if (!owner.ok) return owner;

  const source = await getSource(owner.admin, id);
  if (!source || source.business_id !== owner.businessId) {
    return { ok: false as const, error: "Sursa negasita" };
  }
  return { ...owner, source };
}

function validUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function listStockFeedSources(): Promise<StockFeedSource[] | { error: string }> {
  const owner = await requireOwner();
  if (!owner.ok) return { error: owner.error };
  try {
    return await listSources(owner.admin, owner.businessId);
  } catch (e) {
    logError({ action: "listStockFeedSources", message: e instanceof Error ? e.message : "list failed", businessId: owner.businessId });
    return { error: "Nu am putut citi sursele" };
  }
}

export interface ProbeResult {
  headers: string[];
  mapping: StockFeedMapping;
  sampleRows: Record<string, string>[];
  totalRows: number;
}

/**
 * Citeste adresa o singura data, ca omul sa poata alege coloanele.
 *
 * Nu salveaza nimic si nu atinge catalogul. Descarcarea trece prin
 * `safeFetchText`, deci o adresa care duce in reteaua interna e refuzata.
 */
export async function probeStockFeedUrl(url: string): Promise<ProbeResult | { error: string }> {
  const owner = await requireOwner();
  if (!owner.ok) return { error: owner.error };
  if (!validUrl(url)) return { error: "Adresa trebuie sa inceapa cu http sau https" };

  const fetched = await safeFetchText(url);
  if ("error" in fetched) return { error: fetched.error };

  try {
    const parsed = parseCsv(fetched.text);
    if (parsed.headers.length === 0) return { error: "Fisierul nu are un antet valid" };
    if (parsed.rows.length === 0) return { error: "Fisierul nu contine randuri" };

    return {
      headers: parsed.headers,
      mapping: autoMapStockColumns(parsed.headers),
      sampleRows: parsed.rows.slice(0, 8),
      totalRows: parsed.rows.length,
    };
  } catch {
    return { error: "Fisierul de la adresa nu poate fi citit ca CSV" };
  }
}

export interface SaveSourceInput {
  id?: string;
  name: string;
  url: string;
  mapping: StockFeedMapping;
  options: StockFeedOptions;
  frequency: FeedFrequency;
  run_hour: number;
  enabled?: boolean;
}

export async function saveStockFeedSource(
  input: SaveSourceInput,
): Promise<{ id: string } | { error: string }> {
  const owner = await requireOwner();
  if (!owner.ok) return { error: owner.error };

  if (!validUrl(input.url)) return { error: "Adresa trebuie sa inceapa cu http sau https" };
  if (!input.mapping.identifier) return { error: "Alege coloana cu identificatorul produsului" };
  if (!input.mapping.stock && !(input.options.update_price && input.mapping.price)) {
    return { error: "Alege cel putin coloana de stoc" };
  }
  const hour = Number.isInteger(input.run_hour) && input.run_hour >= 0 && input.run_hour <= 23
    ? input.run_hour
    : 4;

  const payload = {
    name: input.name.trim().slice(0, 120),
    url: input.url.trim(),
    mapping: input.mapping,
    options: { ...DEFAULT_STOCK_OPTIONS, ...input.options },
    frequency: input.frequency,
    run_hour: hour,
  };

  try {
    if (input.id) {
      const found = await requireOwnedSource(input.id);
      if (!found.ok) return { error: found.error };

      const res = await patchSource(owner.admin, input.id, {
        ...payload,
        ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
        /* O sursa reparata de om porneste de la zero: altfel ar rimane aproape
           de dezactivarea automata din cauza eșecurilor de dinainte. */
        consecutive_failures: 0,
      });
      if (res.error) return { error: res.error };
      return { id: input.id };
    }

    const res = await insertSource(owner.admin, {
      business_id: owner.businessId,
      user_id: owner.userId,
      ...payload,
    });
    if ("error" in res) return { error: res.error };
    return { id: res.id };
  } catch (e) {
    logError({ action: "saveStockFeedSource", message: e instanceof Error ? e.message : "save failed", businessId: owner.businessId });
    return { error: "Nu am putut salva sursa" };
  }
}

export async function setStockFeedSourceEnabled(
  id: string,
  enabled: boolean,
): Promise<{ ok: true } | { error: string }> {
  const found = await requireOwnedSource(id);
  if (!found.ok) return { error: found.error };

  const res = await patchSource(found.admin, id, {
    enabled,
    ...(enabled ? { consecutive_failures: 0 } : {}),
  });
  return res.error ? { error: res.error } : { ok: true };
}

export async function deleteStockFeedSource(id: string): Promise<{ ok: true } | { error: string }> {
  const found = await requireOwnedSource(id);
  if (!found.ok) return { error: found.error };

  const res = await removeSource(found.admin, id);
  return res.error ? { error: res.error } : { ok: true };
}

/**
 * Ruleaza sursa acum.
 *
 * Are un termen mai scurt decat cronul, ca actiunea sa nu depaseasca limita de
 * timp a serverului. Ce nu apuca sa scrie rimane pentru tura urmatoare a cronului.
 */
export async function runStockFeedSourceNow(
  id: string,
): Promise<{ ok: true; unfinished: boolean } | { error: string }> {
  const found = await requireOwnedSource(id);
  if (!found.ok) return { error: found.error };

  try {
    const res = await runSource(found.admin, found.source, Date.now() + 25 * 1000);
    if (!res.ok) return { error: res.error ?? "Rularea a eșuat" };
    return { ok: true, unfinished: res.unfinished === true };
  } catch (e) {
    logError({ action: "runStockFeedSourceNow", message: e instanceof Error ? e.message : "run failed", businessId: found.businessId });
    return { error: "Rularea a eșuat" };
  }
}
