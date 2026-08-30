import assert from "node:assert/strict";
import { test } from "node:test";
import { patchVariants } from "./applier";

/**
 * `page_sections` tine TOT continutul bogat al produsului: descriere, galerie,
 * specificatii, sectiuni de pagina, imagini pe varianta. Un feed de stoc are
 * voie sa schimbe acolo doua numere si nimic altceva.
 *
 * Testele astea exista pentru un singur scenariu, cel care ar face paguba
 * ireversibila: o scriere care pastreaza stocul corect, dar sterge restul.
 */

function sectiuni() {
  return {
    descriere: "<p>Un tricou bun</p>",
    galerie: ["a.webp", "b.webp"],
    google: { gtin: "5941234567890", brand: "Edinio" },
    specificatii: [{ label: "Material", value: "Bumbac" }],
    variants: {
      enabled: true,
      options: [{ id: "marime", name: "Marime", values: ["S", "M"] }],
      combinations: [
        { id: "s", title: "S", sku: "T-S", price: 100, stock_quantity: 3, enabled: true, image: "s.webp" },
        { id: "m", title: "M", sku: "T-M", price: 110, stock_quantity: 4, enabled: true, image: "m.webp" },
      ],
    },
  };
}

test("schimba stocul unei variante si nu atinge nimic altceva", () => {
  const inainte = sectiuni();
  const { next, applied, missing } = patchVariants(inainte, [{ key: 1, variantId: "m", sku: null, stock: 42, price: null }]);

  assert.deepEqual(applied, [1]);
  assert.deepEqual(missing, []);

  const n = next as ReturnType<typeof sectiuni>;
  assert.equal(n.variants.combinations[1].stock_quantity, 42);

  // Tot restul, neatins.
  assert.equal(n.descriere, "<p>Un tricou bun</p>");
  assert.deepEqual(n.galerie, ["a.webp", "b.webp"]);
  assert.deepEqual(n.google, { gtin: "5941234567890", brand: "Edinio" });
  assert.deepEqual(n.specificatii, [{ label: "Material", value: "Bumbac" }]);
  assert.equal(n.variants.enabled, true);
  assert.deepEqual(n.variants.options, [{ id: "marime", name: "Marime", values: ["S", "M"] }]);
});

test("campurile celorlalte combinatii raman intacte", () => {
  const { next } = patchVariants(sectiuni(), [{ key: 1, variantId: "m", sku: null, stock: 42, price: null }]);
  const n = next as ReturnType<typeof sectiuni>;

  // Varianta neatinsa.
  assert.deepEqual(n.variants.combinations[0], {
    id: "s", title: "S", sku: "T-S", price: 100, stock_quantity: 3, enabled: true, image: "s.webp",
  });
  // Varianta atinsa isi pastreaza toate celelalte campuri.
  assert.equal(n.variants.combinations[1].sku, "T-M");
  assert.equal(n.variants.combinations[1].price, 110);
  assert.equal(n.variants.combinations[1].image, "m.webp");
  assert.equal(n.variants.combinations[1].enabled, true);
});

test("nu modifica obiectul primit", () => {
  const inainte = sectiuni();
  patchVariants(inainte, [{ key: 1, variantId: "m", sku: null, stock: 42, price: null }]);
  assert.equal(inainte.variants.combinations[1].stock_quantity, 4);
});

test("mai multe variante ale aceluiasi produs, intr-o singura trecere", () => {
  const { next, applied } = patchVariants(sectiuni(), [
    { key: 1, variantId: "s", sku: null, stock: 1, price: null },
    { key: 2, variantId: "m", sku: null, stock: 2, price: null },
  ]);
  const n = next as ReturnType<typeof sectiuni>;

  assert.deepEqual(applied.sort(), [1, 2]);
  assert.equal(n.variants.combinations[0].stock_quantity, 1);
  assert.equal(n.variants.combinations[1].stock_quantity, 2);
});

test("pretul se scrie doar cand e cerut", () => {
  const { next } = patchVariants(sectiuni(), [{ key: 1, variantId: "m", sku: null, stock: null, price: 77 }]);
  const n = next as ReturnType<typeof sectiuni>;

  assert.equal(n.variants.combinations[1].price, 77);
  // Stocul ramane cel vechi, pentru ca randul nu cerea stoc.
  assert.equal(n.variants.combinations[1].stock_quantity, 4);
});

test("varianta disparuta e raportata, nu inventata", () => {
  const { next, applied, missing } = patchVariants(sectiuni(), [
    { key: 1, variantId: "xl", sku: null, stock: 5, price: null },
  ]);
  const n = next as ReturnType<typeof sectiuni>;

  assert.deepEqual(applied, []);
  assert.deepEqual(missing, [1]);
  // Nu s-a adaugat nicio combinatie noua.
  assert.equal(n.variants.combinations.length, 2);
});

