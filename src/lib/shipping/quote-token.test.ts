import assert from "node:assert/strict";
import { test } from "node:test";
import { signShippingQuote, verifyShippingQuote } from "./quote-token";

/**
 * Costul livrarii era singurul numar din comanda scris asa cum venea din browser.
 * Cine trimitea zero primea livrare gratuita, iar comerciantul platea oricum
 * curierul. Testele astea apara exact ce leaga semnatura: magazinul, destinatia
 * si suma.
 */

const BIZ = "biz-1";
const DEST = { county: "Cluj", city: "Cluj-Napoca", country: "RO", postCode: "400000" };

test("cotatia proprie trece", () => {
  const t = signShippingQuote(BIZ, DEST, 24.5);
  assert.equal(verifyShippingQuote(BIZ, DEST, 24.5, t), true);
});

test("alta suma pe aceeasi cotatie nu trece", () => {
  const t = signShippingQuote(BIZ, DEST, 24.5);
  assert.equal(verifyShippingQuote(BIZ, DEST, 0, t), false);
  assert.equal(verifyShippingQuote(BIZ, DEST, 24.49, t), false);
});

test("cotatia unui alt magazin nu trece", () => {
  const t = signShippingQuote("biz-2", DEST, 24.5);
  assert.equal(verifyShippingQuote(BIZ, DEST, 24.5, t), false);
});

test("cotatia altei destinatii nu trece", () => {
  const t = signShippingQuote(BIZ, { ...DEST, city: "Bucuresti" }, 24.5);
  assert.equal(verifyShippingQuote(BIZ, DEST, 24.5, t), false);
});

test("destinatia se normalizeaza, deci spatiile si majusculele nu strica nimic", () => {
  const t = signShippingQuote(BIZ, DEST, 24.5);
  assert.equal(verifyShippingQuote(BIZ, { ...DEST, city: "  cluj-napoca " }, 24.5, t), true);
});

test("tara lipsa inseamna Romania, in ambele sensuri", () => {
  const t = signShippingQuote(BIZ, { county: "Cluj", city: "Cluj-Napoca", postCode: "400000" }, 24.5);
  assert.equal(verifyShippingQuote(BIZ, { ...DEST, country: "RO" }, 24.5, t), true);
});

test("o cotatie expirata nu mai trece", () => {
  const t = signShippingQuote(BIZ, DEST, 24.5, Date.now() - 1000);
  assert.equal(verifyShippingQuote(BIZ, DEST, 24.5, t), false);
});

test("token lipsa sau stricat nu trece", () => {
  assert.equal(verifyShippingQuote(BIZ, DEST, 24.5, null), false);
  assert.equal(verifyShippingQuote(BIZ, DEST, 24.5, ""), false);
  assert.equal(verifyShippingQuote(BIZ, DEST, 24.5, "fara-punct"), false);
  assert.equal(verifyShippingQuote(BIZ, DEST, 24.5, `${Date.now() + 10000}.gresit`), false);
});
