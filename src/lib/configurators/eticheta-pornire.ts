/**
 * Ce fel de pret scrie cardul, si care.
 *
 * ═══ ⚠ DE CE STA SINGURA, INTR-UN FISIER FARA NICIUN IMPORT ═══
 *
 * Regula asta e chemata din `ProductCard`, adica dintr-o componenta de CLIENT randata de cateva
 * zeci de ori pe fiecare pagina de catalog din platforma. Tinuta langa `pretulDePornire`, aducea
 * cu ea `raspuns.ts`, si odata cu el motorul de reguli, cel de pret, evaluatorul de formule si
 * amprenta — cateva mii de randuri de logica, in pachetul vitrinei, pentru CINCI randuri de
 * decizie.
 *
 * Pretul de pornire se socoteste pe SERVER, la proiectare, si ajunge aici ca un numar. Cardul
 * n-are nevoie de motor ca sa aleaga intre doua feluri de a scrie un numar.
 *
 * ⚠ Nu adauga importuri in fisierul asta. Daca ai nevoie de ceva cu import, calculul acela
 * e al serverului.
 *
 * ⚠ AICI NU SE FORMATEAZA NIMIC. `formatPrice` e singurul loc care stie moneda si
 * separatorii; o a doua formatare scrisa aici ar fi divergit de el la prima schimbare, si atunci
 * acelasi produs ar fi aratat „340 lei” in grila si „340,00 RON” pe pagina.
 */
export interface EtichetaPornire {
  /** `dela` = „De la X lei”; `exact` = „X lei”. */
  text: "exact" | "dela";
  valoare: number;
}

/**
 * @param cere        produsul cere configurare (steagul din proiectie)
 * @param pornire     pretul configuratiei implicite, sau `null` cand nu s-a putut socoti
 * @param pretSimplu  ce ar fi scris cardul fara configurator (minimul intervalului de pret)
 */
export function etichetaDePornire(
  cere: boolean,
  pornire: number | null,
  pretSimplu: number,
): EtichetaPornire {
  if (!cere) return { text: "exact", valoare: pretSimplu };
  /*
   * ⚠ Si fara pret de pornire ramane „De la”. Produsul CERE configurare, deci pretul lui simplu
   * nu e un pret la care se poate cumpara — scris ca pret exact, ar fi fost o promisiune pe care
   * pagina o dezminte imediat.
   */
  if (pornire === null || !Number.isFinite(pornire)) return { text: "dela", valoare: pretSimplu };
  return { text: "dela", valoare: pornire };
}
