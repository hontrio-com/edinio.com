import { test } from "node:test";
import assert from "node:assert/strict";
import { totaluriComanda } from "./totals-box";

/*
 * Cifrele de mai jos sunt copiate din productie (proiect rtefdpioqmowkdiybwrr),
 * nu inventate: sunt exact comenzile pe care caseta le arata gresit pe 2026-08-03.
 */

const GOL = {
  discountAmount: 0,
  cardDiscount: 0,
  codDiscount: 0,
  codFee: 0,
};

test("comanda #0073: extraoptiunea de 5 lei nu era nicaieri in caseta", () => {
  const t = totaluriComanda({
    items: [
      { product_id: "9f0c-uuid", price: 40, quantity: 1 },
      { product_id: "extra_ambalare", price: 5, quantity: 1 },
    ],
    subtotal: "40.00",
    shippingCost: "20.00",
    ...GOL,
    vatAmount: "7.81",
    vatRate: "21.00",
    total: "65.00",
    setariTva: { vat_enabled: true, prices_include_vat: true },
  });
  assert.equal(t.extras, 5);
  assert.equal(t.sumaRandurilor, 65);
  assert.equal(t.diferenta, 0);
});

test("comanda #0018: extraoptiuni fara TVA - lipsa randului era singura cauza", () => {
  const t = totaluriComanda({
    items: [
      { product_id: "9f0c-uuid", price: 40, quantity: 1 },
      { product_id: "extra_cadou", price: 5, quantity: 1 },
    ],
    subtotal: 40,
    shippingCost: 20,
    ...GOL,
    vatAmount: 0,
    vatRate: 0,
    total: 65,
    setariTva: { vat_enabled: true, prices_include_vat: true },
  });
  assert.equal(t.tvaEticheta, null, "fara cifra de TVA nu se arata randul");
  assert.equal(t.sumaRandurilor, 65);
});

test("comanda #0074: TVA-ul extras din pret nu se mai aduna in coloana", () => {
  const t = totaluriComanda({
    items: [{ product_id: "9f0c-uuid", price: 40, quantity: 1 }],
    subtotal: "40.00",
    shippingCost: "20.00",
    ...GOL,
    vatAmount: "6.94",
    vatRate: "21.00",
    total: "60.00",
    setariTva: { vat_enabled: true, prices_include_vat: true },
  });
  assert.equal(t.tva, 6.94, "cifra ramane vizibila, ca sa se poata pune langa factura");
  assert.equal(t.tvaInTotal, false);
  assert.equal(t.tvaEticheta, "TVA (21%) inclus");
  assert.equal(t.sumaRandurilor, 60);
  assert.equal(t.diferenta, 0);
});

test("ORD-MS1WS5QR-09F: cea mai mare umflare masurata, 53,80 pe un total de 310", () => {
  const t = totaluriComanda({
    items: [{ product_id: "9f0c-uuid", price: 310, quantity: 1 }],
    subtotal: "310.00",
    shippingCost: "0.00",
    ...GOL,
    vatAmount: "53.80",
    vatRate: "21.00",
    total: "310.00",
    setariTva: { vat_enabled: true, prices_include_vat: true },
  });
  assert.equal(t.sumaRandurilor, 310);
  assert.equal(t.diferenta, 0);
});

test("comanda #0064: reducerea de card se scade, TVA-ul inclus tot nu se aduna", () => {
  const t = totaluriComanda({
    items: [{ product_id: "9f0c-uuid", price: 118, quantity: 1 }],
    subtotal: "118.00",
    shippingCost: "20.00",
    discountAmount: 0,
    cardDiscount: "11.80",
    codDiscount: 0,
    codFee: 0,
    vatAmount: "20.48",
    vatRate: "21.00",
    total: "126.20",
    setariTva: { vat_enabled: true, prices_include_vat: true },
  });
  assert.equal(t.reducereCard, 11.8);
  assert.equal(t.sumaRandurilor, 126.2);
  assert.equal(t.diferenta, 0);
});

