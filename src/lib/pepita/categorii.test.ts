import assert from "node:assert/strict";
import { test } from "node:test";
import { caleaCategoriilor } from "./categorii";

const ARBORE = [
  { id: "c1", name: "Cărți", parent_id: null },
  { id: "c2", name: "Familie și părinți", parent_id: "c1" },
  { id: "c3", name: "Jurnal de bebeluș", parent_id: "c2" },
  { id: "c4", name: "Jucării", parent_id: null },
];

test("⚠ calea merge de la parinte la copil, cum cere documentatia lor", () => {
  /* „a legfelsőbb kategóriától a legalsóbbig", cu exemplul „Könyvek > Babanapló".
     Trimisa invers, produsul ar ajunge la ei intr-un arbore intors pe dos. */
  assert.deepEqual(caleaCategoriilor(ARBORE)("Jurnal de bebeluș"), [
    { id: "c1", nume: "Cărți" },
    { id: "c2", nume: "Familie și părinți" },
    { id: "c3", nume: "Jurnal de bebeluș" },
  ]);
});

test("o categorie radacina da o cale de un singur pas", () => {
  assert.deepEqual(caleaCategoriilor(ARBORE)("Jucării"), [{ id: "c4", nume: "Jucării" }]);
});

test("fara categorie, calea e goala si produsul pica pe „fara categorie”", () => {
  const cale = caleaCategoriilor(ARBORE);
  assert.deepEqual(cale(null), []);
  assert.deepEqual(cale(""), []);
  assert.deepEqual(cale("   "), []);
});

test("⚠ o categorie care nu mai e in arbore NU scoate produsul din feed", () => {
  /*
   * Un produs importat poate purta un nume de categorie sters intre timp. Intoarsa
   * goala, calea ar fi facut produsul sa cada pe „fara categorie" si sa dispara din
   * feed pentru o nepotrivire de evidenta interna. Numele acela chiar descrie produsul,
   * deci pleaca asa, fara `<Id>`.
   */
  assert.deepEqual(caleaCategoriilor(ARBORE)("Categorie ștearsă"), [{ nume: "Categorie ștearsă" }]);
});

test("⚠ un ciclu de parinti nu blocheaza feedul", () => {
  /* Arborele e o lista de adiacenta si nimic din baza nu opreste un parinte care se
     intoarce la copil. Fara paza, feedul ar fi intrat in bucla si ar fi tinut functia
     pana la timeout. */
  const ciclu = [
    { id: "a", name: "A", parent_id: "b" },
    { id: "b", name: "B", parent_id: "a" },
  ];
  const cale = caleaCategoriilor(ciclu)("A");
  assert.equal(cale.length, 2);
  assert.deepEqual(cale.map((c) => c.nume), ["B", "A"]);
});

test("un parinte care nu exista opreste urcarea, nu o darama", () => {
  const rupt = [{ id: "x", name: "X", parent_id: "nu-exista" }];
  assert.deepEqual(caleaCategoriilor(rupt)("X"), [{ id: "x", nume: "X" }]);
});

test("la doua categorii cu acelasi nume castiga prima, ca peste tot in proiect", () => {
  const dublu = [
    { id: "p1", name: "Accesorii", parent_id: null },
    { id: "p2", name: "Telefoane", parent_id: null },
    { id: "p3", name: "Accesorii", parent_id: "p2" },
  ];
  assert.deepEqual(caleaCategoriilor(dublu)("Accesorii"), [{ id: "p1", nume: "Accesorii" }]);
});

test("categoriile fara nume nu ajung in cale", () => {
  const cuGol = [
    { id: "g1", name: "  ", parent_id: null },
    { id: "g2", name: "Copil", parent_id: "g1" },
  ];
  assert.deepEqual(caleaCategoriilor(cuGol)("Copil"), [{ id: "g2", nume: "Copil" }]);
});
