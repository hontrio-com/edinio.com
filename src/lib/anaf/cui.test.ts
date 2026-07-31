import assert from "node:assert/strict";
import { test } from "node:test";
import { isValidCui, normalizeCui, formatCui } from "./cui";

/**
 * Cifra de control a CUI-ului e singurul lucru care sta intre un camp de
 * formular public si un serviciu al statului: fara ea, orice sir tastat pleaca
 * spre ANAF de pe IP-urile pe care le impart toate magazinele. E si ultima
 * verificare inainte ca un cod fiscal sa ajunga pe o factura.
 */

test("scoate prefixul RO, spatiile si punctuatia", () => {
  assert.equal(normalizeCui("RO 12.345-678"), "12345678");
  assert.equal(normalizeCui("ro14399840"), "14399840");
  assert.equal(normalizeCui(""), "");
});

test("accepta CUI-uri valide, de lungimi diferite", () => {
  assert.equal(isValidCui("RO2816464"), true);
  assert.equal(isValidCui("14399840"), true);
  assert.equal(isValidCui("9010105"), true);
  assert.equal(isValidCui("13548146"), true);
  // Trei cifre: cheia se aliniaza la dreapta, restul se completeaza cu zerouri.
  assert.equal(isValidCui("361"), true);
});

test("respinge o cifra schimbata", () => {
  assert.equal(isValidCui("14399840"), true);
  assert.equal(isValidCui("14399841"), false);
  assert.equal(isValidCui("14399830"), false);
});

test("respinge lungimile imposibile si sirurile de zerouri", () => {
  assert.equal(isValidCui("1"), false);
  assert.equal(isValidCui("12345678901"), false);
  // SmartBill foloseste chiar sirul de zerouri ca marcaj de persoana fizica.
  assert.equal(isValidCui("0000000000000"), false);
  assert.equal(isValidCui("00"), false);
  assert.equal(isValidCui("abc"), false);
});

test("prefixul RO se pune doar la platitorii de TVA", () => {
  assert.equal(formatCui("14399840", true), "RO14399840");
  assert.equal(formatCui("14399840", false), "14399840");
  assert.equal(formatCui("RO14399840", true), "RO14399840");
  assert.equal(formatCui("", true), "");
});
