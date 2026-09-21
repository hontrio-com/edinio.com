import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  COLOANA_EXPEDIERII, NUMELE_CURIERULUI, ORDINEA_CAUTARII,
  curierulEtichetei, numeleDocumentului, type CurierEticheta,
} from "./etichete-lot";

/* ── Cele trei liste nu au voie sa se despartă ──────────────────────────── */

test("⚠ un curier adaugat intr-o lista si uitat in alta NU trece", () => {
  /*
   * Cele trei hartii se scriu de mana, una langa alta. Un curier pus doar in
   * `COLOANA_EXPEDIERII` n-ar fi cautat niciodata (nu e in ordine); unul pus doar in
   * ordine ar citi `rand[undefined]`. In amandoua cazurile lotul ar sari tacut peste
   * comenzile lui, si nimeni n-ar avea de unde sa afle.
   */
  const dinColoane = Object.keys(COLOANA_EXPEDIERII).sort();
  const dinNume = Object.keys(NUMELE_CURIERULUI).sort();
  const dinOrdine = [...ORDINEA_CAUTARII].sort();

  assert.deepEqual(dinNume, dinColoane, "NUMELE_CURIERULUI si COLOANA_EXPEDIERII difera");
  assert.deepEqual(dinOrdine, dinColoane, "ORDINEA_CAUTARII si COLOANA_EXPEDIERII difera");
  assert.equal(new Set(ORDINEA_CAUTARII).size, ORDINEA_CAUTARII.length, "ordinea are duplicate");
});

test("⚠ fiecare coloana de expediere EXISTA chiar in tipurile bazei", () => {
  /*
   * ⚠ ASTA E PROBA CARE CHIAR APARA. Un nume de coloana gresit („dpd_shipment_id" in
   * locul lui „dpd_awb_number", „woot_awb_number" in locul lui „woot_order_id") nu
   * cade nici la `tsc` (harta e `Record<…, string>`), nici la citire: `rand[cheie]`
   * da `undefined`, iar `curierulEtichetei` raspunde cinstit „comanda n-are
   * eticheta". Lotul ar fi sarit peste toate comenzile acelui curier si ar fi parut
   * ca merge.
   *
   * Se citeste chiar fisierul de tipuri, nu o lista scrisa aici: o lista scrisa aici
   * ar fi a doua copie a aceleiasi greseli.
   */
  const tipuri = readFileSync("src/types/database.types.ts", "utf8");
  const bucata = tipuri.slice(tipuri.indexOf("      orders: {"));
  const randuri = bucata.slice(0, bucata.indexOf("      Relationships:"));

  const lipsa: string[] = [];
  for (const [curier, coloana] of Object.entries(COLOANA_EXPEDIERII)) {
    if (!new RegExp(`^\\s+${coloana}:`, "m").test(randuri)) lipsa.push(`${curier} → ${coloana}`);
  }
  assert.deepEqual(lipsa, [], `coloane care nu exista pe \`orders\`: ${lipsa.join(", ")}`);
});

/* ── Cine tine eticheta ─────────────────────────────────────────────────── */

test("comanda fara nicio expediere nu are curier", () => {
  assert.equal(curierulEtichetei({}), null);
  assert.equal(curierulEtichetei({ woot_order_id: null, dpd_awb_number: null }), null);
});

test("⚠ sirul GOL nu e o expediere", () => {
  /*
   * Masurat ca tipar, nu presupus: o coloana scrisa cu `""` de un import sau de o
   * reparatie ar fi trecut de `!= null`, si lotul ar fi cerut curierului eticheta unui
   * AWB inexistent — o eroare la fiecare rulare, pe o comanda care n-are ce descarca.
   */
  assert.equal(curierulEtichetei({ cargus_awb_number: "" }), null);
  assert.equal(curierulEtichetei({ cargus_awb_number: "   " }), null);
});

test("⚠ identificatorul NUMERIC zero nu e o expediere", () => {
  /* La eColet id-ul e numeric; `0` ar fi trecut de o verificare pe `!= null`. */
  assert.equal(curierulEtichetei({ ecolet_order_to_send_id: 0 }), null);
  assert.equal(curierulEtichetei({ ecolet_order_to_send_id: 42 }), "ecolet");
});

