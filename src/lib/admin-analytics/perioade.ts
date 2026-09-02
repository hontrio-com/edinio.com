import type { GaDateRange } from "@/lib/google-analytics/client";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  PERIOADELE RAPOARTELOR, SI PERECHEA LOR DE COMPARAT
  ═══════════════════════════════════════════════════════════════════════════════

  ═══ ⚠ DE CE SIRURI RELATIVE SI NU DATE CALCULATE DE NOI ═══

  GA4 socoteste zilele in FUSUL PROPRIETATII, nu in al serverului care intreaba.
  Serverele noastre merg pe UTC, proprietatea e pe ora Romaniei.

  Deci un „azi" calculat la noi ar fi inceput cu doua sau trei ore mai tarziu decat
  „azi" al lor: intre miezul noptii si ora 3 dimineata, raportul ar fi aratat ziua
  gresita. Iar la 1 noiembrie, cand se schimba ora, decalajul se schimba si el —
  adica defectul ar aparea si ar disparea singur.

  `7daysAgo` si `today` sunt socotite DE EI, in fusul proprietatii. Nu e o
  scurtatura, e singurul fel in care numerele sunt ale zilelor despre care credem
  ca vorbim.
*/

export const PERIOADE = {
  azi: { eticheta: "Azi", zile: 1 },
  sapte: { eticheta: "7 zile", zile: 7 },
  douazecisiopt: { eticheta: "28 zile", zile: 28 },
  nouazeci: { eticheta: "90 zile", zile: 90 },
} as const;

export type NumePerioada = keyof typeof PERIOADE;

export function ePerioada(x: string | null | undefined): x is NumePerioada {
  return !!x && Object.prototype.hasOwnProperty.call(PERIOADE, x);
}

/**
 * Perioada ceruta.
 *
 * ⚠ `endDate: "today"` INCLUDE ZIUA DE AZI, care e neterminata. Asta e voit:
 * cine deschide raportul vrea sa vada ce se intampla acum. Dar inseamna si ca
 * ultima zi e mereu mai mica decat celelalte — de aceea comparatia se face pe
 * perioade intregi, nu pe „ultima zi fata de penultima".
 */
export function intervalul(p: NumePerioada): GaDateRange {
  const zile = PERIOADE[p].zile;
  return { startDate: zile === 1 ? "today" : `${zile - 1}daysAgo`, endDate: "today" };
}

/**
 * Perioada dinainte, de aceeasi lungime, pentru „fata de".
 *
 * ⚠ NU SE SUPRAPUN. Pentru 28 de zile: acum e `27daysAgo … today` (28 de zile cu
 * tot cu azi), iar inainte e `55daysAgo … 28daysAgo` (tot 28). O greseala de o zi
 * aici face fiecare procent de crestere sa fie fals, si nimeni n-ar observa.
 */
export function intervalulDinainte(p: NumePerioada): GaDateRange {
  const zile = PERIOADE[p].zile;
  return { startDate: `${2 * zile - 1}daysAgo`, endDate: `${zile}daysAgo` };
}

/**
 * Cat la suta a crescut, fata de perioada dinainte.
 *
 * ⚠ `null` CAND INAINTE ERA ZERO, si nu zero si nici infinit. „De la 0 la 12" nu
 * e o crestere de 100% si nici de 1200%: e o marime care nu se poate imparti.
 * Interfata arata o liniuta, nu un numar care pare masurat.
 */
export function crestere(acum: number, inainte: number): number | null {
  if (!Number.isFinite(acum) || !Number.isFinite(inainte)) return null;
  if (inainte === 0) return null;
  return ((acum - inainte) / inainte) * 100;
}
