/**
 * Campaniile eMAG si pretul de Smart Deals.
 *
 * ═══ ⚠ CE FACE FISIERUL ASTA SI CE NU FACE ═══
 *
 * FACE: propune o oferta intr-o campanie, si intreaba ce pret ar avea nevoie ca sa
 * primeasca insigna Smart Deals.
 *
 * NU FACE: nu schimba niciun pret singur.
 *
 * Deosebirea e toata poanta. `smart-deals-price-check` intoarce pretul-tinta pentru
 * insigna, si e foarte tentant sa-l pui automat. Dar acela e un pret sub care
 * comerciantul poate sa nu mai castige nimic — iar o integrare care taie preturi
 * singura, „ca sa iasa mai bine", face exact felul de rau pe care nimeni nu-l cere
 * si de care toata lumea se sperie.
 *
 * Deci pretul se ARATA, cu marja de acum langa el, si apasa omul.
 */

import { propuneInCampanie, verificaPretSmartDeals, isEmagError } from "./client";
import type { ContextEmag } from "./sync";
import type { EmagPropunereCampanie } from "./types";

/* ═══════════════════════════════════════════════════════════════════════════
   SMART DEALS
   ═══════════════════════════════════════════════════════════════════════════ */

export interface PretTinta {
  /** Pretul cerut de ei pentru insigna. `null` = nu ne-au spus. */
  tinta: number | null;
  /** Cat ar trebui coborat fata de pretul de acum, in procente. */
  scadereProcente: number | null;
}

/**
 * Ce pret cere eMAG pentru insigna Smart Deals.
 *
 * ⚠ FORMA RASPUNSULUI NU E DESCRISA IN SCHEMA, doar in proza: „By providing the
 * productId, the system returns the target price needed for eligibility." Deci se
 * citeste aparat, si `null` inseamna „nu stiu" — niciodata un numar inventat.
 *
 * Un pret-tinta inventat ar fi cel mai scump fel de greseala din tot fisierul: omul
 * ar cobori pretul dupa el, n-ar primi insigna, si ar vinde mai ieftin degeaba.
 */
export async function pretPentruSmartDeals(
  ctx: ContextEmag, emagId: number, pretDeAcumFaraTva: number,
): Promise<PretTinta | { error: string }> {
  const r = await verificaPretSmartDeals(ctx.auth, emagId);
  if (isEmagError(r)) return { error: r.error };

  const tinta = citesteTinta(r.data);
  if (tinta == null) return { tinta: null, scadereProcente: null };

  const scadere = pretDeAcumFaraTva > 0
    ? Math.round(((pretDeAcumFaraTva - tinta) / pretDeAcumFaraTva) * 1000) / 10
    : null;

  return { tinta, scadereProcente: scadere };
}

/**
 * Numarul dintr-un raspuns de forma necunoscuta.
 *
 * Pur, ca sa poata fi probat cu toate formele plauzibile. Se incearca, in ordine: un
 * numar simplu, si cateva denumiri obisnuite de camp. Nimic nu se ghiceste mai
 * departe — un camp nerecunoscut da `null`, nu zero.
 */
export function citesteTinta(brut: unknown): number | null {
  const unNumar = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && /^\d+([.,]\d+)?$/.test(v)) return Number(v.replace(",", "."));
    return null;
  };

  if (Array.isArray(brut)) {
    for (const el of brut) {
      const n = citesteTinta(el);
      if (n != null) return n;
    }
    return null;
  }
  const direct = unNumar(brut);
  if (direct != null) return direct;
  if (!brut || typeof brut !== "object") return null;

  const o = brut as Record<string, unknown>;
  for (const cheie of ["target_price", "targetPrice", "price", "sale_price", "smart_deals_price"]) {
    const n = unNumar(o[cheie]);
    if (n != null) return n;
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PROPUNEREA IN CAMPANIE
   ═══════════════════════════════════════════════════════════════════════════ */

export type RezultatCampanie = { fel: "propus" } | { fel: "esec"; mesaj: string };

/** ⚠ Lot maxim, ca peste tot la scrierile lor. Vezi `LOT_MAXIM` din `rute.ts`. */
const LOT = 50;

/**
 * Propune oferte intr-o campanie.
 *
 * ⚠ NU TRECE PRIN REGISTRU, si e o alegere, nu o scapare. O propunere retrimisa nu
 * face rau: eMAG o suprascrie, iar rezultatul e acelasi. Pusa sub `cuRegistru`, s-ar
 * fi intamplat exact ce s-a intamplat la OLX — o cheie pe produs intorcea `deja` la
 * a doua trecere si ingheta pretul, fiindca a doua incercare legitima nu mai avea
 * cum sa treaca.
 *
 * Registrul e pentru efectele CU UN SINGUR FOC: facturi, AWB-uri, plati. O propunere
 * nu e asa.
 */
export async function propuneOferte(
  ctx: ContextEmag, propuneri: EmagPropunereCampanie[],
): Promise<RezultatCampanie> {
  if (propuneri.length === 0) return { fel: "propus" };

  for (let i = 0; i < propuneri.length; i += LOT) {
    const r = await propuneInCampanie(ctx.auth, propuneri.slice(i, i + LOT));
    if (isEmagError(r)) return { fel: "esec", mesaj: r.error };
  }
  return { fel: "propus" };
}
