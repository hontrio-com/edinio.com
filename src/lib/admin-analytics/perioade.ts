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

/*
  ⚠ `decalaj` E CATE ZILE INAPOI SE TERMINA perioada. Zero inseamna „pana azi";
  unu inseamna „pana ieri".

  A trebuit adaugat pentru „Ieri", care nu e o perioada de o zi terminata azi, ci
  una terminata IERI. Fara el, formula veche (`zile - 1` pana la `today`) putea
  scrie numai perioade lipite de ziua de azi — si „Ieri" ar fi iesit „Azi".
*/
export const PERIOADE = {
  azi: { eticheta: "Azi", zile: 1, decalaj: 0 },
  ieri: { eticheta: "Ieri", zile: 1, decalaj: 1 },
  sapte: { eticheta: "7 zile", zile: 7, decalaj: 0 },
  douazecisiopt: { eticheta: "28 zile", zile: 28, decalaj: 0 },
  treizeci: { eticheta: "30 zile", zile: 30, decalaj: 0 },
  nouazeci: { eticheta: "90 zile", zile: 90, decalaj: 0 },
} as const;

/**
 * O zi, in limba lui GA4.
 *
 * ⚠ `today` SI `yesterday` NU SUNT ACELASI LUCRU cu `0daysAgo` si `1daysAgo` la
 * toate uneltele lor, iar cele doua cuvinte sunt cele documentate. Se folosesc
 * ele acolo unde se potrivesc, si forma numerica in rest.
 */
function ziua(inUrma: number): string {
  if (inUrma <= 0) return "today";
  if (inUrma === 1) return "yesterday";
  return `${inUrma}daysAgo`;
}

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
  const { zile, decalaj } = PERIOADE[p];
  return { startDate: ziua(decalaj + zile - 1), endDate: ziua(decalaj) };
}

/**
 * Perioada dinainte, de aceeasi lungime, pentru „fata de".
 *
 * ⚠ NU SE SUPRAPUN. Pentru 28 de zile: acum e `27daysAgo … today` (28 de zile cu
 * tot cu azi), iar inainte e `55daysAgo … 28daysAgo` (tot 28). O greseala de o zi
 * aici face fiecare procent de crestere sa fie fals, si nimeni n-ar observa.
 */
export function intervalulDinainte(p: NumePerioada): GaDateRange {
  const { zile, decalaj } = PERIOADE[p];
  return { startDate: ziua(decalaj + 2 * zile - 1), endDate: ziua(decalaj + zile) };
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
