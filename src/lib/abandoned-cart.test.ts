import assert from "node:assert/strict";
import { test } from "node:test";
import {
  liniiRecuperabile,
  totalCosRecuperabil,
  type AbandonedCartItem,
  type ProdusCosSalvat,
} from "./abandoned-cart";

/**
 * Cosul salvat tine preturile inghetate in localStorage la captura. Masurat in
 * productie pe 2026-08-04: 33 din 129 de linii salvate aveau alt pret decat
 * catalogul, iar 2 emailuri de recuperare plecasera deja asa. Cel mai scump caz masurat: "Papuci Hotelieri ECO" x50, salvat la 6,20 si
 * cerut azi cu 7,40 — 60 de lei diferenta pe o singura linie.
 *
 * Calculul asta e singurul care spune ce anume mai poate fi recuperat si cat
 * costa azi. Il folosesc linkul "recupereaza cosul", emailul trimis manual din
 * panou si cronul orar; cat timp erau trei calcule, emailul promitea un pret pe
 * care cosul de la capatul linkului nu-l mai avea.
 */

const produs = (p: Partial<ProdusCosSalvat> & { id: string }): ProdusCosSalvat => ({
  name: "Produs",
  price: 10,
  images: [],
  is_active: true,
  page_sections: {},
  ...p,
});

const salvata = (i: Partial<AbandonedCartItem> & { product_id: string }): AbandonedCartItem => ({
  name: "Nume vechi",
  price: 42,
  quantity: 1,
  image_url: null,
  ...i,
});

const catalog = (...produse: ProdusCosSalvat[]) => new Map(produse.map((p) => [p.id, p]));

test("pretul salvat se inlocuieste cu cel din catalog", () => {
  // Cazul real de pe tonel-beauty: Apa Termala 300ml, salvata la 42, catalogul cere 52,43.
  const out = liniiRecuperabile(
    [salvata({ product_id: "apa", price: 42 })],
    catalog(produs({ id: "apa", name: "Apa Termala 300ml Bypahsse", price: 52.43 })),
  );
  assert.equal(out.length, 1);
  assert.equal(out[0]!.price, 52.43);
  assert.equal(totalCosRecuperabil(out), 52.43);
});

test("totalul se recalculeaza din liniile aduse la zi, nu din subtotalul salvat", () => {
  // Cazul cu cea mai mare diferenta din productie: 50 de perechi, 6,20 -> 7,40.
  const out = liniiRecuperabile(
    [salvata({ product_id: "papuci", price: 6.2, quantity: 50 })],
    catalog(produs({ id: "papuci", price: 7.4 })),
  );
  assert.equal(totalCosRecuperabil(out), 370);
  // Subtotalul salvat ar fi fost 310: exact cei 60 de lei pe care emailul ii promitea gresit.
  assert.notEqual(totalCosRecuperabil(out), 310);
});

test("si numele vine din catalog, nu din instantaneul salvat", () => {
  const out = liniiRecuperabile(
    [salvata({ product_id: "x", name: "Nume vechi" })],
    catalog(produs({ id: "x", name: "Nume nou" })),
  );
  assert.equal(out[0]!.name, "Nume nou");
});

test("produsul disparut din catalog nu mai apare in cos", () => {
  // 5 din cele 129 de linii din productie trimit catre produse care nu mai exista.
  const out = liniiRecuperabile([salvata({ product_id: "sters" })], catalog());
  assert.deepEqual(out, []);
  assert.equal(totalCosRecuperabil(out), 0);
});

test("produsul dezactivat nu mai apare in cos", () => {
  const out = liniiRecuperabile(
    [salvata({ product_id: "x" })],
    catalog(produs({ id: "x", is_active: false })),
  );
  assert.deepEqual(out, []);
});

test("produsul cu variante nu apare, fiindca linia salvata nu poarta marimea", () => {
  const cuVariante = {
    variants: {
      enabled: true,
      options: [{ id: "o1", name: "Marime", values: ["S", "M"] }],
      combinations: [{ title: "S", enabled: true, price: 30 }],
    },
  };
  const out = liniiRecuperabile(
    [salvata({ product_id: "tricou" })],
    catalog(produs({ id: "tricou", page_sections: cuVariante })),
  );
  assert.deepEqual(out, []);
});

