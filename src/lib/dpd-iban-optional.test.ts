import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDpdShipmentBody, type DpdConfig, type DpdShipmentInput } from "@/lib/dpd";

/*
 * ⚠ IBAN-UL E OPTIONAL LA DPD (08.10.2026).
 *
 * `payment.senderBankAccount` e „Required: No" in specificatia lor: fara el, rambursul merge in
 * contul din contract. Il ceream obligatoriu si opream LOCAL orice AWB cu ramburs — la
 * suporti-numar 6 incercari in doua zile, desi DPD avea IBAN-ul in sistem.
 */
const CONFIG: DpdConfig = { enabled: true, username: "u", password: "p", client_id: 1 };
const INPUT: DpdShipmentInput = {
  recipientName: "Ion Popescu", recipientPhone: "0722000000", recipientEmail: "a@b.ro",
  recipientCity: "Cluj-Napoca", recipientCounty: "Cluj", recipientStreet: "Str. Lunga", recipientStreetNo: "1",
  recipientAddressNote: "", weightKg: 1, cashOnDelivery: 150, ref1: "#1", shipmentNote: "",
};
const OPTS = { countryId: 642, serviceId: 2505 };

test("ramburs FARA IBAN la noi: cererea pleaca, fara cont (DPD foloseste contractul)", () => {
  const corp = buildDpdShipmentBody(CONFIG, INPUT, OPTS) as { payment: Record<string, unknown>; service: { additionalServices?: { cod?: unknown } } };
  assert.equal(corp.payment.senderBankAccount, undefined);
  assert.equal(corp.payment.courierServicePayer, "SENDER");
  assert.ok(corp.service.additionalServices?.cod, "rambursul trebuie sa ramana pe AWB");
});

test("ramburs CU IBAN la noi: contul pleaca, fara spatii", () => {
  const corp = buildDpdShipmentBody({ ...CONFIG, iban: "RO49 AAAA 1B31 0075 9384 0000", account_holder: "Firma SRL" }, INPUT, OPTS) as { payment: Record<string, unknown> };
  assert.deepEqual(corp.payment.senderBankAccount, { iban: "RO49AAAA1B31007593840000", accountHolder: "Firma SRL" });
});

test("fara ramburs, contul nu pleaca nici cand exista", () => {
  const corp = buildDpdShipmentBody({ ...CONFIG, iban: "RO49AAAA1B31007593840000" }, { ...INPUT, cashOnDelivery: 0 }, OPTS) as { payment: Record<string, unknown> };
  assert.equal(corp.payment.senderBankAccount, undefined);
});
