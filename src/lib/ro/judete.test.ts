import assert from "node:assert/strict";
import { test } from "node:test";
import { JUDETE, potrivesteJudet } from "./judete";
import { ROMANIAN_COUNTIES } from "@/lib/validations/business";

/**
 * ANAF scrie judetul cu MAJUSCULE si cu diacritice; lista formularului il scrie
 * fara. Fara potrivirea asta, autocompletarea din ANAF ar fi lasat campul de
 * judet gol exact la firmele pentru care a fost facuta.
 */

test("potriveste forma ANAF, cu majuscule si diacritice", () => {
  assert.equal(potrivesteJudet("CLUJ"), "Cluj");
  assert.equal(potrivesteJudet("BISTRIŢA-NĂSĂUD"), "Bistrita-Nasaud");
  assert.equal(potrivesteJudet("BISTRIȚA-NĂSĂUD"), "Bistrita-Nasaud");
  assert.equal(potrivesteJudet("SATU MARE"), "Satu Mare");
  assert.equal(potrivesteJudet("Timiş"), "Timis");
});

test("cratima si spatiile nu conteaza", () => {
  assert.equal(potrivesteJudet("Bistrita Nasaud"), "Bistrita-Nasaud");
  assert.equal(potrivesteJudet("satumare"), "Satu Mare");
});

test("capitala are mai multe forme, toate duc in acelasi loc", () => {
  assert.equal(potrivesteJudet("BUCUREŞTI"), "Municipiul Bucuresti");
  assert.equal(potrivesteJudet("Municipiul Bucuresti"), "Municipiul Bucuresti");
  assert.equal(potrivesteJudet("Sector 3"), "Municipiul Bucuresti");
});

test("ce nu seamana cu nimic intoarce null, nu o ghicire", () => {
  assert.equal(potrivesteJudet("Budapesta"), null);
  assert.equal(potrivesteJudet(""), null);
  assert.equal(potrivesteJudet(null), null);
  assert.equal(potrivesteJudet(undefined), null);
});

test("fiecare judet din lista se potriveste cu el insusi", () => {
  for (const j of JUDETE) assert.equal(potrivesteJudet(j), j);
});

/**
 * Testul de mai sus nu poate prinde o intrare LIPSA — si chiar lipsea una:
 * „Caras-Severin" nu era in niciuna dintre cele doua liste copiate in formulare,
 * asa ca un judet intreg nu putea fi ales la livrare. Comparatia cu lista
 * canonica din `validations/business.ts` e singura care nu se poate pacali.
 */
test("acopera toate cele 41 de judete plus capitala", () => {
  const lipsa = ROMANIAN_COUNTIES
    .filter((j) => j !== "Bucuresti")
    .filter((j) => potrivesteJudet(j) === null);
  assert.deepEqual(lipsa, []);
  assert.equal(potrivesteJudet("Bucuresti"), "Municipiul Bucuresti");
  assert.equal(JUDETE.length, 42);
});