test("un cos ramas fara nicio linie da total 0, ca apelantul sa nu trimita email", () => {
  const out = liniiRecuperabile(
    [salvata({ product_id: "sters" }), salvata({ product_id: "inactiv" })],
    catalog(produs({ id: "inactiv", is_active: false })),
  );
  assert.equal(out.length, 0);
  assert.equal(totalCosRecuperabil(out), 0);
});

test("liniile bune raman cand doar una dintre ele a disparut", () => {
  const out = liniiRecuperabile(
    [salvata({ product_id: "bun", price: 20, quantity: 2 }), salvata({ product_id: "sters" })],
    catalog(produs({ id: "bun", price: 22 })),
  );
  assert.equal(out.length, 1);
  assert.equal(out[0]!.product_id, "bun");
  assert.equal(totalCosRecuperabil(out), 44);
});

test("cantitatea trece prin aceeasi clema ca in cos", () => {
  // Plafonul e 999: o cantitate imposibila salvata nu are voie sa ajunga intr-un
  // email care promite un total pe care comanda nu-l poate reproduce.
  const out = liniiRecuperabile(
    [salvata({ product_id: "x", quantity: 5000 })],
    catalog(produs({ id: "x", price: 1 })),
  );
  assert.equal(out[0]!.quantity, 999);
  const zero = liniiRecuperabile(
    [salvata({ product_id: "x", quantity: 0 })],
    catalog(produs({ id: "x", price: 1 })),
  );
  assert.equal(zero[0]!.quantity, 1);
});

test("poza vine din catalog, iar cand produsul nu mai are niciuna ramane cea salvata", () => {
  const cuPoza = liniiRecuperabile(
    [salvata({ product_id: "x", image_url: "veche.jpg" })],
    catalog(produs({ id: "x", images: ["noua.jpg"] })),
  );
  assert.equal(cuPoza[0]!.image_url, "noua.jpg");
  const faraPoza = liniiRecuperabile(
    [salvata({ product_id: "x", image_url: "veche.jpg" })],
    catalog(produs({ id: "x", images: [] })),
  );
  assert.equal(faraPoza[0]!.image_url, "veche.jpg");
});

test("totalul se rotunjeste la ban, nu lasa reziduu de virgula mobila", () => {
  const out = liniiRecuperabile(
    [salvata({ product_id: "a", quantity: 3 }), salvata({ product_id: "b", quantity: 1 })],
    catalog(produs({ id: "a", price: 19.93 }), produs({ id: "b", price: 0.1 })),
  );
  assert.equal(totalCosRecuperabil(out), 59.89);
});

test("emailul aplica treptele de cantitate, ca si cosul", () => {
  // Cos real din productie (suporti-numar): „Set Suport Ultra Slim" x3, catalog
  // 40,00, treapta de 3 bucati la -10%. Cu pretul de baza, emailul promitea
  // 120,00 pentru un cos care arata 108,00. Erau 17 cosuri CORECTE inainte care
  // ar fi devenit gresite, cu 100,52 lei supraevaluati in total.
  const out = liniiRecuperabile(
    [{ product_id: "p1", name: "vechi", price: 40, quantity: 3, image_url: null }],
    new Map([["p1", {
      id: "p1", name: "Set Suport Ultra Slim", price: 40, images: [], is_active: true,
      page_sections: { quantity_tiers: { enabled: true, mode: "percent", tier3_percent: 10 } },
    }]]),
  );
  assert.equal(totalCosRecuperabil(out), 108);
  assert.equal(round2(out[0].price * out[0].quantity), 108, "randul din email da subtotalul de pachet");
});

test("fara trepte configurate, pretul ramane cel din catalog", () => {
  const out = liniiRecuperabile(
    [{ product_id: "p1", name: "x", price: 99, quantity: 2, image_url: null }],
    new Map([["p1", { id: "p1", name: "Produs", price: 40, images: [], is_active: true, page_sections: null }]]),
  );
  assert.equal(totalCosRecuperabil(out), 80);
});

function round2(n: number): number { return Math.round(n * 100) / 100; }
