import assert from "node:assert/strict";
import { test } from "node:test";
import { pretPeTrepte } from "./quantity-tiers";

/**
 * Treptele de cantitate au avut trei surse de adevar: bifa de pe buton, totalul
 * afisat si pretul unitar trimis serverului. Clientul vedea pachetul de 2 la 170
 * lei si comanda pleca la 179,98. Invariantul de mai jos e ce impiedica revenirea:
 * ce se afiseaza trebuie sa fie exact ce se plateste.
 */

// Configuratia reala de pe ultimulmagazin.ro care a scos bug-ul la iveala.
const TREPTE = [
  { qty: 1, price: 89.99 },
  { qty: 2, price: 170 },
  { qty: 3, price: 250 },
];
const PRET_BAZA = 89.99;

test("pretul unitar inmultit cu cantitatea da exact totalul afisat", () => {
  for (const cantitate of [1, 2, 3, 4, 7]) {
    const r = pretPeTrepte(TREPTE, cantitate, PRET_BAZA);
    assert.equal(
      Math.round(r.unitPrice * cantitate * 100) / 100,
      Math.round(r.subtotal * 100) / 100,
      `cantitatea ${cantitate}`,
    );
  }
});

test("fiecare treapta isi da propriul pret de pachet", () => {
  assert.equal(pretPeTrepte(TREPTE, 2, PRET_BAZA).subtotal, 170);
  assert.equal(pretPeTrepte(TREPTE, 3, PRET_BAZA).subtotal, 250);
  assert.equal(pretPeTrepte(TREPTE, 2, PRET_BAZA).index, 1);
  assert.equal(pretPeTrepte(TREPTE, 3, PRET_BAZA).index, 2);
});

test("o cantitate care nu e treapta se plateste la pretul intreg, fara bifa", () => {
  const r = pretPeTrepte(TREPTE, 7, PRET_BAZA);
  assert.equal(r.index, -1);
  assert.equal(r.unitPrice, PRET_BAZA);
  assert.equal(Math.round(r.subtotal * 100) / 100, 629.93);
});

test("fara trepte configurate se cade pe pretul de baza", () => {
  const r = pretPeTrepte(undefined, 3, PRET_BAZA);
  assert.equal(r.index, -1);
  assert.equal(r.unitPrice, PRET_BAZA);
  assert.equal(Math.round(r.subtotal * 100) / 100, 269.97);
});

test("lista goala de trepte nu bifeaza nimic", () => {
  assert.equal(pretPeTrepte([], 1, PRET_BAZA).index, -1);
});
