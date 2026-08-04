import assert from "node:assert/strict";
import { test } from "node:test";
import { fbtInCos } from "./fbt-in-cos";
import type { BumpItem } from "./bump-pricing";
import { aplicaOfertaPeLinii } from "./offer-pricing";
import { pretulSetului, imparteEconomiaCompanionilor } from "./fbt-pricing";
import type { OfferConfig, OfferProduct } from "./offer.types";

/**
 * Formularul de comanda si serverul trebuie sa spuna acelasi numar despre setul
 * FBT cand un companion e DEJA in cos. Pana acum formularul scotea linia din cos
 * si trimitea setul cu 1 bucata: clientul cu 3 bucati pleca cu 1, fara ca ecranul
 * sa spuna ceva.
 */

const linie = (id: string, pret: number, n: number): BumpItem =>
  ({ product_id: id, name: id, price: pret, quantity: n });

test("companionul din cos isi pastreaza cantitatea si nu se mai trimite a doua oara", () => {
  const r = fbtInCos([linie("comp", 34.28, 3)], [{ product_id: "comp", price: 30.25 }]);
  assert.deepEqual(r.companioniNoi, []);
  // 34,28 - 30,25 = 4,03 pe O SINGURA bucata din cele 3, nu pe toate.
  assert.equal(r.economieTotala, 4.03);
  assert.deepEqual(r.economiePeLinie, [4.03]);
});

test("companionul care nu e in cos intra ca linie proprie", () => {
  const r = fbtInCos([linie("altul", 10, 1)], [{ product_id: "comp", price: 30.25 }]);
  assert.deepEqual(r.companioniNoi, [{ product_id: "comp", price: 30.25 }]);
  assert.equal(r.economieTotala, 0);
  assert.deepEqual(r.economiePeLinie, [0]);
});

test("economiePeLinie are exact atatea elemente cate linii de cos", () => {
  const r = fbtInCos([linie("a", 10, 2), linie("comp", 50, 4), linie("b", 7, 1)], [{ product_id: "comp", price: 20 }]);
  assert.equal(r.economiePeLinie.length, 3);
  assert.deepEqual(r.economiePeLinie, [0, 30, 0]);
});

test("un pret de set mai mare decat pretul din cos nu scade nimic", () => {
  // Cosul are deja o treapta de cantitate mai buna decat setul: setul nu are ce adauga.
  const r = fbtInCos([linie("comp", 25, 5)], [{ product_id: "comp", price: 30.25 }]);
  assert.equal(r.economieTotala, 0);
  assert.deepEqual(r.companioniNoi, []);
});

test("doi companioni ai aceluiasi produs nu reduc de doua ori aceeasi linie", () => {
  const r = fbtInCos(
    [linie("comp", 100, 2)],
    [{ product_id: "comp", price: 60 }, { product_id: "comp", price: 60 }],
  );
  // Prima cere linia din cos, a doua nu mai are ce gasi si iese ca linie noua.
  assert.equal(r.economieTotala, 40);
  assert.equal(r.companioniNoi.length, 1);
});

test("cosul gol lasa tot setul pe linii noi", () => {
  const r = fbtInCos([], [{ product_id: "a", price: 1 }, { product_id: "b", price: 2 }]);
  assert.equal(r.companioniNoi.length, 2);
  assert.equal(r.economieTotala, 0);
  assert.deepEqual(r.economiePeLinie, []);
});

/**
 * Proba de foc: numarul pe care il arata formularul trebuie sa fie chiar cel pe
 * care il incaseaza serverul. Se ruleaza aceeasi comanda pe amandoua caile.
 */
test("totalul din formular e chiar cel pe care il aseaza serverul", () => {
  const config: OfferConfig = {
    productIds: ["comp1", "comp2"],
    autoByCategory: false,
    maxProducts: 4,
    discountMode: "percent",
    discountPercent: 10,
  };
  const ancora = 143;
  const produs = (id: string, price: number): OfferProduct =>
    ({ id, name: id, slug: null, price, compareAtPrice: null, imageUrl: null, outOfStock: false });
  const set = [produs("comp1", 34.28), produs("comp2", 32.25)];

  // Ce afiseaza cardul din pagina de produs, si de acolo formularul.
  const preturiSet = imparteEconomiaCompanionilor(
    ancora,
    set.map((p) => p.price),
    pretulSetului([ancora, ...set.map((p) => p.price)], config).savings,
  );

  // Clientul are 3 bucati din primul companion in cos; al doilea nu e in cos.
  const liniiCos = [linie("comp1", 34.28, 3)];
  const dinFormular = fbtInCos(
    liniiCos,
    set.map((p, i) => ({ product_id: p.id, price: preturiSet[i] })),
  );
  const totalFormular =
    liniiCos.reduce((s, l) => s + l.price * l.quantity, 0)
    - dinFormular.economieTotala
    + dinFormular.companioniNoi.reduce((s, c) => s + c.price, 0);

  // Ce ajunge la server: liniile de cos neatinse plus companionii fara linie.
  const liniiServer: BumpItem[] = [
    ...liniiCos.map((l) => ({ ...l })),
    ...dinFormular.companioniNoi.map((c) => linie(c.product_id, set.find((p) => p.id === c.product_id)!.price, 1)),
  ];
  const rez = aplicaOfertaPeLinii(
    liniiServer,
    { type: "frequently_bought", config },
    set,
    { basePrice: ancora, unitPrice: ancora },
    new Set(),
  );
  assert.ok(!("motiv" in rez), "serverul nu are voie sa refuze un set intreg");
  const totalServer = liniiServer.reduce((s, l) => s + l.price * l.quantity, 0);

  assert.equal(Math.round(totalFormular * 100) / 100, Math.round(totalServer * 100) / 100);
});
