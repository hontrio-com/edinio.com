import test from "node:test";
import assert from "node:assert/strict";

import { formatPhoneDisplay } from "./format";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * UN TELEFON SE SCRIE LA FEL PESTE TOT                       (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ FUNCTIA EXISTA DE MULT SI N-O CHEMA NIMENI. Masurat: zero apelanti in tot
 * depozitul, si nicio proba. Intre timp, in lista de clienti stateau unul sub
 * altul `0753 639 611`, `+40 755 588 107` si `+359 88 412 3309`.
 *
 * ⚠ Toate formele de mai jos sunt LUATE DIN PRODUCTIE, nu inventate.
 */

test("numarul romanesc obisnuit se grupeaza 07XX XXX XXX", () => {
  /* 462 din comenzile platformei arata asa. */
  assert.equal(formatPhoneDisplay("0726755200"), "0726 755 200");
  assert.equal(formatPhoneDisplay("0740156271"), "0740 156 271");
  assert.equal(formatPhoneDisplay("0753639611"), "0753 639 611");
});

test("⚠ prefixul Romaniei e +40, nu +4", () => {
  /*
   * ⚠ ASTA ERA DEFECTUL, si n-a fost vazut de nimeni tocmai fiindca functia nu era
   * chemata: pentru `+40755588107` scotea `+4 0755 588 107`.
   */
  assert.equal(formatPhoneDisplay("+40755588107"), "+40 755 588 107");
  assert.equal(formatPhoneDisplay("40755588107"), "+40 755 588 107");
});

test("`0040 7…` e aceeasi scriere ca `+40 7…`", () => {
  assert.equal(formatPhoneDisplay("0040755588107"), "+40 755 588 107");
});

test("⚠⚠ numerele STRAINE raman cum au venit", () => {
  /*
   * ⚠ Pe productie exista un numar german (`004915115623642`) si unul bulgaresc
   * (`+359 88 412 3309`). O regula romaneasca aplicata peste ele le-ar fi rupt —
   * si tocmai un numar strain e cel pe care comerciantul il citeste cu atentie
   * inainte sa sune.
   */
  assert.equal(formatPhoneDisplay("+359884123309"), "+359884123309");
  assert.equal(formatPhoneDisplay("004915115623642"), "004915115623642");
  assert.equal(formatPhoneDisplay("+359 88 412 3309"), "+359 88 412 3309");
});

test("⚠ telefonul anonimizat trece neatins", () => {
  /* Zece comenzi de pe productie au `***` in locul telefonului. N-are nicio cifra. */
  assert.equal(formatPhoneDisplay("***"), "***");
  assert.equal(formatPhoneDisplay(""), "");
});

test("⚠ nu inventeaza grupari pentru ce nu recunoaste", () => {
  /*
   * Un numar scurt, sau unul cu cifre in plus, se lasa in pace. O grupare pusa
   * peste ceva nerecunoscut face numarul sa PARA valid, iar comerciantul il
   * formeaza si da de nimeni.
   */
  assert.equal(formatPhoneDisplay("0721"), "0721");
  assert.equal(formatPhoneDisplay("07211234567890"), "07211234567890");
});

test("spatiile si liniutele din jur nu schimba rezultatul", () => {
  assert.equal(formatPhoneDisplay("  0726-755-200 "), "0726 755 200");
  assert.equal(formatPhoneDisplay("0726 755 200"), "0726 755 200");
});