test("fiecare curier e gasit dupa coloana lui", () => {
  for (const curier of ORDINEA_CAUTARII) {
    const coloana = COLOANA_EXPEDIERII[curier];
    const valoare = coloana === "ecolet_order_to_send_id" ? 7 : "X1";
    assert.equal(
      curierulEtichetei({ [coloana]: valoare }), curier,
      `${curier} nu e gasit dupa ${coloana}`,
    );
  }
});

test("⚠ o comanda cu DOUA expedieri da prima din ordinea masurata", () => {
  /*
   * Se intampla: un AWB emis din greseala la un curier si reluat la altul. Fara o
   * ordine scrisa, raspunsul ar fi atarnat de ordinea cheilor din obiectul venit de la
   * baza, adica de ordinea coloanelor din `select` — ceva ce nimeni nu leaga de asta.
   */
  const rand = { dpd_awb_number: "D1", woot_order_id: "W1", cargus_awb_number: "C1" };
  assert.equal(curierulEtichetei(rand), "woot");
  assert.ok(ORDINEA_CAUTARII.indexOf("woot") < ORDINEA_CAUTARII.indexOf("dpd"));
});

test("⚠ DPD se cauta pe numarul de AWB, nu pe identificatorul expedierii", () => {
  /*
   * `dpd_shipment_id` e cheia de idempotenta a EMITERII (vezi `bulk-orders.actions.ts`),
   * iar eticheta se cere pe `dpd_awb_number`. Amandoua exista pe rand, deci o incurcatura
   * n-ar fi cazut la `tsc`: ar fi cerut eticheta pe un identificator pe care DPD nu-l
   * cunoaste ca AWB.
   */
  assert.equal(COLOANA_EXPEDIERII.dpd, "dpd_awb_number");
  assert.equal(curierulEtichetei({ dpd_shipment_id: "S1" }), null);
});

test("⚠ la Woot conteaza `woot_order_id`, fiindca numarul lipseste pe card", () => {
  /* Pe platile cu cardul Woot NU intoarce `awb_number`. O comanda buna ar fi fost sarita. */
  assert.equal(COLOANA_EXPEDIERII.woot, "woot_order_id");
  assert.equal(curierulEtichetei({ woot_order_id: "123", woot_awb_number: null }), "woot");
});

/* ── Numele documentului ────────────────────────────────────────────────── */

test("documentul poarta cate etichete are si ziua", () => {
  assert.equal(numeleDocumentului(18, new Date(2026, 8, 21)), "etichete-18-21.09.2026.pdf");
  assert.equal(numeleDocumentului(1, new Date(2026, 0, 5)), "etichete-1-05.01.2026.pdf");
});

test("⚠ numele nu contine semne care rup antetul", () => {
  /* Numele intra intr-un `Content-Disposition`; ghilimelele si barele il rup in doua. */
  const nume = numeleDocumentului(50, new Date(2026, 11, 31));
  assert.ok(!/["\\/\r\n]/.test(nume), nume);
});

/* ── Ce nu intra in document ────────────────────────────────────────────── */

test("⚠ UPS e scos din documentul lipit, si se spune de ce", async () => {
  /*
   * Eticheta UPS e un GIF (vezi nota din `UpsAwbModal`). Lipita ca PDF, ar fi dat
   * un document stricat sau o pagina goala — iar o pagina goala se vede abia la
   * imprimanta, cu coletul pe masa.
   */
  const { NU_INTRA_IN_DOCUMENT } = await import("./etichete-lot");
  assert.ok(NU_INTRA_IN_DOCUMENT.ups, "UPS trebuie sa aiba un motiv scris");
  for (const [curier, motiv] of Object.entries(NU_INTRA_IN_DOCUMENT)) {
    assert.ok(
      (motiv ?? "").length > 20,
      `${curier}: motivul trebuie sa spuna omului ce are de facut, nu doar ca nu se poate`,
    );
    assert.ok(ORDINEA_CAUTARII.includes(curier as CurierEticheta), `${curier} nu e un curier cunoscut`);
  }
});
