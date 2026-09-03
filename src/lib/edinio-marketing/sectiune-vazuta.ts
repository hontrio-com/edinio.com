/*
  ═══════════════════════════════════════════════════════════════════════════════
  CAND SOCOTIM CA OMUL A VAZUT O SECTIUNE
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DE CE E UN MODUL PROPRIU, PUR. Regula asta e aritmetica, iar aritmetica se
  poate proba fara browser. Scrisa inauntrul componentei, singura ei proba ar fi
  fost una care cere un `IntersectionObserver` adevarat — adica una pe care n-o
  ruleaza nimeni la fiecare `npm test`.

  ⚠ SI DE CE NU E UN SIMPLU PRAG. Forma dinainte cerea `threshold: 0.5`, adica
  JUMATATE DIN SECTIUNE vizibila deodata. Pentru o sectiune mai inalta decat doua
  ecrane asta e cu neputinta: cel mult `ecran / sectiune` din ea incape. La 2400px
  pe un telefon de 800px, maximul e 33% — deci `section_view` nu s-ar fi tras
  NICIODATA, si tocmai pentru sectiunile lungi, care sunt cele care conteaza
  (preturi, comparatie, intrebari).

  Nu cade nimic si nu se vede nimic: raportul arata pur si simplu ca nimeni n-a
  ajuns acolo.
*/

/**
 * A vazut omul destul din sectiune?
 *
 * ⚠ REGULA E „CE E MAI MIC DINTRE DOUA": jumatate din SECTIUNE pentru cele
 * scurte, sau jumatate din ECRAN umplut de ea pentru cele lungi, unde jumatate de
 * sectiune nu incape. Asa o sectiune de 400px cere 200px vazuti, iar una de
 * 3000px cere jumatate de ecran — in amandoua cazurile „omul chiar a intrat in
 * ea", nu „a trecut in fuga peste marginea de sus".
 */
export function destulDinSectiune(m: {
  /** Cat din sectiune se vede acum. */
  vizibil: number;
  /** Inaltimea sectiunii intregi. */
  sectiune: number;
  /** Inaltimea ferestrei. */
  ecran: number;
}): boolean {
  if (m.sectiune <= 0 || m.ecran <= 0) return false;
  return m.vizibil >= Math.min(m.sectiune, m.ecran) * 0.5;
}

/**
 * Pragul cu care trebuie observata CHIAR sectiunea asta.
 *
 * ═══ ⚠ DE CE NU AJUNGE REGULA SINGURA ═══
 *
 * `destulDinSectiune` da raspunsul bun — dar el se cheama numai cand
 * `IntersectionObserver` ne trezeste, iar el ne trezeste doar la TRAVERSAREA unui
 * prag din lista data.
 *
 * ⚠ CE STRICA ASTA, si e scaparea din prima mea reparatie: cu o lista fixa
 * `[0, 0.25, 0.5, 0.75]`, o sectiune de 5000px pe un ecran de 800px ajunge cel
 * mult la raportul 800/5000 = 0,16. Traverseaza `0` la primul pixel — cand inca
 * nu s-a vazut destul — si apoi NICIUN alt prag. Deci callback-ul nu mai vine, iar
 * regula, oricat de dreapta, nu se mai executa niciodata.
 *
 * Reparasem aritmetica si lasasem declansatorul stricat.
 *
 * ⚠ LEACUL: pragul se CALCULEAZA pentru fiecare sectiune, ca sa fie chiar clipa in
 * care regula devine adevarata. Pentru 5000px pe 800px iese 400/5000 = 0,08 —
 * atins, deci trezirea vine. Pentru o sectiune scurta iese 0,5, adica exact ce
 * cerea forma dinainte.
 */
export function pragulSectiunii(sectiune: number, ecran: number): number {
  if (sectiune <= 0 || ecran <= 0) return 0;
  const cerut = Math.min(sectiune, ecran) * 0.5;
  /* ⚠ Marginit in (0, 1]: un prag de 0 ne-ar trezi la primul pixel, unul peste 1 niciodata. */
  return Math.min(1, Math.max(0.001, cerut / sectiune));
}
