import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { EroareCitireBaza } from "@/lib/supabase/rand-citit";
import type { CanalDeclarat } from "./tipuri";

/**
 * Exclusivitatea canalelor (planul, §4.9): un canal, pe o tara, se vinde fie prin integrarea
 * nativa Edinio, fie prin easySales, niciodata pe amandoua. Altfel aceeasi comanda ar intra pe doua
 * drumuri (doua facturi, doua AWB-uri) si, din E4, aceeasi vanzare s-ar scadea de doua ori din stoc.
 *
 * Precedentul: Okxi si VetDepo pe aceleasi chei Trendyol, 11.09.2026 (antetul
 * `cont-marketplace-unic.ts`).
 *
 * Poarta merge in AMBELE sensuri: declararea unui canal deja conectat nativ se refuza, si
 * conectarea nativa a unui canal declarat la easySales se refuza (`refuzaCanalDeclarat`).
 */

export type CanalNativ = "emag" | "trendyol" | "aboutyou" | "olx" | "pepita";

export interface CanalPeTara {
  canal: CanalNativ;
  /** ISO2, cu litere mici. */
  tara: string;
}

export const NUME_CANAL: Readonly<Record<CanalNativ, string>> = {
  emag: "eMAG", trendyol: "Trendyol", aboutyou: "About You", olx: "OLX", pepita: "Pepita",
};

type Obiect = Record<string, unknown>;
function obiect(v: unknown): Obiect | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Obiect) : null;
}
function tara(v: unknown, implicit: string): string {
  return typeof v === "string" && /^[a-z]{2}$/i.test(v.trim()) ? v.trim().toLowerCase() : implicit;
}

export interface SetariCanale {
  emag_config?: unknown;
  trendyol_config?: unknown;
  aboutyou_config?: unknown;
  olx_config?: unknown;
  pepita_config?: unknown;
}

/** Canalele conectate nativ, pe tara, din configurarile magazinului. Pura. */
export function canaleleNative(s: SetariCanale): CanalPeTara[] {
  const out: CanalPeTara[] = [];
  const conectat = (c: Obiect | null) => c?.connected === true || c?.connected === "true";

  const emag = obiect(s.emag_config);
  if (conectat(emag)) out.push({ canal: "emag", tara: tara(emag!.tara, "ro") });

  const ty = obiect(s.trendyol_config);
  if (conectat(ty)) {
    out.push({ canal: "trendyol", tara: tara(ty!.storefront, "ro") });
    for (const x of Array.isArray(ty!.cross_country_storefronts) ? ty!.cross_country_storefronts : []) out.push({ canal: "trendyol", tara: tara(x, "ro") });
  }

  const ay = obiect(s.aboutyou_config);
  if (conectat(ay)) {
    const tari = Array.isArray(ay!.ship_countries) && ay!.ship_countries.length ? ay!.ship_countries : ["ro"];
    for (const x of tari) out.push({ canal: "aboutyou", tara: tara(x, "ro") });
  }

  if (conectat(obiect(s.olx_config))) out.push({ canal: "olx", tara: "ro" });

  const pep = obiect(s.pepita_config);
  if (pep?.activ === true) {
    const piete = obiect(pep.piete);
    const active = piete ? Object.entries(piete).filter(([, v]) => obiect(v)?.activa === true).map(([k]) => k) : [];
    for (const x of active.length ? active : [tara(pep.piata, "ro")]) out.push({ canal: "pepita", tara: tara(x, "ro") });
  }

  const vazute = new Set<string>();
  return out.filter((c) => (vazute.has(`${c.canal}|${c.tara}`) ? false : (vazute.add(`${c.canal}|${c.tara}`), true)));
}

/** Canalele declarate la easySales care se ciocnesc cu o integrare nativa. Pura. */
export function conflicteCanale(declarate: readonly CanalDeclarat[], native: readonly CanalPeTara[]): CanalPeTara[] {
  return native.filter((n) => declarate.some((d) => d.canal === n.canal && tara(d.tara, "ro") === n.tara));
}

export async function citesteCanaleleNative(admin: SupabaseClient<Database>, businessId: string): Promise<CanalPeTara[]> {
  const { data, error } = await admin.from("store_settings")
    .select("emag_config, trendyol_config, aboutyou_config, olx_config, pepita_config")
    .eq("business_id", businessId).maybeSingle();
  if (error) throw new EroareCitireBaza("easysales.canale", error.message);
  return canaleleNative((data ?? {}) as SetariCanale);
}

export function mesajConflict(c: readonly CanalPeTara[]): string {
  const lista = c.map((x) => `${NUME_CANAL[x.canal]} ${x.tara.toUpperCase()}`).join(", ");
  return `${lista} ${c.length > 1 ? "sunt conectate" : "este conectat"} deja direct în Edinio. Un canal se vinde fie direct, fie prin easySales, niciodată pe amândouă: altfel aceeași comandă ar intra de două ori. Deconectează-l întâi din Edinio sau scoate-l din lista easySales.`;
}

/**
 * Sensul invers, pentru conectarile native: canalul e declarat la easySales pe magazinul asta?
 * `null` = se poate conecta. ⚠ Cade INCHIS: o citire picata refuza (ca garda contului unic).
 */
export async function refuzaCanalDeclaratLaEasySales(
  admin: SupabaseClient<Database>, businessId: string, canal: CanalNativ, taraCanal: string | null = "ro",
): Promise<string | null> {
  const { data, error } = await admin.from("store_settings").select("cfg:easysales_config->canale, conectat:easysales_config->>connected")
    .eq("business_id", businessId).maybeSingle();
  /* ⚠ 42703 (coloana nu exista inca: codul a ajuns inaintea migratiei) inseamna ca nimic nu poate
     fi declarat la easySales. Cazut inchis aici, ar fi oprit TOATE conectarile native deodata. */
  if (error && error.code === "42703") return null;
  if (error) return "Nu am putut verifica dacă acest canal e vândut prin easySales. Încearcă din nou peste câteva momente.";
  const r = (data ?? {}) as { cfg?: unknown; conectat?: unknown };
  if (r.conectat !== "true") return null;
  const declarate = Array.isArray(r.cfg) ? (r.cfg as CanalDeclarat[]) : [];
  /* `null` = orice tara (About You si Pepita: tarile se aleg dupa conectare). */
  const t = taraCanal === null ? null : tara(taraCanal, "ro");
  const gasit = declarate.find((d) => d?.canal === canal && (t === null || tara(d?.tara, "ro") === t));
  if (!gasit) return null;
  return `${NUME_CANAL[canal]} ${tara(gasit.tara, "ro").toUpperCase()} este declarat ca vândut prin easySales. Un canal se vinde fie direct, fie prin easySales, niciodată pe amândouă: scoate-l întâi din lista easySales (Integrări, easySales).`;
}
