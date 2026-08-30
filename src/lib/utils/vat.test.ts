import assert from "node:assert/strict";
import { test } from "node:test";
import { computeVat, vatBase, vatLabel } from "./vat";

/**
 * TVA-ul se datoreaza pe ce INCASEAZA comerciantul, nu pe pretul de raft.
 *
 * Pana in 2026-08-02 baza era inainte de reducere. La magazinele cu preturi fara
 * TVA clientul chiar platea mai mult, iar la cele cu preturi cu TVA numarul scris
 * pe comanda se contrazicea cu factura, unde reducerea pleaca pe linie separata
 * si furnizorul isi face socoteala pe netul de dupa reducere.
 */

const gol = { goods: 0, extras: 0, shipping: 0, discount: 0, cardDiscount: 0, codDiscount: 0, codFee: 0 };
const CU_TVA = { vat_enabled: true, vat_rate: 19, prices_include_vat: true };
const FARA_TVA = { vat_enabled: true, vat_rate: 19, prices_include_vat: false };

test("cuponul scade baza", () => {
  assert.equal(vatBase({ ...gol, goods: 100, discount: 20 }), 80);
});

test("reducerile de card si de ramburs scad si ele baza", () => {
  // Sunt tot reduceri de pret, deci micsoreaza ce se incaseaza.
  assert.equal(vatBase({ ...gol, goods: 100, cardDiscount: 5, codDiscount: 3 }), 92);
});

test("extraoptiunile si taxa de ramburs INTRA in baza", () => {
  assert.equal(vatBase({ ...gol, goods: 100, extras: 10, codFee: 5 }), 115);
});

test("baza nu poate cobori sub zero", () => {
  assert.equal(vatBase({ ...gol, goods: 50, discount: 80 }), 0);
});

test("baza se rotunjeste la ban, nu ramane cu coada de virgula mobila", () => {
  // 10 x 19,99 fac 199.89999999999998 in virgula mobila.
  assert.equal(vatBase({ ...gol, goods: 199.89999999999998 }), 199.9);
});

/* ── Scenariul din audit: marfa 100, cupon 20, TVA 19% ── */

test("preturi FARA TVA: clientul nu mai e supraincarcat", () => {
  const baza = vatBase({ ...gol, goods: 100, discount: 20 });
  const { vatAmount, vatAddOn } = computeVat(baza, FARA_TVA);
  assert.equal(vatAmount, 15.2, "TVA pe 80, nu pe 100");
  assert.equal(vatAddOn, 15.2, "se adauga la total");
  // Total = marfa - reducere + TVA. Inainte iesea 99.
  assert.equal(100 - 20 + vatAddOn, 95.2);
});

test("preturi CU TVA: totalul NU se schimba, doar numarul inregistrat", () => {
  const baza = vatBase({ ...gol, goods: 100, discount: 20 });
  const { vatAmount, vatAddOn } = computeVat(baza, CU_TVA);
  assert.equal(vatAddOn, 0, "pretul include deja TVA, nu se adauga nimic");
  assert.equal(vatAmount, 12.77, "TVA extras din 80, nu din 100 (era 15,97)");
});

test("fara reducere, nimic nu se schimba fata de inainte", () => {
  const baza = vatBase({ ...gol, goods: 100 });
  assert.equal(baza, 100);
  assert.equal(computeVat(baza, FARA_TVA).vatAddOn, 19);
  assert.equal(computeVat(baza, CU_TVA).vatAmount, 15.97);
});

test("TVA stins inseamna zero, oricare ar fi baza", () => {
  const cfg = { vat_enabled: false, vat_rate: 19, prices_include_vat: false };
  assert.deepEqual(computeVat(vatBase({ ...gol, goods: 100 }), cfg), { vatAmount: 0, vatAddOn: 0 });
});

test("baza zero nu produce TVA", () => {
  assert.deepEqual(computeVat(0, FARA_TVA), { vatAmount: 0, vatAddOn: 0 });
});

test("cota de 9% si de 5% se aplica la fel", () => {
  const baza = vatBase({ ...gol, goods: 200, discount: 50 });
  assert.equal(computeVat(baza, { ...FARA_TVA, vat_rate: 9 }).vatAmount, 13.5);
  assert.equal(computeVat(baza, { ...FARA_TVA, vat_rate: 5 }).vatAmount, 7.5);
});

/* ── Eticheta de langa pret ── */

test("eticheta spune ce zice setarea de preturi, nu altceva", () => {
  assert.equal(vatLabel({ vat_enabled: true, prices_include_vat: true }), "TVA inclus");
  assert.equal(vatLabel({ vat_enabled: true, prices_include_vat: false }), "fără TVA");
});

