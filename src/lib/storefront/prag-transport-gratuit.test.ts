import assert from "node:assert/strict";
import { test } from "node:test";
import { pragTransportGratuit } from "./prag-transport-gratuit";

test("⚠ pragul ZERO inseamna „fara prag”, la fel ca pe restul platformei", () => {
  /*
   * Serverul era singurul care il citea cu `!= null`, deci pentru el 0 insemna
   * „gratuit de la zero lei" — adica gratuit MEREU. Cosul si checkout-ul taxau
   * transportul, iar comanda se scria fara el: clientul vedea o suma si platea
   * alta. Doctrina platformei, scrisa si probata in `cart/pricing.ts`, e ca zeroul
   * inseamna „fara prag"; acum o spun toate partile.
   */
  assert.equal(pragTransportGratuit(0), null);
  assert.equal(pragTransportGratuit("0"), null);
  assert.equal(pragTransportGratuit(-5), null);
});

test("lipsa chiar inseamna lipsa", () => {
  assert.equal(pragTransportGratuit(null), null);
  assert.equal(pragTransportGratuit(undefined), null);
  assert.equal(pragTransportGratuit(""), null);
});

test("valorile obisnuite trec ca numere", () => {
  assert.equal(pragTransportGratuit(150), 150);
  assert.equal(pragTransportGratuit("150.00"), 150);
  assert.equal(pragTransportGratuit(0.5), 0.5);
});

test("un text fara sens nu devine prag", () => {
  // `NaN` intors ca atare ar face orice `>=` fals, tacut.
  assert.equal(pragTransportGratuit("abc" as unknown as string), null);
});
