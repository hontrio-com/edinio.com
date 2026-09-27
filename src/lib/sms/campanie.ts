import type { SupabaseClient } from "@supabase/supabase-js";
import { partiSms } from "./mesaj";

/*
  Ajutoarele campaniilor SMS (27.09.2026). NU e un fisier "use server": nimic de
  aici nu devine capat public. Le folosesc actiunile din `sms.actions.ts` si
  pagina, DUPA verificarea proprietarului.
*/

export interface SmsFilters {
  date_from?: string;
  date_to?: string;
  counties?: string[];
  min_amount?: number;
  order_statuses?: string[];
  /** Au cumparat din categoria asta (numele categoriei, ca in produse). */
  categorie?: string;
  /** Cel putin atatea comenzi (clientii fideli). */
  min_comenzi?: number;
  /** Nicio comanda in ultimele N zile (clientii de recastigat). */
  inactivi_zile?: number;
}

const STARI = new Set(["pending", "confirmed", "processing", "shipped", "delivered", "cancelled", "refunded"]);
const DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Filtrele, curatate inainte sa ajunga in SQL. Vin din browser: o data scrisa
 * gresit ar fi aruncat in functia din baza, iar o lista uriasa ar fi ingreunat-o.
 */
export function curataFiltre(f: unknown): SmsFilters {
  const x = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
  const r: SmsFilters = {};
  if (typeof x.date_from === "string" && DATA.test(x.date_from)) r.date_from = x.date_from;
  if (typeof x.date_to === "string" && DATA.test(x.date_to)) r.date_to = x.date_to;
  const numar = (v: unknown, max: number) => {
    const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
    return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), max) : undefined;
  };
  const suma = numar(x.min_amount, 10_000_000); if (suma) r.min_amount = suma;
  const minC = numar(x.min_comenzi, 1000); if (minC) r.min_comenzi = minC;
  const inact = numar(x.inactivi_zile, 3650); if (inact) r.inactivi_zile = inact;
  if (Array.isArray(x.order_statuses)) {
    const s = x.order_statuses.filter((v): v is string => typeof v === "string" && STARI.has(v));
    if (s.length) r.order_statuses = [...new Set(s)];
  }
  if (Array.isArray(x.counties)) {
    const c = x.counties.filter((v): v is string => typeof v === "string" && v.length <= 60).slice(0, 50);
    if (c.length) r.counties = [...new Set(c)];
  }
  if (typeof x.categorie === "string" && x.categorie.trim() && x.categorie.length <= 150) r.categorie = x.categorie.trim();
  return r;
}

/** `753639611` -> `07•• ••• 611`: exemplele din previzualizare, fara numarul intreg pe ecran. */
export function telefonMascat(normalizat: string): string {
  const t = String(normalizat ?? "");
  return t.length >= 3 ? `07•• ••• ${t.slice(-3)}` : "07•• ••• •••";
}

/**
 * Pretul unei PARTI de SMS, din ultimele trimiteri ale magazinului: costul spus de
 * SMSO pe mesaj, impartit la partile lui. `null` = nu stim inca (se foloseste
 * pretul lor public).
 */
export async function pretParteDinJurnal(admin: SupabaseClient, businessId: string): Promise<number | null> {
  const { data } = await admin
    .from("notice_sms_log")
    .select("cost_eurocenti, message")
    .eq("business_id", businessId).eq("provider", "smso").gt("cost_eurocenti", 0)
    .order("created_at", { ascending: false }).limit(50);
  const preturi = ((data ?? []) as { cost_eurocenti: number | null; message: string | null }[])
    .map((r) => Number(r.cost_eurocenti) / partiSms(r.message ?? "").parti)
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  if (!preturi.length) return null;
  return Math.round(preturi[Math.floor(preturi.length / 2)] * 100) / 100;
}

export interface StatisticiSms {
  lunaTrimise: number;
  lunaCostEurocenti: number;
  livrate30: number;
  nelivrate30: number;
  dezabonati: number;
  pretParteEurocenti: number | null;
}

/** Cifrele din capul paginii. `admin` = client de serviciu, dupa verificarea proprietarului. */
export async function statisticiSms(admin: SupabaseClient, businessId: string): Promise<StatisticiSms> {
  const [{ data }, pret] = await Promise.all([
    admin.rpc("sms_statistici" as never, { p_business: businessId } as never),
    pretParteDinJurnal(admin, businessId),
  ]);
  const s = (data ?? {}) as Record<string, number | null>;
  return {
    lunaTrimise: Number(s.luna_trimise ?? 0),
    lunaCostEurocenti: Number(s.luna_cost_eurocenti ?? 0),
    livrate30: Number(s.livrate_30 ?? 0),
    nelivrate30: Number(s.nelivrate_30 ?? 0),
    dezabonati: Number(s.dezabonati ?? 0),
    pretParteEurocenti: pret,
  };
}

export interface StareCampanie {
  de_trimis: number; in_lucru: number; trimis: number; esuat: number; sarit: number; necunoscut: number;
  livrate: number; nelivrate: number; cost_eurocenti: number;
}

export async function stareaCampaniei(admin: SupabaseClient, campaignId: string): Promise<StareCampanie> {
  const { data } = await admin.rpc("sms_campanie_stare" as never, { p_campaign: campaignId } as never);
  const s = (data ?? {}) as Record<string, number | null>;
  const n = (k: string) => Number(s[k] ?? 0);
  return {
    de_trimis: n("de_trimis"), in_lucru: n("in_lucru"), trimis: n("trimis"), esuat: n("esuat"),
    sarit: n("sarit"), necunoscut: n("necunoscut"), livrate: n("livrate"), nelivrate: n("nelivrate"),
    cost_eurocenti: n("cost_eurocenti"),
  };
}
