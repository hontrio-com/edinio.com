import type { EmagPropunereCampanie } from "./types";

/**
 * Ce se propune intr-o campanie, si ce se intampla dupa (§56, §57).
 *
 * ═══ ⚠ FISIER FARA NICIUN IMPORT DE RULARE, SI ASTA E TOT ROSTUL LUI ═══
 *
 * Ecranul de campanii e componenta de CLIENT si are nevoie de limitele lor
 * (`REDUCERE_MINIMA`, `REDUCERE_MAXIMA`) ca sa le scrie sub camp. Luate din
 * `campanii.ts`, ar fi tras dupa ele `client.ts` — iar acela aduce `undici` si
 * `node:async_hooks`, care nu exista in browser. Masurat: `npm run build` cade cu
 * „the chunking context does not support external modules (request: node:async_hooks)".
 *
 * Aceeasi despartire ca la `colete.ts`, si din acelasi motiv.
 *
 * `import type` se sterge la compilare, deci `types.ts` nu strica nimic.
 */

/* ══════════════════════════════════════════════════════════════════════════
   CE SE PROPUNE, SI CE SE INTAMPLA DUPA (§56, §57)
   ══════════════════════════════════════════════════════════════════════════ */

/** Ce stim despre o oferta cand se face propunerea. */
export interface OfertaPentruCampanie {
  emagId: number;
  /** Pretul de acum, FARA TVA — chiar cel pe care il trimitem la eMAG. */
  pretNet: number;
  stoc: number;
}

export interface CerereCampanie {
  campaignId: number;
  /** Cat se taie, in procente. */
  reducere: number;
  /** Cat stoc se pune deoparte pentru campanie. Gol = tot. */
  stocMaxim?: number | null;
  /** Cate bucati poate lua un client. Obligatoriu la unele campanii de-ale lor. */
  maxPeComanda?: number | null;
}

export interface PropuneriPregatite {
  propuneri: EmagPropunereCampanie[];
  /** Ofertele sarite, cu motivul. ⚠ Se arata; sarite tacut, nimeni n-ar afla. */
  sarite: { emagId: number; motiv: string }[];
}

/** Cat ingaduie ei la `voucher_discount`. Scris in schema lor. */
export const REDUCERE_MINIMA = 10;
export const REDUCERE_MAXIMA = 100;

function patruZecimale(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

/**
 * Pregateste propunerile pentru o campanie.
 *
 * Functie curata: intra oferte si o cerere, ies propuneri. Se poate proba intreaga
 * fara retea — si e chiar partea in care o greseala costa bani.
 *
 * ═══ ⚠ `post_campaign_sale_price` SE TRIMITE MEREU (§57) ═══
 *
 * Schema lor: „The automatically filled price is the sale price of the product from
 * the moment when offers are DOWNLOADED."
 *
 * Adica netrimis, eMAG pune el un pret — cel pe care il avea oferta cand si-au tras
 * ei datele, care poate fi de acum o luna. Dupa campanie, produsul s-ar fi intors la
 * pretul ala vechi, nu la cel de azi. Fara nicio eroare, si fara ca nimeni sa se uite
 * a doua zi dupa terminarea unei campanii.
 *
 * De aceea se trimite ANUME pretul nostru de acum. E singurul pe care il stim sigur.
 */
export function pregatestePropunerile(
  oferte: OfertaPentruCampanie[],
  cerere: CerereCampanie,
): PropuneriPregatite {
  const propuneri: EmagPropunereCampanie[] = [];
  const sarite: { emagId: number; motiv: string }[] = [];

  const reducere = Math.round(Number(cerere.reducere));

  for (const o of oferte) {
    if (!Number.isFinite(o.pretNet) || o.pretNet <= 0) {
      sarite.push({ emagId: o.emagId, motiv: "n-are pret" });
      continue;
    }
    /* ⚠ Fara stoc, propunerea intra si nu se poate cumpara nimic din ea. eMAG o
       accepta — e un numar valid — iar comerciantul ar fi vazut produsul in campanie
       si zero vanzari, fara sa inteleaga de ce. */
    if (!Number.isFinite(o.stoc) || o.stoc <= 0) {
      sarite.push({ emagId: o.emagId, motiv: "n-are stoc" });
      continue;
    }

    const pretCampanie = patruZecimale(o.pretNet * (1 - reducere / 100));
    if (pretCampanie <= 0) {
      sarite.push({ emagId: o.emagId, motiv: "reducerea duce pretul la zero" });
      continue;
    }

    propuneri.push({
      id: o.emagId,
      sale_price: pretCampanie,
      /* ⚠ Cel mult cat are. Un stoc maxim mai mare decat cel real ar fi promis in
         campanie bucati care nu exista. */
      stock: cerere.stocMaxim != null && cerere.stocMaxim > 0
        ? Math.min(Math.floor(cerere.stocMaxim), Math.floor(o.stoc))
        : Math.floor(o.stoc),
      campaign_id: Math.floor(cerere.campaignId),
      voucher_discount: reducere,
      /* ⚠ §57. Vezi antetul: netrimis, produsul s-ar fi intors dupa campanie la un
         pret vechi, ales de ei, si nimeni n-ar fi observat. */
      post_campaign_sale_price: patruZecimale(o.pretNet),
      ...(cerere.maxPeComanda != null && cerere.maxPeComanda > 0
        ? { max_qty_per_order: Math.floor(cerere.maxPeComanda) }
        : {}),
    });
  }

  return { propuneri, sarite };
}

/**
 * Ce e in neregula cu cererea, in cuvintele omului. `null` = se poate.
 *
 * ⚠ Se verifica INAINTE de a chema eMAG. Mesajele lor vorbesc despre campuri, iar
 * `campaign_id` gresit intoarce ceva ce nu spune „nu exista campania asta".
 */
export function cePiedicaAreCampania(c: CerereCampanie): string | null {
  if (!Number.isFinite(c.campaignId) || c.campaignId <= 0) {
    return "Pune numărul campaniei, așa cum ți-l dă eMAG în panoul lor.";
  }
  const r = Number(c.reducere);
  if (!Number.isFinite(r) || r < REDUCERE_MINIMA || r > REDUCERE_MAXIMA) {
    return `Reducerea trebuie să fie între ${REDUCERE_MINIMA}% și ${REDUCERE_MAXIMA}% — atât acceptă eMAG.`;
  }
  return null;
}
