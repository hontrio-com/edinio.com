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
  const { next, applied, missing } = patchVariants(inainte, [{ variantId: "m", stock: 42, price: null }]);

  assert.deepEqual(applied, ["m"]);
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
  const { next } = patchVariants(sectiuni(), [{ variantId: "m", stock: 42, price: null }]);
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
  patchVariants(inainte, [{ variantId: "m", stock: 42, price: null }]);
  assert.equal(inainte.variants.combinations[1].stock_quantity, 4);
});

test("mai multe variante ale aceluiasi produs, intr-o singura trecere", () => {
  const { next, applied } = patchVariants(sectiuni(), [
    { variantId: "s", stock: 1, price: null },
    { variantId: "m", stock: 2, price: null },
  ]);
  const n = next as ReturnType<typeof sectiuni>;

  assert.deepEqual(applied.sort(), ["m", "s"]);
  assert.equal(n.variants.combinations[0].stock_quantity, 1);
  assert.equal(n.variants.combinations[1].stock_quantity, 2);
});

test("pretul se scrie doar cand e cerut", () => {
  const { next } = patchVariants(sectiuni(), [{ variantId: "m", stock: null, price: 77 }]);
  const n = next as ReturnType<typeof sectiuni>;

  assert.equal(n.variants.combinations[1].price, 77);
  // Stocul ramane cel vechi, pentru ca randul nu cerea stoc.
  assert.equal(n.variants.combinations[1].stock_quantity, 4);
});

test("varianta disparuta e raportata, nu inventata", () => {
  const { next, applied, missing } = patchVariants(sectiuni(), [
    { variantId: "xl", stock: 5, price: null },
  ]);
  const n = next as ReturnType<typeof sectiuni>;

  assert.deepEqual(applied, []);
  assert.deepEqual(missing, ["xl"]);
  // Nu s-a adaugat nicio combinatie noua.
  assert.equal(n.variants.combinations.length, 2);
});

test("produs fara variante: nu se pierde restul continutului", () => {
  const fara = { descriere: "text", google: { brand: "X" } };
  const { next, missing } = patchVariants(fara, [{ variantId: "m", stock: 1, price: null }]);
  const n = next as Record<string, unknown>;

  assert.deepEqual(missing, ["m"]);
  assert.equal(n.descriere, "text");
  assert.deepEqual(n.google, { brand: "X" });
});

test("page_sections null sau stricat nu arunca", () => {
  for (const intrare of [null, undefined, "text", 42, []]) {
    const { next, missing } = patchVariants(intrare, [{ variantId: "m", stock: 1, price: null }]);
    assert.deepEqual(missing, ["m"]);
    assert.equal(typeof next, "object");
  }
});

test("combinatiile fara id sunt lasate in pace", () => {
  const stricat = { variants: { combinations: [{ title: "fara id", stock_quantity: 9 }] } };
  const { next, missing } = patchVariants(stricat, [{ variantId: "m", stock: 1, price: null }]);
  const n = next as typeof stricat;

  assert.deepEqual(missing, ["m"]);
  assert.equal(n.variants.combinations[0].stock_quantity, 9);
});
