import assert from "node:assert/strict";
import { test } from "node:test";
import { baniiAuIntrat, tipIncasareOblio } from "./incasare";
import { rambursDeIncasat } from "@/lib/orders/ramburs";

/**
 * Oblio marca factura incasata la emitere pentru ORICE comanda cu ramburs, chiar
 * neplatita. Masurat in productie pe 2026-08-04: 72 din 96 de comenzi sunt ramburs
 * neplatit, adica exact starea care intra pe usa gresita.
 */

test("rambursul neplatit NU este o incasare", () => {
  // Chiar starea celor 72 de comenzi din productie.
  assert.equal(baniiAuIntrat({ payment_status: "unpaid" }), false);
});

test("rambursul deja incasat de curier este o incasare", () => {
  // 5 comenzi in productie: metoda ramane ramburs, dar banii au intrat.
  assert.equal(baniiAuIntrat({ payment_status: "paid" }), true);
});

test("comanda restituita nu pleaca marcata incasata", () => {
  // Banii au intrat si au iesit la loc: la momentul emiterii nu sunt la comerciant.
  assert.equal(baniiAuIntrat({ payment_status: "refunded" }), false);
});

test("starea lipsa nu se citeste niciodata ca plata facuta", () => {
  assert.equal(baniiAuIntrat({ payment_status: null }), false);
  assert.equal(baniiAuIntrat({ payment_status: undefined }), false);
  assert.equal(baniiAuIntrat({ payment_status: "pending" }), false);
  assert.equal(baniiAuIntrat({ payment_status: "failed" }), false);
});

test("metoda de plata nu are cum sa mai raspunda in locul starii platii", () => {
  // Vechea conditie Oblio era `status !== paid && metoda !== cash_on_delivery`,
  // deci metoda decidea. Semnatura nici nu mai primeste metoda.
  for (const metoda of ["cash_on_delivery", "netopia", "stripe", "ipay", "klarna", "revolut"]) {
    assert.equal(baniiAuIntrat({ payment_status: "unpaid" }), false, metoda);
  }
});

test("daca factura iese incasata, curierul nu mai are ce colecta", () => {
  /*
   * Invariantul care leaga regula asta de `rambursDeIncasat` din lib/orders. Cele
   * doua intrebari sunt vecine, nu identice: „restituita" da 0 lei de colectat, dar
   * NU e incasare la emitere. Implicatia adevarata e intr-o singura directie, si e
   * cea care conteaza: nu se poate ca acelasi ban sa fie si incasat pe factura, si
   * de luat de la client la usa.
   */
  for (const stare of ["paid", "unpaid", "refunded", "pending", "failed"]) {
    if (baniiAuIntrat({ payment_status: stare })) {
      assert.equal(rambursDeIncasat({ payment_status: stare, total: 105.5 }), 0, stare);
    }
  }
});

test("tipul incasarii Oblio urmeaza metoda de plata", () => {
  assert.equal(tipIncasareOblio("cash_on_delivery"), "Ramburs");
  assert.equal(tipIncasareOblio("netopia"), "Card");
  assert.equal(tipIncasareOblio("stripe"), "Card");
  assert.equal(tipIncasareOblio("ipay"), "Card");
  assert.equal(tipIncasareOblio("revolut"), "Card");
  assert.equal(tipIncasareOblio("klarna"), "Alta incasare banca");
});

test("o metoda necunoscuta nu opreste emiterea", () => {
  assert.equal(tipIncasareOblio("bitcoin"), "Alta incasare banca");
  assert.equal(tipIncasareOblio(null), "Alta incasare banca");
  assert.equal(tipIncasareOblio(undefined), "Alta incasare banca");
});
