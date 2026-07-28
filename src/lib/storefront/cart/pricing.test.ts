import assert from "node:assert/strict";
import { test } from "node:test";
import { computeCartPricing } from "./pricing";

/**
 * Numerele astea se vad in patru locuri deodata (sertar, trei modele de pagina
 * de cos) si trebuie sa fie identice in toate. Rulare: `npm test`.
 */

const de = (over: Partial<Parameters<typeof computeCartPricing>[0]> = {}) =>
  computeCartPricing({ total: 100, shippingCost: 20, freeShippingThreshold: null, minOrderAmount: null, ...over });

test("fara prag, transportul se plateste intotdeauna", () => {
  const p = de();
  assert.equal(p.shipping, 20);
  assert.equal(p.shippingIsFree, false);
  assert.equal(p.grandTotal, 120);
  // Fara prag nu exista drum de parcurs: bara se deseneaza plina, nu goala.
  assert.equal(p.freeShippingPct, 100);
  assert.equal(p.freeShippingRemaining, 0);
});

test("pragul atins face transportul gratuit", () => {
  const p = de({ total: 300, freeShippingThreshold: 300 });
  assert.equal(p.shipping, 0);
  assert.equal(p.shippingIsFree, true);
  assert.equal(p.grandTotal, 300);
  assert.equal(p.freeShippingRemaining, 0);
  assert.equal(p.freeShippingPct, 100);
});

test("sub prag se arata cat mai lipseste si cat s-a parcurs", () => {
  const p = de({ total: 240, freeShippingThreshold: 300 });
  assert.equal(p.shipping, 20);
  assert.equal(p.freeShippingRemaining, 60);
  assert.equal(p.freeShippingPct, 80);
});

test("un prag de zero inseamna fara prag, nu transport gratuit mereu", () => {
  // In baza, „fara prag" ajunge si ca null si ca 0; ar fi absurd ca 0 sa dea
  // livrare gratuita la orice comanda, inclusiv la un cos gol.
  const p = de({ total: 0, freeShippingThreshold: 0 });
  assert.equal(p.shipping, 20);
  assert.equal(p.shippingIsFree, false);
});

test("comanda minima blocheaza finalizarea si spune cat lipseste", () => {
  const p = de({ total: 80, minOrderAmount: 150 });
  assert.equal(p.belowMinOrder, true);
  assert.equal(p.minOrderRemaining, 70);

  const peste = de({ total: 150, minOrderAmount: 150 });
  assert.equal(peste.belowMinOrder, false);
  assert.equal(peste.minOrderRemaining, 0);
});

test("progresul nu trece de suta la un cos peste prag", () => {
  assert.equal(de({ total: 900, freeShippingThreshold: 300 }).freeShippingPct, 100);
});
