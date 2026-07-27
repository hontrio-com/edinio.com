import assert from "node:assert/strict";
import { test } from "node:test";
import { comboUnitPrice, comboCompareAtPrice } from "./variants";
import type { VariantCombo } from "./variants";

/**
 * Pretul unei combinatii ajunge in cos, in comanda si in feed-uri, iar serverul
 * repretuieste comanda cu aceeasi functie. Un zero luat drept pret real inseamna
 * o comanda de 0 lei pe care serverul o accepta, deci are teste.
 */

const combo = (price: unknown, compare: unknown = ""): VariantCombo => ({
  id: "c1",
  title: "M",
  price: price as never,
  compare_at_price: compare as never,
  sku: "",
  stock_quantity: "",
  image: "",
  enabled: true,
});

test("un pret propriu se foloseste ca atare", () => {
  assert.equal(comboUnitPrice(combo("249"), 199), 249);
  assert.equal(comboUnitPrice(combo(249), 199), 249);
});

test("sirul gol inseamna fara pret propriu: cade pe pretul produsului", () => {
  assert.equal(comboUnitPrice(combo(""), 199), 199);
  assert.equal(comboUnitPrice(combo("   "), 199), 199);
});

test("zero inseamna tot fara pret propriu, nu gratis", () => {
  // Importul pune 0 numeric pentru combinatiile fara `pret=` in CSV, iar
  // exportul omite coloana exact pentru cele salvate din formular cu sir gol:
  // un dus-intors export-import facea toate marimile sa coste 0 lei.
  assert.equal(comboUnitPrice(combo(0), 199), 199);
  assert.equal(comboUnitPrice(combo("0"), 199), 199);
});

test("o valoare fara sens cade pe pretul produsului", () => {
  assert.equal(comboUnitPrice(combo("abc"), 199), 199);
});

test("fara combinatie aleasa se foloseste pretul produsului", () => {
  assert.equal(comboUnitPrice(null, 199), 199);
});

test("pretul taiat trateaza zeroul la fel", () => {
  assert.equal(comboCompareAtPrice(combo("", "0"), 299), 299);
  assert.equal(comboCompareAtPrice(combo("", "349"), 299), 349);
  assert.equal(comboCompareAtPrice(null, null), null);
});
