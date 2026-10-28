import type { Privitori } from "@/lib/analitice/privitori";

/*
  Ce arata blocul „Contorul de vizitatori” (etapa 12 din `docs/editor-magazin/PLAN.md`). Pur, ca
  sa se poata proba fara React: componentele paginii de produs sunt `.tsx` si nu se ruleaza in probe.
*/

/** Ce numara contorul; il alege comerciantul din panoul blocului. */
export type FereastraContor = "now" | "day";

/** Implicit: ultimele 24 de ore. „Acum” ar fi fost gol la 95% din vizite (masurat pe 28.10.2026). */
export const FEREASTRA_IMPLICITA: FereastraContor = "day";

/**
 * Numarul din previzualizarea editorului si din miniaturile designurilor, cand nu e niciun om de
 * numarat. Fara el, blocul n-ar putea fi vazut si ales in editor; panoul spune ca e un exemplu.
 */
export const EXEMPLU_CONTOR = 3;

export function fereastraContorului(pageContent: { social_proof_window?: unknown } | null | undefined): FereastraContor {
  return pageContent?.social_proof_window === "now" ? "now" : FEREASTRA_IMPLICITA;
}

/**
 * Ce numar arata pastila; 0 inseamna ca nu apare deloc.
 *
 * ⚠ Exemplul vine DOAR cand nu e nimeni, si doar in editor sau in miniaturi. In magazin, zero
 * ramane zero: o pastila cu un numar inventat era chiar lucrul reparat aici.
 */
export function numarulContorului(o: {
  privitori: Privitori | null | undefined;
  fereastra: FereastraContor;
  exemplu: boolean;
}): number {
  const real = o.privitori ? (o.fereastra === "now" ? o.privitori.acum : o.privitori.zi) : 0;
  if (real > 0) return real;
  return o.exemplu ? EXEMPLU_CONTOR : 0;
}

/**
 * Textul de dupa numar, cu pluralul romanesc: „1 persoana”, „3 persoane”, „20 de persoane”, dar
 * „101 persoane” (prepozitia „de” vine cand ultimele doua cifre sunt 00 sau de la 20 in sus).
 *
 * ⚠ Fara diacritice, ca restul textelor paginii de produs („Selecteaza optiunile”, „Stoc epuizat”).
 */
export function textulContorului(n: number, fereastra: FereastraContor): string {
  const ultimele = n % 100;
  const persoane = n === 1 ? "persoana" : ultimele === 0 || ultimele >= 20 ? "de persoane" : "persoane";
  if (fereastra === "now") return `${persoane} se uita acum`;
  return `${persoane} ${n === 1 ? "a" : "au"} vazut produsul in ultimele 24 de ore`;
}
