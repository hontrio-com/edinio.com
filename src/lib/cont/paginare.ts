/**
 * Paginarea listelor din cont (Comenzi, Facturi).
 *
 * ⚠ `?p=` vine din adresa, deci poate fi orice. Fara plafon, `?p=99999999999`
 * facea un decalaj peste `integer` in baza, iar pagina cadea cu eroare in loc
 * sa arate o lista goala.
 */

export const PE_PAGINA = 20;

/** Peste ea nu are cine ajunge rasfoind: 2 000 000 de randuri. */
export const PAGINA_MAXIMA = 100_000;

export function numarulPaginii(p: string | string[] | undefined): number {
  const brut = Array.isArray(p) ? p[0] : p;
  const n = Number.parseInt(brut ?? "1", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, PAGINA_MAXIMA);
}

/** Decalajul trimis bazei, plafonat si el: `comenzileMele` se poate chema si din alt loc. */
export function decalajSigur(decalaj: number): number {
  if (!Number.isFinite(decalaj) || decalaj < 0) return 0;
  return Math.min(Math.floor(decalaj), PAGINA_MAXIMA * PE_PAGINA);
}
