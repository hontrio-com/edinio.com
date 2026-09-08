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
  assert.equal(rambursDeIncasat({ payment_status: "paid", total: 105.5, order_source: null }), 0);
});

test("plata online ramasa NEPLATITA se incaseaza la livrare", () => {
  // Cazul real: #0033, netopia, unpaid, 105,50.
  assert.equal(rambursDeIncasat({ payment_status: "unpaid", total: 105.5, order_source: null }), 105.5);
});

test("rambursul obisnuit ramane exact cum era", () => {
  assert.equal(rambursDeIncasat({ payment_status: "unpaid", total: 249.99, order_source: null }), 249.99);
});

test("orice altceva decat decontata inseamna ca banii nu sunt la comerciant", () => {
  for (const stare of [undefined, null, "", "pending", "failed", "PAID"]) {
    assert.equal(rambursDeIncasat({ payment_status: stare, total: 80, order_source: null }), 80, `stare: ${String(stare)}`);
  }
});

test("comanda restituita nu se mai incaseaza a doua oara", () => {
  // Banii tocmai s-au intors la client; incasarea la livrare i-ar lua de doua ori.
  // Daca marfa chiar pleaca, comerciantul scrie suma cu mana in formular.
  assert.equal(rambursDeIncasat({ payment_status: "refunded", total: 185, order_source: null }), 0);
});

test("regula nu se mai uita deloc la metoda de plata", () => {
  // Comenzile de marketplace poarta metode in afara tipului („aboutyou"), dar
  // vin mereu platite, deci raman pe zero fara niciun caz special.
  assert.equal(rambursDeIncasat({ payment_status: "paid", total: 300, order_source: null }), 0);
  assert.equal(rambursDeIncasat({ payment_status: "unpaid", total: 300, order_source: null }), 300);
});

test("un total lipsa sau stricat nu produce un ramburs inventat", () => {
  for (const total of [undefined, null, "", "abc", NaN, -50, 0]) {
    assert.equal(rambursDeIncasat({ payment_status: "unpaid", total, order_source: null }), 0, `total: ${String(total)}`);
  }
  // Sirul numeric vine din baza asa, prin `numeric`.
  assert.equal(rambursDeIncasat({ payment_status: "unpaid", total: "105.50", order_source: null }), 105.5);
});

/* ══════════════════════════════════════════════════════════════════════════
   CAND BANII II IA MARKETPLACE-UL, CURIERUL COMERCIANTULUI NU MAI CERE NIMIC
   ══════════════════════════════════════════════════════════════════════════

   ⚠ DEFECTUL, gasit la auditul din 08.09.2026. Pepita are un program propriu de livrare:
   la comenzile duse de GLS-ul contractat DE EI, rambursul il incaseaza tot ei si il
   deconteaza mai tarziu comerciantului. Pagina lor romaneasca, 18.06.2025:

     „In cazul comenzilor Pepita Delivery (momentan automat de colet GLS sau livrare GLS la
      adresa), suma ramburs ajunge la Pepita."

   Comanda ramane insa `unpaid`, fiindca banii chiar n-au intrat inca. Iar regula de aici
   se uita NUMAI la starea platii, deci precompleta totalul pe orice AWB: clientul ar fi
   platit o data curierului Pepita si inca o data curierului comerciantului.

   ⚠ SI NU E O GRESEALA CARE SE VEDE. AWB-ul pleaca, coletul ajunge, iar reclamatia vine de
   la client, nu din vreun jurnal.
*/

test("⚠ o comanda al carei ramburs il ia marketplace-ul nu se mai incaseaza la usa", () => {
  const pepitaDelivery = { payment_status: "unpaid", total: 249.9, order_source: { marketplace: "pepita", incaseaza_marketplace: true } };
  assert.equal(rambursDeIncasat(pepitaDelivery), 0);
});

test("⚠ dar o comanda Pepita cu curierul COMERCIANTULUI se incaseaza normal", () => {
  /* Perechea obligatorie: fara ea, „repara" ar putea insemna „nu mai incasa nimic
     niciodata", si atunci marfa ar pleca gratis pe toate comenzile cu ramburs. */
  const curierulLui = { payment_status: "unpaid", total: 249.9, order_source: { marketplace: "pepita", incaseaza_marketplace: false } };
  assert.equal(rambursDeIncasat(curierulLui), 249.9);
});

test("comenzile fara marcaj se poarta exact ca pana acum", () => {
  /* Magazinul propriu, eMAG, si toate comenzile scrise inaintea reparatiei. */
  assert.equal(rambursDeIncasat({ payment_status: "unpaid", total: 100, order_source: null }), 100);
  assert.equal(rambursDeIncasat({ payment_status: "unpaid", total: 100, order_source: { marketplace: "emag" } }), 100);
  assert.equal(rambursDeIncasat({ payment_status: "unpaid", total: 100, order_source: {} }), 100);
});

test("⚠ marcajul se citeste STRICT, ca un sir „true” sa nu treaca drept adevar", () => {
  /* `order_source` e jsonb scris de noi, dar tot vine din baza: o valoare de alta forma
     inseamna „nu stim", si atunci se pastreaza purtarea de pana acum. */
  for (const val of ["true", 1, "da", {}, [], null, undefined]) {
    assert.equal(
      rambursDeIncasat({ payment_status: "unpaid", total: 100, order_source: { incaseaza_marketplace: val } }),
      100,
      `pentru ${JSON.stringify(val)}`,
    );
  }
});
