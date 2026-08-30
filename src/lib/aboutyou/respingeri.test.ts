import assert from "node:assert/strict";
import { test } from "node:test";
import { traduMotiv, traduMotive } from "./respingeri";

/*
 * Comerciantul vedea „Respins" si atat: `rejection_reasons` rămânea in baza,
 * necitit, iar `rejectionCount` se calcula si nu se afisa nicaieri. Setul lor de
 * motive e INCHIS si documentat (zece, trei grupe), deci se poate traduce integral.
 */
test("motivele documentate se traduc, cu remediu", () => {
  const m = traduMotiv({ name: "Missing material specification", type: "Inconsistent Data" });
  assert.match(m.titlu, /Compoziția materialului/);
  assert.ok(m.remediu && m.remediu.length > 30, "traducerea trebuie sa spuna si CE sa faca");
  assert.equal(m.original, null);
});

test("potrivirea nu depinde de forma exacta a numelui", () => {
  // Formele variaza intre `GET /products/rejected` si webhookul de status.
  for (const nume of ["wrong sizes", "Wrong Sizes", "wrong_sizes", "WRONG-SIZES"]) {
    assert.match(traduMotiv({ name: nume }).titlu, /Mărimile/, `n-a prins forma „${nume}”`);
  }
});

test("se accepta si `key` cand `name` lipseste", () => {
  assert.match(traduMotiv({ key: "missing_or_wrong_brand" }).titlu, /Brandul/);
});

test("un motiv necunoscut NU se inghite: se arata textul lor brut", () => {
  const m = traduMotiv({ name: "Some New Reason", description: "Because reasons." });
  assert.equal(m.titlu, "Some New Reason");
  assert.equal(m.remediu, null);
  assert.equal(m.original, "Because reasons.");
});

test("fara nume si fara cheie se cade pe grupa, apoi pe un text neutru", () => {
  assert.equal(traduMotiv({ type: "Image - Requirements are not Fulfilled" }).titlu,
    "Cerințe de imagine neîndeplinite");
  assert.equal(traduMotiv({}).titlu, "Motiv nespecificat de About You");
});

test("lista se citeste tolerant: ce nu e obiect se sare", () => {
  assert.equal(traduMotive(null).length, 0);
  assert.equal(traduMotive("respins").length, 0);
  assert.equal(traduMotive([{ name: "wrong sizes" }, null, 5, { key: "prices_are_configured_incorrectly" }]).length, 2);
});

test("toate cele zece motive documentate au traducere", () => {
  const documentate = [
    "First Bust or Model Image Missing",
    "Background not white, transparent or light grey",
    "Wrong Viewing Angle",
    "Images and descriptive data are different",
    "Product Photos not matching selected color",
    "wrong sizes",
    "Missing or wrong brand",
    "Prices are configured incorrectly",
    "Missing material specification",
    "Blocklisted term/ design",
  ];
  const netraduse = documentate.filter((n) => traduMotiv({ name: n }).remediu === null);
  assert.deepEqual(netraduse, [], `motive fara traducere: ${netraduse.join(", ")}`);
});