test("magazin cu preturi NETE: TVA-ul chiar se aduna si eticheta nu spune inclus", () => {
  // eSAFE e singurul magazin cu prices_include_vat = false azi. La 100 marfa +
  // 20 transport, baza e 120 si TVA-ul de 25,20 se plateste peste, deci total 145,20.
  const t = totaluriComanda({
    items: [{ product_id: "9f0c-uuid", price: 100, quantity: 1 }],
    subtotal: 100,
    shippingCost: 20,
    ...GOL,
    vatAmount: 25.2,
    vatRate: 21,
    total: 145.2,
    setariTva: { vat_enabled: true, prices_include_vat: false },
  });
  assert.equal(t.tvaInTotal, true);
  assert.equal(t.tvaEticheta, "TVA (21%)");
  assert.equal(t.sumaRandurilor, 145.2);
  assert.equal(t.diferenta, 0);
});

test("taxa de ramburs se aduna, reducerea de ramburs se scade", () => {
  const t = totaluriComanda({
    items: [{ product_id: "9f0c-uuid", price: 100, quantity: 1 }],
    subtotal: 100,
    shippingCost: 20,
    discountAmount: 10,
    cardDiscount: 0,
    codDiscount: 5,
    codFee: 7,
    vatAmount: 0,
    vatRate: 0,
    total: 112,
    setariTva: { vat_enabled: false, prices_include_vat: true },
  });
  assert.equal(t.sumaRandurilor, 112);
  assert.equal(t.diferenta, 0);
});

test("comanda #0002 din 9 iunie: totalul salvat nu se explica, diferenta se raporteaza", () => {
  // Scrisa de codul de dinaintea reparatiei de TVA din 24 iulie: 44 + 19,99 = 63,99,
  // dar in baza s-au scris 71,63 fiindca s-a mai adaugat o data TVA-ul deja continut.
  // Caseta NU trebuie sa fabrice un rand ca sa ajunga la 71,63.
  const t = totaluriComanda({
    items: [{ product_id: "9f0c-uuid", price: 44, quantity: 1 }],
    subtotal: "44.00",
    shippingCost: "19.99",
    ...GOL,
    vatAmount: "7.64",
    vatRate: "21.00",
    total: "71.63",
    setariTva: { vat_enabled: true, prices_include_vat: true },
  });
  assert.equal(t.sumaRandurilor, 63.99);
  assert.equal(t.diferenta, -7.64);
});

test("TVA stins din setari: cifra veche de pe comanda nu mai apare", () => {
  const t = totaluriComanda({
    items: [{ product_id: "9f0c-uuid", price: 40, quantity: 1 }],
    subtotal: 40,
    shippingCost: 20,
    ...GOL,
    vatAmount: 6.94,
    vatRate: 21,
    total: 60,
    setariTva: { vat_enabled: false, prices_include_vat: true },
  });
  assert.equal(t.tva, 0);
  assert.equal(t.tvaEticheta, null);
  assert.equal(t.sumaRandurilor, 60);
});

test("items null sau preturi ca text nu arunca si nu produc NaN", () => {
  const t = totaluriComanda({
    items: null,
    subtotal: null,
    shippingCost: undefined,
    ...GOL,
    vatAmount: "nu-i numar",
    vatRate: null,
    total: "60",
    setariTva: { vat_enabled: true, prices_include_vat: true },
  });
  assert.equal(t.extras, 0);
  assert.equal(t.subtotal, 0);
  assert.equal(t.tva, 0);
  assert.equal(t.sumaRandurilor, 0);
  assert.equal(t.diferenta, -60);
});

test("mai multe extraoptiuni, cu cantitate, se aduna toate", () => {
  const t = totaluriComanda({
    items: [
      { product_id: "9f0c-uuid", price: "40", quantity: "2" },
      { product_id: "extra_ambalare", price: "5", quantity: "2" },
      { product_id: "extra_prioritate", price: "9.99", quantity: "1" },
    ],
    subtotal: 80,
    shippingCost: 0,
    ...GOL,
    vatAmount: 0,
    vatRate: 0,
    total: 99.99,
    setariTva: { vat_enabled: false, prices_include_vat: true },
  });
  assert.equal(t.extras, 19.99);
  assert.equal(t.diferenta, 0);
});
