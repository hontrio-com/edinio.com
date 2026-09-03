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
