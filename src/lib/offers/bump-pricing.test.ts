import assert from "node:assert/strict";
import { test } from "node:test";
import { aplicaBumpPeOBucata } from "./bump-pricing";
import type { BumpItem } from "./bump-pricing";

/**
 * Reducerea de bump ajunge in pretul liniei, deci direct in totalul comenzii,
 * in factura si in email. O bucata in plus la pret redus e reclama; toate la
 * pret redus e o gaura prin care clientul ridica singur cantitatea.
 */

const linie = (n: number, pret = 100): BumpItem =>
  ({ product_id: "p1", name: "Produs", price: pret, quantity: n });

test("o singura bucata: linia trece la pretul redus", () => {
  const l = linie(1);
  const linii = [l];
  const economie = aplicaBumpPeOBucata(linii, l, 60);
  assert.equal(linii.length, 1);
  assert.equal(linii[0].price, 60);
  assert.equal(linii[0].quantity, 1);
  assert.equal(economie, 40);
});

test("mai multe bucati: doar una pleaca la pret redus", () => {
  const l = linie(5);
  const linii = [l];
  const economie = aplicaBumpPeOBucata(linii, l, 60);
  assert.equal(linii.length, 2);
  assert.deepEqual(
    linii.map((x) => [x.quantity, x.price]),
    [[4, 100], [1, 60]],
  );
  // Economia e pe o bucata, nu pe cinci.
  assert.equal(economie, 40);
});

test("totalul comenzii scade exact cu economia", () => {
  const l = linie(3, 90);
  const linii = [l];
  const inainte = 3 * 90;
  const economie = aplicaBumpPeOBucata(linii, l, 50);
  const dupa = linii.reduce((s, x) => s + x.price * x.quantity, 0);
  assert.equal(inainte - dupa, economie);
});

test("un pret care nu e mai mic nu schimba nimic", () => {
  const l = linie(2);
  const linii = [l];
  assert.equal(aplicaBumpPeOBucata(linii, l, 100), 0);
  assert.equal(aplicaBumpPeOBucata(linii, l, 140), 0);
  assert.equal(linii.length, 1);
  assert.equal(linii[0].quantity, 2);
});

test("linia noua pastreaza produsul si numele", () => {
  const l = linie(2);
  const linii = [l];
  aplicaBumpPeOBucata(linii, l, 70);
  assert.equal(linii[1].product_id, "p1");
  assert.equal(linii[1].name, "Produs");
});
