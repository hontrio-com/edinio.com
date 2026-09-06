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
  /** `products.id` care a picat. Se citeste ca sa se stie DACA e o linie din cos. */
  produs?: string | null;
  nume?: string | null;
  /** Numai la refuz pe combinatie. Absent = a picat stocul produsului intreg. */
  varianta?: string | null;
  disponibil?: number | null;
}

/**
 * Produsele care sunt PIESE consumate de o configuratie, si nu marfa din cosul omului.
 *
 * Cheia e `products.id`, valoarea e numele piesei asa cum il vede cumparatorul in
 * descompunerea de pret (poate lipsi: sirul gol inseamna „e o piesa, dar n-are nume bun de
 * aratat”).
 */
export type PieseleConfiguratiei = ReadonlyMap<string, string>;

export function mesajRefuzStoc(rez: RefuzStoc, piese?: PieseleConfiguratiei): string {
  const disponibil = Number(rez.disponibil) || 0;

  /*
   * ⚠ O PIESA NU E O LINIE DIN COS, SI NU I SE POATE CERE OMULUI S-O SCOATA DE ACOLO.
   *
   * O balama, un tub de silicon sau o ora de manopera sunt randuri de stoc tinute STINSE
   * dinadins: nu apar in catalog, nu se pot cumpara, si cumparatorul n-a auzit de ele. Trecute
   * prin mesajul de produs, el primea „„Balama Blum 110” tocmai s-a epuizat. Scoate-l din cos si
   * incearca din nou.” — o propozitie care il trimite sa faca ceva ce nu se poate face, si care
   * ii spune pe deasupra numele intern al unui produs pe care comerciantul il tine ascuns.
   *
   * Aici i se spune ce POATE face: sa schimbe optiunea sau sa scada cantitatea. Numele care
   * apare e cel al PIESEI, nu al produsului — acelasi pe care il vede oricum in descompunerea
   * de pret.
   *
   * ⚠ Doar cand piesa NU e si marfa din cos. Aceeasi balama vanduta si la bucata ramane pe
   * mesajul de produs, fiindca acolo „scoate-l din cos” chiar are inteles. Cine hotaraste e
   * `numelePieselor`, care scoate din lista tot ce e si linie de comanda.
   */
  const produs = typeof rez.produs === "string" ? rez.produs : "";
  if (produs && !rez.varianta && piese?.has(produs)) {
    const nume = (piese.get(produs) ?? "").slice(0, 60);
    const care = nume ? `„${nume}”` : "una dintre piesele lui";
    return disponibil <= 0
      ? `Nu mai avem ${care}, si o cere ceva din ce ai configurat. Alege alta optiune.`
      : `Din ${care} au mai ramas ${disponibil}, mai putine decat cere configuratia ta. Scade cantitatea sau alege alta optiune.`;
  }

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
