import assert from "node:assert/strict";
import { test } from "node:test";
import { comboUnitPrice, comboCompareAtPrice, esteMarime, pozePeValoare } from "./variants";
import type { VariantCombo, VariantsData } from "./variants";

/**
 * Pretul unei combinatii ajunge in cos, in comanda si in feed-uri, iar serverul
 * repretuieste comanda cu aceeasi functie. Un zero luat drept pret real inseamna
 * o comanda de 0 lei pe care serverul o accepta, deci are teste.
 */

const combo = (price: unknown, compare: unknown = ""): VariantCombo => ({
  id: "c1",
  title: "M",
  price: price as never,
  compare_at_price: compare as never,
  sku: "",
  stock_quantity: "",
  image: "",
  enabled: true,
});

test("un pret propriu se foloseste ca atare", () => {
  assert.equal(comboUnitPrice(combo("249"), 199), 249);
  assert.equal(comboUnitPrice(combo(249), 199), 249);
});

test("sirul gol inseamna fara pret propriu: cade pe pretul produsului", () => {
  assert.equal(comboUnitPrice(combo(""), 199), 199);
  assert.equal(comboUnitPrice(combo("   "), 199), 199);
});

test("zero inseamna tot fara pret propriu, nu gratis", () => {
  // Importul pune 0 numeric pentru combinatiile fara `pret=` in CSV, iar
  // exportul omite coloana exact pentru cele salvate din formular cu sir gol:
  // un dus-intors export-import facea toate marimile sa coste 0 lei.
  assert.equal(comboUnitPrice(combo(0), 199), 199);
  assert.equal(comboUnitPrice(combo("0"), 199), 199);
});

test("o valoare fara sens cade pe pretul produsului", () => {
  assert.equal(comboUnitPrice(combo("abc"), 199), 199);
});

test("fara combinatie aleasa se foloseste pretul produsului", () => {
  assert.equal(comboUnitPrice(null, 199), 199);
});

test("pretul taiat trateaza zeroul la fel", () => {
  assert.equal(comboCompareAtPrice(combo("", "0"), 299), 299);
  assert.equal(comboCompareAtPrice(combo("", "349"), 299), 349);
  assert.equal(comboCompareAtPrice(null, null), null);
});

/**
 * Cand o valoare de optiune se alege din fotografie si cand din cuvant.
 *
 * Regula are teste fiindca s-a dovedit gresita in productie: un import care pune
 * aceeasi poza de produs pe fiecare varianta dadea sase patrate identice in locul
 * marimilor S…3XL, iar clientul avea de ales intre sase poze cu acelasi tricou.
 */

const GALERIE = ["/a.jpg", "/b.jpg", "/c.jpg"];

function date(optiune: string, valori: string[], poze: (string | "")[]): VariantsData {
  return {
    options: [{ id: "o1", name: optiune, values: valori }],
    combinations: valori.map((v, i) => ({
      id: `c${i}`, title: v, price: "", compare_at_price: "", sku: "",
      stock_quantity: "", image: poze[i] ?? "", enabled: true,
    })),
  };
}

test("aceeasi poza la toate valorile inseamna cuvinte, nu patrate", () => {
  const harta = pozePeValoare(date("Culoare", ["Rosu", "Verde"], ["/a.jpg", "/a.jpg"]), GALERIE);
  assert.equal(harta.size, 0);
});

test("cate o poza diferita per valoare inseamna patrate", () => {
  const harta = pozePeValoare(date("Culoare", ["Rosu", "Verde"], ["/a.jpg", "/b.jpg"]), GALERIE);
  assert.deepEqual([...(harta.get("Culoare") ?? [])], [["Rosu", "/a.jpg"], ["Verde", "/b.jpg"]]);
});

test("cu poze doar la o parte din valori, randul ramane de cuvinte", () => {
  const harta = pozePeValoare(date("Culoare", ["Rosu", "Verde"], ["/a.jpg", ""]), GALERIE);
  assert.equal(harta.size, 0);
});

test("marimea nu primeste poze nici cand sunt diferite", () => {
  const harta = pozePeValoare(date("Marime", ["S", "M"], ["/a.jpg", "/b.jpg"]), GALERIE);
  assert.equal(harta.size, 0);
});

test("o poza care nu mai e in galerie nu se arata", () => {
  const harta = pozePeValoare(date("Culoare", ["Rosu", "Verde"], ["/a.jpg", "/stearsa.jpg"]), GALERIE);
  assert.equal(harta.size, 0);
});

test("numele de marime se recunosc fara diacritice si fara majuscule", () => {
  for (const n of ["Marime", "MARIMI", "Mărime", "Size", "talie", "Masura", "Numar", "Marime pantof"]) {
    assert.equal(esteMarime(n), true, n);
  }
  // „Marimea cutiei" nu e o marime de imbracaminte, si oricum n-are de ce sa
  // piarda pozele: verificarea cere numele intreg sau inceputul lui, nu o
  // bucata gasita oriunde.
  for (const n of ["Culoare", "Model", "Material", "Marimea cutiei norvegiene"]) {
    assert.equal(esteMarime(n), false, n);
  }
});
