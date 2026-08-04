import assert from "node:assert/strict";
import { test } from "node:test";
import { contextulCosului, subtotalMaximDinCatalog, type ProdusCotat } from "./cart-weight";

/**
 * Cantitatea nu atingea deloc pretul livrarii.
 *
 * Produsele cosului se incarcau numai daca magazinul avea reguli de transport sau
 * DPD pe kilograme — si niciun magazin din 127 n-avea vreuna. Deci greutatea
 * ramanea zero, cotatia pleca pe rezerva de un kilogram, iar comerciantul platea
 * curierul pentru cat cantareste coletul adevarat. 1408 produse active de pe 14
 * magazine au greutate completata.
 */

const p = (id: string, over: Record<string, unknown> = {}) => ({ id, weight_grams: 1000, ...over });

test("greutatea se inmulteste cu bucatile", () => {
  // Zece bucati de un kilogram inseamna zece kilograme, nu unul.
  const c = contextulCosului([{ productId: "p1", quantity: 10 }], [p("p1")]);
  assert.equal(c.weightKg, 10);
  assert.equal(c.quantity, 10);
});

test("mai multe linii se aduna", () => {
  const c = contextulCosului(
    [{ productId: "p1", quantity: 2 }, { productId: "p2", quantity: 3 }],
    [p("p1", { weight_grams: 250 }), p("p2", { weight_grams: 1500 })],
  );
  assert.equal(c.weightKg, 5); // 2 x 0,25 + 3 x 1,5
  assert.equal(c.quantity, 5);
});

test("produsele fara greutate completata nu inventeaza una", () => {
  // Azi niciun produs de pe platforma n-are `weight_grams`, deci asta e cazul
  // curent: se intoarce zero, iar apelantul cade pe rezerva lui de un kilogram.
  const c = contextulCosului([{ productId: "p1", quantity: 4 }], [p("p1", { weight_grams: null })]);
  assert.equal(c.weightKg, 0);
  assert.equal(c.quantity, 4, "bucatile se numara oricum");
});

test("un produs negasit in catalog isi pierde greutatea, nu bucatile", () => {
  // Sters, sau al altui magazin: coletul tot pleaca cu bucatile lui.
  const c = contextulCosului([{ productId: "p1", quantity: 2 }, { productId: "strain", quantity: 3 }], [p("p1")]);
  assert.equal(c.weightKg, 2);
  assert.equal(c.quantity, 5);
});

test("cantitatea se clemeaza, ca in browser", () => {
  // La comanda, ce trece de plafon se REFUZA, deci un cos de 5000 de bucati nu
  // ajunge sa fie livrat. Aici clema tine doar greutatea intr-un numar posibil.
  assert.equal(contextulCosului([{ productId: "p1", quantity: 0.5 }], [p("p1")]).weightKg, 1);
  assert.equal(contextulCosului([{ productId: "p1", quantity: -3 }], [p("p1")]).weightKg, 1);
  assert.equal(contextulCosului([{ productId: "p1", quantity: NaN }], [p("p1")]).weightKg, 1);
  assert.equal(contextulCosului([{ productId: "p1", quantity: 1e9 }], [p("p1")]).weightKg, 999);
});

test("o greutate negativa in catalog nu scade din colet", () => {
  const c = contextulCosului([{ productId: "p1", quantity: 1 }, { productId: "p2", quantity: 1 }],
    [p("p1"), p("p2", { weight_grams: -5000 })]);
  assert.equal(c.weightKg, 1);
});

test("clasele, categoriile si id-urile ies fara duplicate", () => {
  const c = contextulCosului(
    [{ productId: "p1", quantity: 1 }, { productId: "p2", quantity: 1 }, { productId: "p1", quantity: 1 }],
    [p("p1", { shipping_class: "fragil", category: "c1" }), p("p2", { shipping_class: "fragil", category: "c2" })],
  );
  assert.deepEqual(c.classIds, ["fragil"]);
  assert.deepEqual(c.categories, ["c1", "c2"]);
  assert.deepEqual(c.productIds, ["p1", "p2"]);
});

test("fara cos, contextul e gol — nu zero-uri inventate", () => {
  assert.deepEqual(contextulCosului(undefined, []), {
    weightKg: 0, quantity: 0, classIds: [], categories: [], productIds: [],
  });
});

// ── Plafonul de subtotal pentru regulile de transport ────────────────────────
//
// Regulile („livrare gratuita peste 200 de lei") primeau subtotalul de la
// BROWSER, iar pretul care iesea din ele pleaca SEMNAT: cine trimitea o suma
// umflata obtinea transport gratuit semnat pentru un cos ieftin.

const CATALOG: ProdusCotat[] = [
  { id: "p1", price: 50 },
  { id: "p2", price: 25 },
  { id: "fara-pret", price: null },
];

test("plafonul e suma din catalog, nu ce spune clientul", () => {
  assert.equal(subtotalMaximDinCatalog([{ productId: "p1", quantity: 2 }], CATALOG), 100);
  assert.equal(
    subtotalMaximDinCatalog([{ productId: "p1", quantity: 1 }, { productId: "p2", quantity: 4 }], CATALOG),
    150,
  );
});

test("ATACUL: suma umflata e taiata la cat sustine catalogul", () => {
  const cerutDeClient = 5000;
  const plafon = subtotalMaximDinCatalog([{ productId: "p1", quantity: 1 }], CATALOG);
  assert.equal(Math.min(cerutDeClient, plafon), 50, "nu poate depasi 50 lei");
});

test("CAZUL LEGITIM: o reducere coboara suma si trece neatinsa", () => {
  const dupaReducere = 40; // 50 lei cu 20% reducere
  const plafon = subtotalMaximDinCatalog([{ productId: "p1", quantity: 1 }], CATALOG);
  assert.equal(Math.min(dupaReducere, plafon), 40, "reducerea nu e anulata de plafon");
});

test("un cos nedeclarat nu sustine nicio suma", () => {
  assert.equal(subtotalMaximDinCatalog([], CATALOG), 0);
  assert.equal(subtotalMaximDinCatalog(undefined, CATALOG), 0);
});

test("produsele negasite sau fara pret nu adauga la plafon", () => {
  assert.equal(subtotalMaximDinCatalog([{ productId: "inexistent", quantity: 9 }], CATALOG), 0);
  assert.equal(subtotalMaximDinCatalog([{ productId: "fara-pret", quantity: 9 }], CATALOG), 0);
});

test("cantitatea absurda e normalizata, ca peste tot", () => {
  const r = subtotalMaximDinCatalog([{ productId: "p1", quantity: 99999 }], CATALOG);
  assert.ok(r <= 50 * 999, "cantitatea trece prin normalizeazaCantitate");
});
