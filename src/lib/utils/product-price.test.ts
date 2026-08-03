import assert from "node:assert/strict";
import { test } from "node:test";
import { getProductPriceRange } from "./product-price";
import { enabledComboPriceMap } from "@/lib/storefront/variants";

/**
 * Produsele cu variante afisau un pret pe care nu-l puteai cumpara.
 *
 * ANTIFOANE INT UF REFILL (eSAFE, publicat): baza 156,80, singura combinatie
 * activa 438,00 — 281,20 lei diferenta, adica 64%. Cardul din catalog scria
 * corect 438, pagina produsului scria 156,80, iar datele structurate publicau
 * 156,80 catre Google.
 *
 * Cauza adanca nu e ca o suprafata a citit gresit, ci ca existau DOUA reguli:
 * una pentru ce se poate cumpara si alta pentru ce se afiseaza.
 */

const ps = (combinations: unknown[], optiuni = true) => ({
  variants: {
    enabled: true,
    ...(optiuni ? { options: [{ id: "o1", name: "Marime", values: ["S", "M"] }] } : {}),
    combinations,
  },
});
const c = (over: Record<string, unknown> = {}) => ({ title: "S", enabled: true, price: 200, ...over });

test("produsul simplu ramane pe pretul lui", () => {
  assert.deepEqual(getProductPriceRange(100, null), { min: 100, max: 100, hasRange: false, faraOferta: false });
  assert.deepEqual(getProductPriceRange(100, { variants: null }), { min: 100, max: 100, hasRange: false, faraOferta: false });
});

test("variante pornite dar FARA axe de ales = produs simplu", () => {
  // Peste tot altundeva un asemenea produs e simplu (`parseVariants` intoarce
  // null, deci nu se poate alege nimic si nu se poate comanda o combinatie).
  const r = getProductPriceRange(100, ps([c({ price: 50 })], false));
  assert.deepEqual(r, { min: 100, max: 100, hasRange: false, faraOferta: false });
});

test("intervalul iese din combinatiile active", () => {
  const r = getProductPriceRange(100, ps([c({ title: "S", price: 50 }), c({ title: "M", price: 200 })]));
  assert.deepEqual(r, { min: 50, max: 200, hasRange: true, faraOferta: false });
});

test("combinatia fara steagul `enabled` NU intra: nu se poate cumpara", () => {
  // Regula veche sarea doar `enabled === false`, deci un steag absent cobora
  // minimul afisat sub orice pret de vanzare.
  const r = getProductPriceRange(100, ps([{ title: "S", price: 50 }, c({ title: "M", price: 200 })]));
  assert.deepEqual(r, { min: 200, max: 200, hasRange: false, faraOferta: false });
});

test("la titluri duplicate conteaza PRIMA, ca peste tot", () => {
  // 129 de perechi in productie. Pretul platit vine de la prima combinatie, deci
  // si intervalul trebuie sa vina de la ea: altfel cardul promite „de la 203" un
  // produs care se vinde cu 231.
  const r = getProductPriceRange(100, ps([c({ title: "S", price: 203 }), c({ title: "S", price: 231 })]));
  assert.deepEqual(r, { min: 203, max: 203, hasRange: false, faraOferta: false });
});

test("intervalul si pretul incasat vin din ACEEASI multime", () => {
  // Testul care tine cele doua reguli lipite pe viitor.
  const sectiuni = ps([
    c({ title: "S", price: 203 }),
    c({ title: "S", price: 231 }),
    c({ title: "M", price: 260 }),
    { title: "L", price: 10 },
    c({ title: "XL", enabled: false, price: 5 }),
  ]);
  const vandabile = [...enabledComboPriceMap(sectiuni, 100).values()];
  const r = getProductPriceRange(100, sectiuni);
  assert.equal(r.min, Math.min(...vandabile));
  assert.equal(r.max, Math.max(...vandabile));
});

test("combinatia fara titlu nu se poate alege, deci nu intra", () => {
  const r = getProductPriceRange(100, ps([c({ title: "", price: 50 }), c({ title: "M", price: 200 })]));
  assert.deepEqual(r, { min: 200, max: 200, hasRange: false, faraOferta: false });
});

test("un rand null in combinatii NU arunca", () => {
  // Arunca in `slimCatalogProduct`, adica pe SERVER, pe toata lista de produse.
  const r = getProductPriceRange(100, ps([null, c({ title: "M", price: 200 })]));
  assert.deepEqual(r, { min: 200, max: 200, hasRange: false, faraOferta: false });
});

test("pretul zero sau nenumeric cade pe BAZA, nu sterge combinatia", () => {
  // Importul scrie 0 numeric pentru combinatiile fara pret in CSV. Stearsa,
  // combinatia ridica minimul afisat peste ce se incaseaza — iar la comanda
  // `comboUnitPrice` da tot pretul de baza.
  for (const rau of ["0", 0, "abc", "-5", "  ", NaN]) {
    const r = getProductPriceRange(100, ps([c({ title: "S", price: rau }), c({ title: "M", price: 200 })]));
    assert.deepEqual(r, { min: 100, max: 200, hasRange: true, faraOferta: false }, String(rau));
  }
});

test("pretul gol inseamna „pretul produsului", () => {
  for (const gol of ["", null, undefined]) {
    const r = getProductPriceRange(100, ps([c({ title: "S", price: gol })]));
    assert.deepEqual(r, { min: 100, max: 100, hasRange: false, faraOferta: false }, String(gol));
  }
});

test("cand nicio combinatie nu e vandabila, pretul NU e o oferta", () => {
  const toateStinse = getProductPriceRange(100, ps([c({ enabled: false }), c({ title: "M", enabled: false })]));
  assert.deepEqual(toateStinse, { min: 100, max: 100, hasRange: false, faraOferta: true });
  assert.deepEqual(getProductPriceRange(100, ps([])), { min: 100, max: 100, hasRange: false, faraOferta: true });
});
