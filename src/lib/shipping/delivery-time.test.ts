import assert from "node:assert/strict";
import { test } from "node:test";
import { fereastraDeLivrare, normalizeazaTimpDeLivrare, parseTimpDeLivrare } from "./delivery-time";

/**
 * Termenul de livrare, citit dintr-un singur loc pentru pagina si pentru Google.
 *
 * Reclamat de un comerciant: Search Console ii semnala „deliveryTime lipseste
 * din offers.shippingDetails" pe toate paginile de produs, iar el cautase in
 * Setari → Livrare si nu gasise unde sa-l completeze. Nici nu avea unde: zilele
 * existau doar in comutatorul de AFISARE din editorul de magazin.
 */

/* ─── Sursa noua: Setari → Livrare ──────────────────────────────────────────── */

test("procesarea si tranzitul completate se citesc despartite", () => {
  const t = parseTimpDeLivrare({
    delivery_time: { enabled: true, handling_min: 1, handling_max: 2, transit_min: 2, transit_max: 4 },
  });
  assert.deepEqual(t, { procesareMin: 1, procesareMax: 2, tranzitMin: 2, tranzitMax: 4 });
});

test("stins, nu se declara nimic — nici din campurile ramase completate", () => {
  // Un termen pe care comerciantul l-a stins nu mai e o promisiune a lui, chiar
  // daca zilele au ramas in baza ca sa nu fie recompletate la reaprindere.
  assert.equal(
    parseTimpDeLivrare({
      delivery_time: { enabled: false, handling_min: 1, handling_max: 2, transit_min: 2, transit_max: 4 },
    }),
    null,
  );
});

test("o singura jumatate nu e un termen de livrare", () => {
  // Fara tranzit, `deliveryTime` n-ar spune cat dureaza livrarea, ci doar cat
  // sta comanda pe masa magazinului.
  assert.equal(
    parseTimpDeLivrare({ delivery_time: { enabled: true, handling_min: 1, handling_max: 2 } }),
    null,
  );
});

test("maximul sub minim nu se accepta, in niciuna dintre etape", () => {
  assert.equal(
    parseTimpDeLivrare({
      delivery_time: { enabled: true, handling_min: 5, handling_max: 2, transit_min: 1, transit_max: 3 },
    }),
    null,
  );
});

test("zilele venite ca sir din formular raman numere", () => {
  // Valorile trec prin `<input type="number">` si jsonb; un „3" scris de mana e
  // acelasi lucru cu 3, iar respins aici ar goli termenul tocmai celui care l-a
  // completat.
  const t = parseTimpDeLivrare({
    delivery_time: { enabled: true, handling_min: "0", handling_max: "1", transit_min: "2", transit_max: "3" },
  });
  assert.deepEqual(t, { procesareMin: 0, procesareMax: 1, tranzitMin: 2, tranzitMax: 3 });
});

test("zero zile de procesare e un raspuns valid, nu un camp gol", () => {
  // „Expediez in aceeasi zi" e o afirmatie pe care un magazin o poate face.
  const t = parseTimpDeLivrare({
    delivery_time: { enabled: true, handling_min: 0, handling_max: 0, transit_min: 1, transit_max: 2 },
  });
  assert.deepEqual(t, { procesareMin: 0, procesareMax: 0, tranzitMin: 1, tranzitMax: 2 });
});

test("peste o luna nu mai e estimare de livrare", () => {
  assert.equal(
    parseTimpDeLivrare({
      delivery_time: { enabled: true, handling_min: 1, handling_max: 2, transit_min: 1, transit_max: 400 },
    }),
    null,
  );
});

/* ─── Rezerva: estimarea veche din editor ───────────────────────────────────── */

test("⚠ estimarea din editor e TOTALUL, deci se citeste ca tranzit fara procesare", () => {
  /*
   * Casuta de pe pagina arata „azi + min_days … azi + max_days", adica din
   * clipa comenzii pana la usa. Socotita ca tranzit peste o procesare de 0-1
   * zile — cum se emitea pana acum — Google publica o zi in plus fata de ce
   * scrie pe pagina ACELUIASI produs.
   */
  const t = parseTimpDeLivrare({ delivery_estimate: { enabled: true, min_days: 2, max_days: 4 } });
  assert.deepEqual(t, { procesareMin: 0, procesareMax: 0, tranzitMin: 2, tranzitMax: 4 });
  assert.deepEqual(fereastraDeLivrare(t!), { min: 2, max: 4 }, "fereastra ramane cea de pe pagina");
});

test("termenul din Setari bate estimarea veche din editor", () => {
  // Altfel acelasi magazin ar avea doua raspunsuri la aceeasi intrebare, iar
  // cel afisat si cel trimis catre Google s-ar departa la prima modificare.
  const t = parseTimpDeLivrare({
    delivery_time: { enabled: true, handling_min: 1, handling_max: 1, transit_min: 3, transit_max: 5 },
    delivery_estimate: { enabled: true, min_days: 2, max_days: 4 },
  });
  assert.deepEqual(fereastraDeLivrare(t!), { min: 4, max: 6 });
});

test("cu termenul din Setari stins, se cade inapoi pe estimarea din editor", () => {
  const t = parseTimpDeLivrare({
    delivery_time: { enabled: false, handling_min: 1, handling_max: 1, transit_min: 3, transit_max: 5 },
    delivery_estimate: { enabled: true, min_days: 2, max_days: 4 },
  });
  assert.deepEqual(fereastraDeLivrare(t!), { min: 2, max: 4 });
});

test("un magazin care n-a declarat nimic nu primeste un termen inventat", () => {
  assert.equal(parseTimpDeLivrare(null), null);
  assert.equal(parseTimpDeLivrare({}), null);
  assert.equal(parseTimpDeLivrare({ delivery_estimate: { enabled: false, min_days: 2, max_days: 4 } }), null);
});

/* ─── Ce se scrie in baza ───────────────────────────────────────────────────── */

test("formularul curatat pastreaza zilele si cand comutatorul e stins", () => {
  // Stins nu inseamna sters: la reaprindere, omul isi gaseste zilele acolo.
  assert.deepEqual(
    normalizeazaTimpDeLivrare({ enabled: false, handling_min: "1", handling_max: "2", transit_min: 1, transit_max: 3 }),
    { enabled: false, handling_min: 1, handling_max: 2, transit_min: 1, transit_max: 3 },
  );
});

test("un formular invalid nu produce un rand de scris", () => {
  // Apelantul (actiunea de salvare) lasa atunci randul de dinainte neatins, ca
  // sa nu se stearga un termen bun din cauza unei greseli de tastare.
  assert.equal(normalizeazaTimpDeLivrare({ enabled: true, handling_min: 2, handling_max: 1, transit_min: 1, transit_max: 3 }), null);
  assert.equal(normalizeazaTimpDeLivrare({ enabled: true, transit_min: 1, transit_max: 3 }), null);
  assert.equal(normalizeazaTimpDeLivrare(null), null);
});