test("produs fara variante: nu se pierde restul continutului", () => {
  const fara = { descriere: "text", google: { brand: "X" } };
  const { next, missing } = patchVariants(fara, [{ key: 1, variantId: "m", sku: null, stock: 1, price: null }]);
  const n = next as Record<string, unknown>;

  assert.deepEqual(missing, [1]);
  assert.equal(n.descriere, "text");
  assert.deepEqual(n.google, { brand: "X" });
});

test("page_sections null sau stricat nu arunca", () => {
  for (const intrare of [null, undefined, "text", 42, []]) {
    const { next, missing } = patchVariants(intrare, [{ key: 1, variantId: "m", sku: null, stock: 1, price: null }]);
    assert.deepEqual(missing, [1]);
    assert.equal(typeof next, "object");
  }
});

// ── Combinatii care impart acelasi id ──────────────────────────────────────
//
// Id-ul unei combinatii e un slug facut din optiuni ("galben-unic"), deci NU e
// unic in produs. Intr-un magazin real sunt 52 de produse cu combinatii care se
// calca pe id, cu SKU-uri diferite. Pana la departajarea pe SKU, o singura
// valoare ajungea in toate: la o rulare adevarata, 5 stocuri gresite.

function idDublat() {
  return {
    variants: {
      combinations: [
        { id: "galben-unic", title: "Galben", sku: "HS70553", stock_quantity: 1, price: 90 },
        { id: "galben-unic", title: "Galben", sku: "HS70554", stock_quantity: 2, price: 95 },
        { id: "galben-unic", title: "Galben", sku: "HS70555", stock_quantity: 8, price: 99 },
      ],
    },
  };
}

test("doua combinatii cu acelasi id isi primesc fiecare valoarea ei", () => {
  const { next, applied, missing } = patchVariants(idDublat(), [
    { key: 10, variantId: "galben-unic", sku: "HS70553", stock: 3, price: null },
    { key: 11, variantId: "galben-unic", sku: "HS70554", stock: 7, price: null },
  ]);
  const n = next as ReturnType<typeof idDublat>;

  assert.deepEqual(applied.sort(), [10, 11]);
  assert.deepEqual(missing, []);
  assert.equal(n.variants.combinations[0].stock_quantity, 3, "HS70553 isi ia 3");
  assert.equal(n.variants.combinations[1].stock_quantity, 7, "HS70554 isi ia 7");
  assert.equal(n.variants.combinations[2].stock_quantity, 8, "a treia nu e in feed, ramane 8");
});

test("SKU-ul se compara fara sa conteze spatiile sau majusculele", () => {
  const { next } = patchVariants(idDublat(), [
    { key: 1, variantId: "galben-unic", sku: " hs70554 ", stock: 7, price: null },
  ]);
  const n = next as ReturnType<typeof idDublat>;
  assert.equal(n.variants.combinations[1].stock_quantity, 7);
  assert.equal(n.variants.combinations[0].stock_quantity, 1, "prima ramane neatinsa");
});

test("un SKU care nu exista in produs e raportat, nu scris aiurea", () => {
  const { next, missing } = patchVariants(idDublat(), [
    { key: 1, variantId: "galben-unic", sku: "ALTCEVA", stock: 99, price: null },
  ]);
  const n = next as ReturnType<typeof idDublat>;

  assert.deepEqual(missing, [1]);
  assert.deepEqual(
    n.variants.combinations.map((c) => c.stock_quantity),
    [1, 2, 8],
    "niciun stoc nu are voie sa se schimbe",
  );
});

test("fara SKU se pastreaza purtarea veche: toate combinatiile cu acel id", () => {
  // Randurile puse la coada inainte de aceasta schimbare nu au SKU in ele.
  const { next, applied } = patchVariants(idDublat(), [
    { key: 1, variantId: "galben-unic", sku: null, stock: 5, price: null },
  ]);
  const n = next as ReturnType<typeof idDublat>;

  assert.deepEqual(applied, [1]);
  assert.deepEqual(n.variants.combinations.map((c) => c.stock_quantity), [5, 5, 5]);
});

test("combinatiile fara id sunt lasate in pace", () => {
  const stricat = { variants: { combinations: [{ title: "fara id", stock_quantity: 9 }] } };
  const { next, missing } = patchVariants(stricat, [{ key: 1, variantId: "m", sku: null, stock: 1, price: null }]);
  const n = next as typeof stricat;

  assert.deepEqual(missing, [1]);
  assert.equal(n.variants.combinations[0].stock_quantity, 9);
});
