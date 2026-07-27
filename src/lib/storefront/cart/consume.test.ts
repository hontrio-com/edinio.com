import assert from "node:assert/strict";
import { test } from "node:test";
import { cosDupaComanda } from "./consume";

/**
 * Comanda plecata de pe pagina de produs duce cu ea celelalte linii din cos,
 * dar nu si produsul curent, care se comanda separat. Inainte se stergea tot
 * cosul, deci exact linia necomandata era cea care disparea.
 */

const linie = (productId: string, variantTitle?: string) => ({ productId, variantTitle, cantitate: 1 });

test("scoate liniile care au intrat in comanda", () => {
  const cos = [linie("a"), linie("b"), linie("c")];
  const ramas = cosDupaComanda(cos, [linie("a"), linie("c")]);
  assert.deepEqual(ramas.map((i) => i.productId), ["b"]);
});

test("pastreaza linia produsului curent, care nu e purtata in comanda", () => {
  const cos = [linie("curent"), linie("altul")];
  // Pagina trimite in comanda doar celelalte linii.
  const ramas = cosDupaComanda(cos, [linie("altul")]);
  assert.deepEqual(ramas.map((i) => i.productId), ["curent"]);
});

test("distinge variantele aceluiasi produs", () => {
  const cos = [linie("tricou", "S"), linie("tricou", "L")];
  const ramas = cosDupaComanda(cos, [linie("tricou", "S")]);
  assert.deepEqual(ramas.map((i) => i.variantTitle), ["L"]);
});

test("un produs simplu nu e confundat cu varianta lui", () => {
  const cos = [linie("tricou"), linie("tricou", "S")];
  const ramas = cosDupaComanda(cos, [linie("tricou")]);
  assert.deepEqual(ramas.map((i) => i.variantTitle), ["S"]);
});

test("cosul gol ramane gol", () => {
  assert.deepEqual(cosDupaComanda([], [linie("a")]), []);
});

test("o comanda fara linii purtate nu atinge cosul", () => {
  const cos = [linie("a"), linie("b")];
  assert.deepEqual(cosDupaComanda(cos, []).length, 2);
});
