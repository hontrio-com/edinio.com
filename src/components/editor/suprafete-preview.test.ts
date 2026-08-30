import test from "node:test";
import assert from "node:assert/strict";
import { SUPRAFETE, caleaSuprafetei, motivSuprafataIndisponibila, type SuprafeteDisponibile } from "./suprafete-preview";

/**
 * Suprafetele previzualizarii din „Editeaza magazinul".
 *
 * Rulare: npm test
 */

const TOATE: SuprafeteDisponibile = {
  produsSlug: "tricou",
  cosPePagina: true,
  comandaPePagina: true,
  unSingurProdus: false,
};

test("fiecare suprafata are calea ei", () => {
  assert.equal(caleaSuprafetei("acasa", "magazinul-meu", "tricou"), "/magazinul-meu");
  assert.equal(caleaSuprafetei("produs", "magazinul-meu", "tricou"), "/magazinul-meu/product/tricou");
  assert.equal(caleaSuprafetei("cos", "magazinul-meu", "tricou"), "/magazinul-meu/cos");
  assert.equal(caleaSuprafetei("comanda", "magazinul-meu", "tricou"), "/magazinul-meu/checkout");
});

test("cand exista tot, nimic nu e indisponibil", () => {
  for (const { cheie } of SUPRAFETE) {
    assert.equal(motivSuprafataIndisponibila(cheie, TOATE), null, cheie);
  }
});

test("⚠ fara niciun produs, pagina de produs cade pe acasa in loc de 404", () => {
  assert.equal(caleaSuprafetei("produs", "nou", null), "/nou");
  assert.ok(motivSuprafataIndisponibila("produs", { ...TOATE, produsSlug: null }));
});

test("⚠⚠ cosul in sertar: butonul spune de ce, nu duce in gol", () => {
  // Ruta /{slug}/cos REDIRECTEAZA catre pagina principala la magazinele cu
  // sertar — adica la implicitul tuturor — iar redirectarea arunca si preview=1.
  assert.ok(motivSuprafataIndisponibila("cos", { ...TOATE, cosPePagina: false }));
  assert.ok(motivSuprafataIndisponibila("comanda", { ...TOATE, comandaPePagina: false }));
});

test("⚠ in modul un-singur-produs, pagina principala ESTE pagina produsului", () => {
  assert.ok(motivSuprafataIndisponibila("produs", { ...TOATE, unSingurProdus: true }));
});

test("acasa e mereu disponibila", () => {
  assert.equal(
    motivSuprafataIndisponibila("acasa", { produsSlug: null, cosPePagina: false, comandaPePagina: false, unSingurProdus: true }),
    null,
  );
});
