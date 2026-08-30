import assert from "node:assert/strict";
import { test } from "node:test";
import { cheieDocument, mentiuneRefacturare, slotFacturare } from "./refacturare";

/**
 * Dupa un storno, comanda ramanea DEFINITIV nefacturabila.
 *
 * Numerele din teste sunt cele reale din productie (masurate 2026-08-04):
 * suporti-numar #0052 are factura SmartBill 0078 stornata prin 0148, iar itp-blk
 * #0007 — comanda `confirmed`, marfa vie — are factura fGO 0003 stornata prin 0004.
 */

test("factura fara storno blocheaza emiterea", () => {
  const slot = slotFacturare({ casa: "SmartBill", factura: "0078", storno: null });
  assert.equal(slot.poateEmite, false);
});

test("mesajul de blocaj spune ce document blocheaza si ce are de facut comerciantul", () => {
  const slot = slotFacturare({ casa: "SmartBill", factura: "0078", storno: undefined });
  assert.equal(slot.poateEmite, false);
  if (slot.poateEmite) return;
  assert.match(slot.mesaj, /SmartBill 0078/);
  // Un refuz care nu spune pasul urmator opreste facturarea fara sa o repare.
  assert.match(slot.mesaj, /storneaz/i);
  assert.doesNotMatch(slot.mesaj, /reincarc/i);
});

test("dupa storno slotul se elibereaza si stie ce document inlocuieste", () => {
  const slot = slotFacturare({ casa: "fGO", factura: "0003", storno: "0004" });
  assert.equal(slot.poateEmite, true);
  if (!slot.poateEmite) return;
  assert.deepEqual(slot.inlocuieste, { factura: "0003", storno: "0004" });
});

test("comanda nefacturata inca are slotul liber, fara document de inlocuit", () => {
  const slot = slotFacturare({ casa: "Oblio", factura: null, storno: null });
  assert.equal(slot.poateEmite, true);
  if (!slot.poateEmite) return;
  assert.equal(slot.inlocuieste, undefined);
});

test("un storno ramas orfan elibereaza slotul, dar tot conteaza ca reemitere", () => {
  // Nu exista azi in productie (0 randuri), dar apare daca cineva anuleaza factura
  // fara sa curete stornul: fara discriminant, documentul nou ar lua 409 la fGO.
  const slot = slotFacturare({ casa: "fGO", factura: null, storno: "0002" });
  assert.equal(slot.poateEmite, true);
  if (!slot.poateEmite) return;
  assert.deepEqual(slot.inlocuieste, { factura: null, storno: "0002" });
});

test("sirurile goale sau numai spatii nu tin slotul ocupat", () => {
  assert.equal(slotFacturare({ casa: "Oblio", factura: "", storno: "" }).poateEmite, true);
  assert.equal(slotFacturare({ casa: "Oblio", factura: "   ", storno: null }).poateEmite, true);
});

test("cheia primei emiteri ramane EXACT cea de dinainte", () => {
  // Daca s-ar schimba, dedublarea documentelor deja emise s-ar rupe: Oblio ar
  // considera cererea noua si ar emite a doua factura pentru aceeasi comanda.
  const liber = slotFacturare({ casa: "Oblio", factura: null, storno: null });
  assert.equal(cheieDocument("RO12345678-FCT-#0007", liber), "RO12345678-FCT-#0007");
});

test("cheia reemiterii poarta numarul notei de credit", () => {
  const dupaStorno = slotFacturare({ casa: "fGO", factura: "0003", storno: "0004" });
  assert.equal(cheieDocument("#0007", dupaStorno), "#0007-R0004");
});

test("aceeasi reemitere reincercata da aceeasi cheie, doua stornari dau chei diferite", () => {
  // Stabilitatea e ce impiedica doua facturi dupa o cadere de retea; unicitatea e
  // ce face posibila a doua reemitere.
  const s1 = slotFacturare({ casa: "fGO", factura: "0003", storno: "0004" });
  const s1bis = slotFacturare({ casa: "fGO", factura: "0003", storno: "0004" });
  const s2 = slotFacturare({ casa: "fGO", factura: "0009", storno: "0011" });
  assert.equal(cheieDocument("#0007", s1), cheieDocument("#0007", s1bis));
  assert.notEqual(cheieDocument("#0007", s1), cheieDocument("#0007", s2));
});

test("mentiunea leaga factura noua de cea desfiintata", () => {
  const dupaStorno = slotFacturare({ casa: "SmartBill", factura: "0078", storno: "0148" });
  assert.equal(
    mentiuneRefacturare("Comanda #0052", dupaStorno),
    "Comanda #0052 (inlocuieste factura 0078, stornata prin 0148)",
  );
});

test("la prima emitere mentiunea ramane neatinsa", () => {
  const liber = slotFacturare({ casa: "SmartBill", factura: null, storno: null });
  assert.equal(mentiuneRefacturare("Comanda #0052 - plata: Ramburs la curier", liber),
    "Comanda #0052 - plata: Ramburs la curier");
});

test("mentiunea unui storno orfan nu inventeaza un numar de factura", () => {
  const orfan = slotFacturare({ casa: "fGO", factura: null, storno: "0002" });
  assert.equal(mentiuneRefacturare("Comanda #0001", orfan),
    "Comanda #0001 (inlocuieste o factura stornata prin 0002)");
});
