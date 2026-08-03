import assert from "node:assert/strict";
import { test } from "node:test";
import { rambursDeIncasat } from "./ramburs";

/**
 * Cat are de incasat curierul. Toate cele opt locuri care completau suma puneau
 * zero pentru orice metoda diferita de ramburs, fara sa se uite daca banii chiar
 * intrasera. Comanda #0033 de la Suporti-Numar.ro a plecat asa: netopia,
 * neplatita, 105,50 lei, cu AWB si fara nicio cale de incasare.
 */

test("comanda platita nu mai are ce incasa curierul", () => {
  assert.equal(rambursDeIncasat({ payment_status: "paid", total: 105.5 }), 0);
});

test("plata online ramasa NEPLATITA se incaseaza la livrare", () => {
  // Cazul real: #0033, netopia, unpaid, 105,50.
  assert.equal(rambursDeIncasat({ payment_status: "unpaid", total: 105.5 }), 105.5);
});

test("rambursul obisnuit ramane exact cum era", () => {
  assert.equal(rambursDeIncasat({ payment_status: "unpaid", total: 249.99 }), 249.99);
});

test("orice altceva decat decontata inseamna ca banii nu sunt la comerciant", () => {
  for (const stare of [undefined, null, "", "pending", "failed", "PAID"]) {
    assert.equal(rambursDeIncasat({ payment_status: stare, total: 80 }), 80, `stare: ${String(stare)}`);
  }
});

test("comanda restituita nu se mai incaseaza a doua oara", () => {
  // Banii tocmai s-au intors la client; incasarea la livrare i-ar lua de doua ori.
  // Daca marfa chiar pleaca, comerciantul scrie suma cu mana in formular.
  assert.equal(rambursDeIncasat({ payment_status: "refunded", total: 185 }), 0);
});

test("regula nu se mai uita deloc la metoda de plata", () => {
  // Comenzile de marketplace poarta metode in afara tipului („aboutyou"), dar
  // vin mereu platite, deci raman pe zero fara niciun caz special.
  assert.equal(rambursDeIncasat({ payment_status: "paid", total: 300 }), 0);
  assert.equal(rambursDeIncasat({ payment_status: "unpaid", total: 300 }), 300);
});

test("un total lipsa sau stricat nu produce un ramburs inventat", () => {
  for (const total of [undefined, null, "", "abc", NaN, -50, 0]) {
    assert.equal(rambursDeIncasat({ payment_status: "unpaid", total }), 0, `total: ${String(total)}`);
  }
  // Sirul numeric vine din baza asa, prin `numeric`.
  assert.equal(rambursDeIncasat({ payment_status: "unpaid", total: "105.50" }), 105.5);
});