test("magazinul neplatitor de TVA nu arata nicio eticheta", () => {
  assert.equal(vatLabel({ vat_enabled: false, prices_include_vat: true }), null);
});

test("comerciantul o poate stinge, dar implicit ramane pornita", () => {
  assert.equal(vatLabel({ vat_enabled: true, prices_include_vat: true, show_vat_label: false }), null);
  // Nedefinit inseamna pornita: la magazinele vechi eticheta se afisa deja, si
  // n-are de ce sa dispara peste noapte.
  assert.equal(vatLabel({ vat_enabled: true, prices_include_vat: false, show_vat_label: undefined }), "fără TVA");
});

/**
 * Verificarea care conteaza cel mai mult: ce se vede == ce se incaseaza.
 *
 * Serverul, finalizarea cosului si formularul de comanda directa compun totalul
 * din aceleasi bucati. Daca formula de aici se schimba fara ca toate trei sa fie
 * atinse, testul asta nu prinde nimic — de aia baza sta intr-o singura functie,
 * si de aia toate trei o cheama pe ea.
 */
test("acelasi total, oricine il calculeaza", () => {
  const p = { goods: 249.9, extras: 12.5, shipping: 19.9, discount: 25, cardDiscount: 4.5, codDiscount: 0, codFee: 4.99 };

  const baza = vatBase(p);
  const { vatAddOn } = computeVat(baza, FARA_TVA);
  const total = Math.max(0, Math.round(
    (p.goods + p.extras - p.discount - p.cardDiscount - p.codDiscount + p.codFee + p.shipping + vatAddOn) * 100,
  ) / 100);

  // Baza = 249,90 + 12,50 + 19,90 - 25 - 4,50 + 4,99 = 257,79; TVA 19% = 48,98.
  assert.equal(baza, 257.79);
  assert.equal(vatAddOn, 48.98);
  assert.equal(total, 306.77);
});

/* ─── Transportul, prestatie accesorie ────────────────────────────────────── */

/**
 * Transportul statea in afara bazei si se aduna brut la total, desi toate cele
 * trei case de facturare ii pun aceleasi campuri de TVA ca marfii. Ieseau doua
 * numere pentru aceeasi comanda.
 */

test("transportul INTRA in baza, ca orice prestatie accesorie", () => {
  assert.equal(vatBase({ ...gol, goods: 100, shipping: 20 }), 120);
});

test("cazul eSAFE: preturi FARA TVA — totalul creste cu TVA-ul transportului", () => {
  // 500 lei marfa + 45 transport, cota 21. Comanda incasa 650,00 iar SmartBill
  // factura 659,45: diferenta de 9,45 ramanea vesnic neincasata pe factura.
  const baza = vatBase({ ...gol, goods: 500, shipping: 45 });
  const { vatAmount, vatAddOn } = computeVat(baza, { vat_enabled: true, vat_rate: 21, prices_include_vat: false });
  assert.equal(baza, 545);
  assert.equal(vatAmount, 114.45);
  assert.equal(500 + 45 + vatAddOn, 659.45);
});

test("cazul suporti-numar: preturi CU TVA — totalul NU se misca, doar numarul inregistrat", () => {
  // Comanda #0074: 40 marfa + 20 transport = 60,00. Panoul scria „TVA (21%) 6,94"
  // pentru o factura care spunea 10,41.
  const baza = vatBase({ ...gol, goods: 40, shipping: 20 });
  const { vatAmount, vatAddOn } = computeVat(baza, { vat_enabled: true, vat_rate: 21, prices_include_vat: true });
  assert.equal(vatAmount, 10.41);
  assert.equal(vatAddOn, 0, "la preturi cu TVA inclus, baza nu poate misca totalul");
  assert.equal(40 + 20 + vatAddOn, 60);
});

test("transport gratuit: nimic nu se schimba fata de inainte", () => {
  // Peste prag transportul e zero, deci si baza si totalul raman cele de dinainte
  // de reparatie. Ramura asta acopera majoritatea comenzilor din productie.
  const baza = vatBase({ ...gol, goods: 250, shipping: 0 });
  assert.equal(baza, 250);
  assert.equal(computeVat(baza, FARA_TVA).vatAddOn, 47.5);
});

test("magazinul neplatitor de TVA nu incaseaza nimic in plus pe transport", () => {
  const baza = vatBase({ ...gol, goods: 100, shipping: 25 });
  assert.deepEqual(computeVat(baza, { vat_enabled: false, vat_rate: 21, prices_include_vat: false }),
    { vatAmount: 0, vatAddOn: 0 });
});
