import { strict as assert } from "node:assert";
import { test } from "node:test";
import { articolulActiv, type IntrareCuprins } from "./cuprins";
import { TERMENI_SECTIUNI } from "./termeni";

/*
 * De ce exista probele astea, si nu o verificare in browser:
 *
 * `IntersectionObserver` NU livreaza nimic intr-o fila de fundal, exact ca
 * `requestAnimationFrame`. Masurat pe pagina de Termeni: `visibilityState` era
 * „hidden", n-a rulat niciun cadru, iar observatorul nu si-a chemat functia nici
 * macar o data la pornire. Deci aprinderea din cuprins nu se poate verifica
 * apasand pe ceva — regula ei sta intr-o functie pura, si aici se probeaza.
 */

const INTRARI: IntrareCuprins[] = [
  { id: "a", nr: 1, titlu: "Unu" },
  { id: "b", nr: 2, titlu: "Doi" },
  { id: "c", nr: 3, titlu: "Trei" },
];

test("se aprinde primul din ORDINEA DOCUMENTULUI, nu din ordinea multimii", () => {
  /* Multimea vine din observator si n-are ordinea paginii. Un `[...set][0]` ar
     fi dat „c" aici, iar cuprinsul ar fi clipit intre articole la aceeasi
     pozitie de derulare. */
  assert.equal(articolulActiv(INTRARI, new Set(["c", "a"])), "a");
});

test("cand se vede unul singur, el e cel aprins", () => {
  assert.equal(articolulActiv(INTRARI, new Set(["b"])), "b");
});

test("cand nu se vede niciunul, raspunsul e null — adica „nu schimba nimic”", () => {
  /* Important: apelantul PASTREAZA ultima valoare. Intr-un articol mai inalt
     decat banda de observare nu e nimeni in banda, iar daca s-ar stinge tot,
     cuprinsul s-ar goli fix in mijlocul celui mai lung articol. */
  assert.equal(articolulActiv(INTRARI, new Set()), null);
});

test("id-urile necunoscute din multime sunt ignorate", () => {
  assert.equal(articolulActiv(INTRARI, new Set(["altceva"])), null);
  assert.equal(articolulActiv(INTRARI, new Set(["altceva", "c"])), "c");
});

test("merge pe cuprinsul real al Termenilor, nu doar pe unul inventat", () => {
  const intrari = TERMENI_SECTIUNI.map(({ id, nr, titlu }) => ({ id, nr, titlu }));
  const alDoilea = intrari[1].id;
  const alTreizecilea = intrari[29].id;
  assert.equal(articolulActiv(intrari, new Set([alTreizecilea, alDoilea])), alDoilea);
});
