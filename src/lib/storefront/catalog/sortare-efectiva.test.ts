import { strict as assert } from "node:assert";
import { test } from "node:test";
import { sortareEfectivaGrila } from "./sortare-efectiva";

/*
 * Ordinea grilei, compusa ca in browser: adresa, apoi pagina de catalog, apoi
 * magazinul. Aceeasi functie o cer si felia de pe server, si descrierea care numeste
 * primele produse; daca s-ar desparti, descrierea ar numi alte produse decat grila.
 */

test("adresa bate tot", () => {
  assert.equal(sortareEfectivaGrila("price_desc", "name_asc", { sort_options: { default_sort: "popular" } }), "price_desc");
});

test("fara sortare in adresa: intai cea a paginii de catalog", () => {
  assert.equal(sortareEfectivaGrila("", "name_asc", { sort_options: { default_sort: "popular" } }), "name_asc");
});

test("fara nimic pe pagina: implicitul magazinului, din `sort_options`", () => {
  assert.equal(sortareEfectivaGrila("", "", { sort_options: { default_sort: "popular" } }), "popular");
});

test(`fara nicio alegere: „newest”, ca in browser`, () => {
  assert.equal(sortareEfectivaGrila("", "", {}), "newest");
  assert.equal(sortareEfectivaGrila("", "", null), "newest");
  assert.equal(sortareEfectivaGrila("", "", { sort_options: null }), "newest");
});

test("⚠ `default_sort` scris GOL ramane gol (`??`, nu `||`), ca in `MiniStoreRenderer`", () => {
  // Pe pagina de catalog browserul compune `sort_options?.default_sort ?? "newest"`: un sir
  // gol ramane gol, deci grila vine in ordinea de catalog. Cu `||` aici, descrierea ar fi
  // numit primele produse din „newest", adica altele decat cele din grila.
  assert.equal(sortareEfectivaGrila("", "", { sort_options: { default_sort: "" } }), "");
});
