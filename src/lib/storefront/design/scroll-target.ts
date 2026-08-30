/** Ce ne trebuie de la un element ca sa-i gasim cutia. Restul DOM-ului nu ne intereseaza. */
export interface ElementCuCutie {
  getClientRects(): { length: number };
  querySelectorAll(selector: string): Iterable<ElementCuCutie>;
}

/**
 * Primul element care are cu adevarat o cutie de layout, pornind de la `el`.
 *
 * ⚠ INVELISUL DE SECTIUNE NU ARE CUTIE, SI DE ASTA „DU-MA LA SECTIUNE" NU FACEA
 * NIMIC.
 *
 * `data-st-section` sta pe un `<div class="contents">`, adica pe un element cu
 * `display: contents` — ales anume, ca invelisul sa nu rupa selectorii pe copil
 * direct dintr-o varianta de design. Numai ca un asemenea element nu genereaza
 * cutie, iar specificatia cere ca `scrollIntoView()` sa returneze imediat pe el.
 * Apelul se executa fara eroare si fara efect: sectiunea se selecta in lista, dar
 * previzualizarea nu se misca — un buton mort care arata viu.
 *
 * `querySelectorAll("*")` da descendentii in ordinea din document, deci primul cu
 * cutie e chiar inceputul vizual al sectiunii. Cand nu exista niciunul — o
 * sectiune stinsa, sau una care n-a randat nimic — se intoarce `null` si
 * apelantul nu deruleaza nicaieri, ceea ce e corect: n-ar avea unde.
 */
export function primaCutie<T extends ElementCuCutie>(el: T | null | undefined): T | null {
  if (!el) return null;
  if (el.getClientRects().length > 0) return el;
  for (const copil of el.querySelectorAll("*")) {
    if (copil.getClientRects().length > 0) return copil as T;
  }
  return null;
}
