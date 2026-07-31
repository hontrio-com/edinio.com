import assert from "node:assert/strict";
import { test } from "node:test";
import { readVariants } from "./catalog";

/**
 * Citirea variantelor din `page_sections`.
 *
 * Testele de aici sunt scrise dupa ce am masurat baza ADEVARATA: din 14.326 de
 * combinatii, 696 tin `stock_quantity` si `price` ca sir de caractere, nu ca
 * numar. Prima variantă a codului folosea `Number.isFinite("5")`, care e `false`,
 * si le citea pe toate ca 0. Datele n-ar fi fost stricate, dar previzualizarea ar
 * fi aratat sute de modificari inchipiute.
 */

function sectiuni(combinations: unknown[]) {
  return { variants: { enabled: true, combinations } };
}

test("numerele scrise ca sir se citesc corect", () => {
  const v = readVariants(sectiuni([
    { id: "m", title: "M", sku: "T-M", stock_quantity: "5", price: "95" },
  ]));
  assert.equal(v[0].stock_quantity, 5);
  assert.equal(v[0].price, 95);
});

test("numerele adevarate merg mai departe neatinse", () => {
  const v = readVariants(sectiuni([
    { id: "m", title: "M", sku: "T-M", stock_quantity: 7, price: 99.5 },
  ]));
  assert.equal(v[0].stock_quantity, 7);
  assert.equal(v[0].price, 99.5);
});

test("sirul gol devine zero", () => {
  const v = readVariants(sectiuni([
    { id: "m", title: "M", sku: "T-M", stock_quantity: "", price: "" },
  ]));
  assert.equal(v[0].stock_quantity, 0);
  assert.equal(v[0].price, 0);
});

test("text fara cifre devine zero, nu NaN", () => {
  const v = readVariants(sectiuni([
    { id: "m", title: "M", sku: "T-M", stock_quantity: "indisponibil", price: "la cerere" },
  ]));
  assert.equal(v[0].stock_quantity, 0);
  assert.equal(v[0].price, 0);
  assert.equal(Number.isNaN(v[0].stock_quantity), false);
});

test("sirul cu spatii in jur se curata", () => {
  const v = readVariants(sectiuni([
    { id: "m", title: "M", sku: "T-M", stock_quantity: " 12 ", price: " 30 " },
  ]));
  assert.equal(v[0].stock_quantity, 12);
});

test("SKU-ul gol devine null, ca sa nu prinda randuri goale", () => {
  const v = readVariants(sectiuni([
    { id: "a", title: "A", sku: "", stock_quantity: 1, price: 1 },
    { id: "b", title: "B", sku: "   ", stock_quantity: 1, price: 1 },
  ]));
  assert.equal(v[0].sku, null);
  assert.equal(v[1].sku, null);
});

test("combinatia fara id se sare: n-am unde sa scriem inapoi", () => {
  const v = readVariants(sectiuni([
    { title: "fara id", sku: "X", stock_quantity: 1, price: 1 },
    { id: "b", title: "B", sku: "Y", stock_quantity: 2, price: 2 },
  ]));
  assert.equal(v.length, 1);
  assert.equal(v[0].id, "b");
});

test("titlul lipsa cade pe id, ca sa nu rimana gol in previzualizare", () => {
  const v = readVariants(sectiuni([{ id: "m", sku: "T-M", stock_quantity: 1, price: 1 }]));
  assert.equal(v[0].title, "m");
});

test("page_sections stricat sau fara variante da lista goala", () => {
  for (const intrare of [null, undefined, {}, "text", 42, [], { variants: {} }, { variants: { combinations: "nu" } }]) {
    assert.deepEqual(readVariants(intrare), []);
  }
});
