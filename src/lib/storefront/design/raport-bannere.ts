import type { MarimeBanner } from "./hero-banners";

/*
  ═══════════════════════════════════════════════════════════════════════════
  RAPORTUL LOCULUI BANNERELOR (13.11.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Gasit la eSafe, pe tema Jupiter: bannere de 1600 x 900 (16:9, exact ce recomanda editorul), intr-un loc de 2,14:1 cu
  `object-cover`, deci taiate sus si jos cu cate ~8%. Acelasi defect si la caruselul clasic (16:9 fix: la alexshop, poze
  de 3:2 taiate) si la hero-ul cu categorii (la mokka, un banner de 2,43:1 taiat 27% pe laturi).

  Regula de acum: locul ia raportul PRIMULUI banner, intre limitele designului, iar o poza cu alt raport decat locul se
  arata intreaga (`contain`), cu fundalul locului in jur, nu taiata. Raportul vine de pe server cand poza e in Biblioteca
  Media (`marimi-bannere.ts`), altfel se masoara in browser, la incarcare.

  Limitele tin asezarea designului in picioare:
    - „carduri” (Jupiter): cele doua carduri din dreapta au nevoie de ~290 px la 1024 px; peste 2,25:1 bannerul ar fi
      mai scund decat ele si ar lasa gol dedesubt. Sub 4:3, un banner patrat ar fi lungit hero-ul cat un ecran.
    - caruselul clasic: pe toata latimea, deci mai larg; doar fara poze mai inalte decat 4:3.
    - „categorii”: bara de categorii sta pe inaltimea bannerului (10 randuri x 44 px), deci locul nu devine mai scund
      decat azi (16:9); poate deveni doar mai inalt.
*/

export interface LimiteRaport {
  min: number;
  max: number;
}

export const LIMITE_RAPORT = {
  carduri: { min: 4 / 3, max: 2.25 },
  carusel: { min: 4 / 3, max: 4 },
  categorii: { min: 4 / 3, max: 16 / 9 },
} as const satisfies Record<string, LimiteRaport>;

/** Cat poate diferi raportul pozei de al locului ca sa umple locul (`cover`): sub 2%, taietura nu se vede. */
export const TOLERANTA_RAPORT = 0.02;

/** Raportul latime / inaltime al unei marimi, sau `null`. */
export function raportDin(m: MarimeBanner | null | undefined): number | null {
  return m && m[0] > 0 && m[1] > 0 ? m[0] / m[1] : null;
}

/** Raportul locului: al primului banner, tinut intre limite; `null` cand nu se stie (ramane cel din clasa designului). */
export function raportulLocului(primul: number | null | undefined, limite: LimiteRaport): number | null {
  if (!primul || !Number.isFinite(primul) || primul <= 0) return null;
  return Math.min(Math.max(primul, limite.min), limite.max);
}

/**
 * Cum se aseaza o poza in loc: `cover` (umple locul) cand are raportul lui, altfel `contain` (intreaga, cu fundal in
 * jur). Fara raportul locului sau al pozei, `cover`, ca pana acum.
 */
export function potrivireaPozei(raportPoza: number | null | undefined, raportLoc: number | null | undefined): "cover" | "contain" {
  if (!raportPoza || !raportLoc) return "cover";
  return Math.abs(raportPoza / raportLoc - 1) <= TOLERANTA_RAPORT ? "cover" : "contain";
}
