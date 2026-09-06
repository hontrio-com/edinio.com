/**
 * Ce i se spune clientului cand revendicarea de stoc refuza comanda.
 *
 * ═══ DE CE E UN FISIER SEPARAT ═══
 *
 * Acelasi motiv ca la [[stoc-rezervat]]: `order.actions.ts` incepe cu
 * `"use server"`, iar de acolo nimic nu poate fi testat — fiecare export devine
 * actiune de server si trebuie sa fie `async`.
 *
 * Iar bucata asta ARE nevoie de test, fiindca e a doua jumatate a unui contract:
 * `revendica_stoc_complet` intoarce `varianta` doar cand a picat o combinatie, si
 * daca aici nu ne uitam la campul ala, clientul primeste mesajul de PRODUS pentru
 * o problema de MARIME. Pe „Pique Polo" — 94 de combinatii, 993.313 bucati in
 * total — ar suna „au mai ramas 0 bucati" pe o pagina care arata mii. Nicio
 * eroare nu s-ar aprinde nicaieri; ar arata doar ca o aiureala.
 */

/** Raspunsul lui `revendica_stoc_complet` cand `ok` e `false`. */
export interface RefuzStoc {
  nume?: string | null;
  /** Numai la refuz pe combinatie. Absent = a picat stocul produsului intreg. */
  varianta?: string | null;
  disponibil?: number | null;
}

export function mesajRefuzStoc(rez: RefuzStoc): string {
  const disponibil = Number(rez.disponibil) || 0;

  /*
   * Refuzul pe VARIANTA isi spune marimea, nu produsul — si cu aceleasi cuvinte
   * ca `eroareStocPeVarianta`, verificarea de la intrare. Doua formulari pentru
   * acelasi lucru l-ar face pe client sa creada ca sunt doua probleme diferite.
   */
  if (rez.varianta) {
    const titlu = String(rez.varianta).slice(0, 60);
    return disponibil <= 0
      ? `Varianta „${titlu}" nu mai este in stoc. Alege alta optiune.`
      : `Din varianta „${titlu}" au mai ramas ${disponibil} bucati. Scade cantitatea si incearca din nou.`;
  }

  const nume = String(rez.nume ?? "produsul cerut").slice(0, 60);
  return disponibil <= 0
    ? `„${nume}" tocmai s-a epuizat. Scoate-l din cos si incearca din nou.`
    : `Din „${nume}" au mai ramas ${disponibil} bucati. Scade cantitatea si incearca din nou.`;
}
