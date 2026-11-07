/**
 * Procentul reducerii, pentru insigna „-20%” (cardul temei Jupiter, etapa 23 din `docs/editor-magazin/PLAN.md`).
 *
 * Rotunjit in JOS: un „-24,5%” scris „-25%” ar promite mai mult decat e. `null` cand pretul vechi nu e mai mare decat
 * cel de acum sau cand reducerea e sub 1% (insigna ar scrie „-0%”).
 */
export function procentReducere(pret: number, pretVechi: number): number | null {
  if (!(pretVechi > pret) || !(pret >= 0)) return null;
  const p = Math.floor(((pretVechi - pret) / pretVechi) * 100);
  return p >= 1 ? p : null;
}
