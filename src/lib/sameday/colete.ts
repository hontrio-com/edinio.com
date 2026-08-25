/**
 * Tipul coletului, asa cum il imparte Sameday: dupa GREUTATE, nu dupa forma.
 *
 * ═══ ⚠ NU E O ETICHETA, E O REGULA CU PRET ═══
 *
 * Documentatia lor (pagina 5) e limpede:
 *   tip 1 — intre 0,01 si 1,00 kg
 *   tip 0 — intre 1,01 si 38 kg
 *   tip 2 — peste 38 kg (expeditii overweight)
 *
 * Fereastra noastra lasa pana azi orice combinatie, deci un colet de 50 kg putea pleca
 * declarat tip 0. Ei il taxeaza dupa ce declaram, iar nepotrivirea se vede abia pe factura
 * lor, cand nu mai are cine s-o repare.
 *
 * ⚠ Si eticheta din fereastra spunea „Plic" la tipul 1, ceea ce nu scrie nicaieri la ei: e
 * un colet mic, iar un comerciant cu o cutie de 800 g o citea drept „nu e cazul meu".
 */

export const ETICHETE_COLET: Record<0 | 1 | 2, string> = {
  1: "Colet mic (pana in 1 kg)",
  0: "Colet (1–38 kg)",
  2: "Colet mare (peste 38 kg)",
};

/** Tipul pe care il cere greutatea data. */
export function tipulDupaGreutate(kg: number): 0 | 1 | 2 {
  if (kg <= 1) return 1;
  if (kg <= 38) return 0;
  return 2;
}

/**
 * Ce e de spus omului cand tipul ales nu se potriveste cu greutatea — sau `null` cand e bine.
 *
 * ⚠ Se spune ce ANUME sa apese, nu doar ca a gresit. Un mesaj care zice „tip invalid" il
 * lasa sa ghiceasca intre trei butoane.
 */
export function potrivesteTipul(kg: number, ales: 0 | 1 | 2): string | null {
  if (!Number.isFinite(kg) || kg <= 0) return null;
  const cerut = tipulDupaGreutate(kg);
  if (cerut === ales) return null;
  return `La ${kg} kg, Sameday cere „${ETICHETE_COLET[cerut]}”, nu „${ETICHETE_COLET[ales]}”.`;
}
