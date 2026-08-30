import assert from "node:assert/strict";
import { test } from "node:test";
import { autoInvoiceTriggerMatches, AUTO_INVOICE_TRIGGERS } from "./invoicing";

/**
 * Declansatoarele de facturare automata se evalueaza acum si la confirmarea unei
 * plati online, nu doar cand comerciantul misca manual comanda din panou. Pana
 * atunci, cine alesese „Platita" nu primea factura NICIODATA la plata cu cardul:
 * singurul lucru care marcheaza plata e chiar calea de plata, iar ea nu chema
 * dispecerul. Iar „Comanda confirmata" se pierdea la fel de sigur — plata pune
 * comanda direct in „confirmed", deci mutarea urmatoare, spre „Expediata", nu se
 * mai potrivea.
 */

test("plata online declanseaza facturarea pe „Platita\"", () => {
  assert.equal(autoInvoiceTriggerMatches("paid", "confirmed", "paid"), true);
});

test("plata online declanseaza facturarea si pe „Comanda confirmata\"", () => {
  assert.equal(autoInvoiceTriggerMatches("confirmed", "confirmed", "paid"), true);
});

test("o plata nu declanseaza declansatoarele de livrare", () => {
  for (const trigger of ["processing", "shipped", "delivered"] as const) {
    assert.equal(autoInvoiceTriggerMatches(trigger, "confirmed", "paid"), false, trigger);
  }
});

test("o comanda deja expediata care se plateste abia acum prinde „Expediata\"", () => {
  // Cronul de reconciliere confirma plati tarziu, cand comanda a plecat deja.
  assert.equal(autoInvoiceTriggerMatches("shipped", "shipped", "paid"), true);
});

test("fara declansator configurat nu se emite nimic", () => {
  assert.equal(autoInvoiceTriggerMatches(undefined, "confirmed", "paid"), false);
});

test("fiecare declansator din interfata are un raspuns", () => {
  for (const { value } of AUTO_INVOICE_TRIGGERS) {
    assert.equal(typeof autoInvoiceTriggerMatches(value, value, "paid"), "boolean", value);
  }
});
