import { test } from "node:test";
import assert from "node:assert/strict";
import { randuriDeBani, type BaniComanda } from "./order-totals";

/*
 * Proprietatea pe care o tine fisierul asta e una singura: RANDURILE DIN EMAIL
 * TREBUIE SA DEA TOTALUL COMENZII. Cele doua emailuri de comanda noua nu il
 * dadeau pe niciuna din cele trei forme de mai jos, iar comenzile sunt luate din
 * productie (masurate 2026-08-04).
 */

const BAZA: BaniComanda = {
  items: [],
  subtotal: 0,
  shipping_cost: 0,
  discount_amount: 0,
  card_discount_amount: 0,
  cod_discount_amount: 0,
  cod_fee_amount: 0,
  vat_amount: 0,
  vat_rate: 0,
  vat_enabled: false,
  prices_include_vat: true,
  total: 0,
};

function coloana(o: BaniComanda): number {
  return Math.round(randuriDeBani(o).reduce((s, r) => s + r.contributie, 0) * 100) / 100;
}

test("extraoptiunile intra in coloana: comanda #0073, 40 marfa + 5 optiune + 20 transport", () => {
  const o: BaniComanda = {
    ...BAZA,
    items: [
      { product_id: "8b6071e3-a94f-4ad2-93b6-cc3acfbaaabf", name: "Set Suport Ultra Slim", price: 40, quantity: 1 },
      { product_id: "extra_ext_1781723399523", name: "Comanda cu Prioritate", price: 5, quantity: 1 },
    ],
    subtotal: 40, shipping_cost: 20, total: 65,
    vat_amount: 7.81, vat_rate: 21, vat_enabled: true, prices_include_vat: true,
  };
  const randuri = randuriDeBani(o);
  const extra = randuri.find((r) => r.cheie === "extras");
  // Fara randul asta, emailul comerciantului scria Subtotal 40 + Transport 20 = 60
  // sub un Total de 65, si cei 5 lei nu se explicau de nicaieri.
  assert.ok(extra, "lipseste randul de extraoptiuni");
  assert.equal(extra.contributie, 5);
  assert.equal(coloana(o), 65);
});

test("TVA inclus: cifra se arata dar NU se aduna (comanda #0074)", () => {
  const o: BaniComanda = {
    ...BAZA,
    items: [{ product_id: "8b6071e3-a94f-4ad2-93b6-cc3acfbaaabf", name: "Set Suport Ultra Slim", price: 40, quantity: 1 }],
    subtotal: 40, shipping_cost: 20, total: 60,
    vat_amount: 6.94, vat_rate: 21, vat_enabled: true, prices_include_vat: true,
  };
  const tva = randuriDeBani(o).find((r) => r.cheie === "tva");
  assert.ok(tva);
  assert.match(tva.eticheta, /inclus/);
  assert.equal(tva.contributie, 0);
  // Adunata, cifra ducea coloana la 66,94 sub un Total de 60.
  assert.equal(coloana(o), 60);
});

test("TVA adaugat peste preturi: cifra se aduna si eticheta nu spune inclus", () => {
  // Magazin cu preturi FARA TVA (unul singur azi din cele 9 cu TVA pornit).
  // Baza = marfa + transport = 120, TVA 21% = 25,20, total 145,20.
  const o: BaniComanda = {
    ...BAZA,
    items: [{ product_id: "p1", name: "Casca protectie", price: 100, quantity: 1 }],
    subtotal: 100, shipping_cost: 20, total: 145.2,
    vat_amount: 25.2, vat_rate: 21, vat_enabled: true, prices_include_vat: false,
  };
  const tva = randuriDeBani(o).find((r) => r.cheie === "tva");
  assert.ok(tva);
  assert.doesNotMatch(tva.eticheta, /inclus/);
  assert.equal(tva.contributie, 25.2);
  // Pana acum clientul primea 100 + 20 si un Total de 145,20, fara nimic intre.
  assert.equal(coloana(o), 145.2);
});

test("emailul clientului sare peste subtotal si optiuni extra, restul se aduna la fel", () => {
  const o: BaniComanda = {
    ...BAZA,
    items: [
      { product_id: "p1", name: "Set", price: 40, quantity: 1 },
      { product_id: "extra_ext_1", name: "Prioritate", price: 5, quantity: 1 },
    ],
    subtotal: 40, shipping_cost: 20, total: 65,
  };
  const vazute = randuriDeBani(o).filter((r) => r.cheie !== "subtotal" && r.cheie !== "extras");
  assert.deepEqual(vazute.map((r) => r.cheie), ["transport"]);
  // Produsele sunt insirate unul cate unul (extraoptiunile printre ele), deci
  // suma lor tine locul celor doua randuri sarite: 45 + 20 = 65.
  const marfa = o.items.reduce((s, i) => s + i.price * i.quantity, 0);
  assert.equal(marfa + vazute.reduce((s, r) => s + r.contributie, 0), 65);
});

test("reducerile si taxa de ramburs isi pastreaza semnul", () => {
  const o: BaniComanda = {
    ...BAZA,
    items: [{ product_id: "p1", name: "Set", price: 100, quantity: 1 }],
    subtotal: 100, shipping_cost: 20,
    discount_code: "PRIMA", discount_amount: 10,
    card_discount_amount: 0, cod_discount_amount: 5, cod_fee_amount: 7,
    total: 112,
  };
  const randuri = randuriDeBani(o);
  const reducere = randuri.find((r) => r.cheie === "reducere");
  assert.ok(reducere);
  // Codul intra in eticheta, dar NEESCAPAT: escaparea o face randarea.
  assert.equal(reducere.eticheta, "Reducere (PRIMA)");
  assert.equal(reducere.contributie, -10);
  assert.equal(reducere.verde, true);
  assert.equal(randuri.find((r) => r.cheie === "taxa-ramburs")?.contributie, 7);
  assert.equal(coloana(o), 112);
});

test("fara cod de cupon eticheta reducerii ramane simpla", () => {
  const o: BaniComanda = {
    ...BAZA,
    items: [{ product_id: "p1", name: "Set", price: 100, quantity: 1 }],
    subtotal: 100, shipping_cost: 0, discount_amount: 10, total: 90,
  };
  assert.equal(randuriDeBani(o).find((r) => r.cheie === "reducere")?.eticheta, "Reducere");
  assert.equal(coloana(o), 90);
});
