import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeazaCos } from "./normalize";

/**
 * Cosul se citea din localStorage cu `JSON.parse` intors direct in stare. Adica
 * text scris de oricine devenea stare de React fara nicio verificare.
 */

const linie = (over: Record<string, unknown> = {}) => ({
  productId: "p1", name: "Prosop", price: 19.99, imageUrl: null, quantity: 2, ...over,
});

test("un cos sanatos trece neatins", () => {
  assert.deepEqual(normalizeazaCos([linie()]), [linie()]);
});

test("JSON valid care NU e cos nu ajunge in stare", () => {
  // „null", „5" si „{}" trec de `JSON.parse` fara sa arunce, iar la randarea
  // urmatoare `items.map(...)` arunca — si nu o data, fiindca cheia se reciteste
  // la fiecare montare: magazinul ramane pagina de eroare.
  for (const rau of [null, 5, {}, "sir", true, undefined]) {
    assert.deepEqual(normalizeazaCos(rau), [], JSON.stringify(rau ?? null));
  }
});

test("liniile stricate se ARUNCA, nu se repara pe jumatate", () => {
  // Fara produs sau cu pret nenumeric, linia n-are ce cauta intr-o comanda.
  assert.deepEqual(normalizeazaCos([linie({ productId: "" }), linie({ productId: 7 }), null, "x"]), []);
  assert.deepEqual(normalizeazaCos([linie({ price: "abc" }), linie({ price: -1 })]), []);
  // `Number(null)`, `Number("")`, `Number([])` si `Number(false)` dau toate 0:
  // verificate cu `Number(...)`, liniile astea treceau cu un pret INVENTAT, iar
  // cosul socotea pragul de livrare gratuita pe zero lei.
  for (const rau of [null, "", "  ", [], false, true, undefined, {}]) {
    assert.deepEqual(normalizeazaCos([linie({ price: rau })]), [], JSON.stringify(rau ?? null));
  }
});

test("cantitatea se clemeaza pe fiecare linie", () => {
  assert.equal(normalizeazaCos([linie({ quantity: 0.5 })])[0].quantity, 1);
  assert.equal(normalizeazaCos([linie({ quantity: -4 })])[0].quantity, 1);
  assert.equal(normalizeazaCos([linie({ quantity: "3" })])[0].quantity, 3);
  assert.equal(normalizeazaCos([linie({ quantity: 1e9 })])[0].quantity, 999);
  assert.equal(normalizeazaCos([linie({ quantity: undefined })])[0].quantity, 1);
});

test("o linie buna nu e trasa in jos de una stricata de langa ea", () => {
  const r = normalizeazaCos([linie({ productId: "" }), linie({ productId: "p2", quantity: 0.5 })]);
  assert.equal(r.length, 1);
  assert.equal(r[0].productId, "p2");
  assert.equal(r[0].quantity, 1);
});

test("doua linii care cad pe aceeasi cheie se PLIAZA, nu raman alaturi", () => {
  // Amandoua au `variantTitle` de alt tip, deci amandoua raman fara — si ajung pe
  // aceeasi `lineKey`. Lasate asa, `updateQty` ar scrie in amandoua, `removeItem`
  // le-ar sterge pe amandoua, iar bucatile s-ar numara de doua ori.
  const r = normalizeazaCos([linie({ variantTitle: 1, quantity: 2 }), linie({ variantTitle: 2, quantity: 4 })]);
  assert.equal(r.length, 1);
  assert.equal(r[0].quantity, 6);
  // Doua marimi diferite raman insa doua linii.
  assert.equal(normalizeazaCos([linie({ variantTitle: "S" }), linie({ variantTitle: "L" })]).length, 2);
  // Plierea nu poate trece de plafon.
  assert.equal(normalizeazaCos([linie({ quantity: 900 }), linie({ quantity: 900 })])[0].quantity, 999);
});

test("campurile optionale supravietuiesc, cele de tip gresit nu", () => {
  const r = normalizeazaCos([linie({ variantTitle: "S", variantSku: "SKU-1", slug: "prosop" })])[0];
  assert.equal(r.variantTitle, "S");
  assert.equal(r.variantSku, "SKU-1");
  assert.equal(r.slug, "prosop");
  assert.equal(normalizeazaCos([linie({ variantTitle: 42 })])[0].variantTitle, undefined);
  assert.equal(normalizeazaCos([linie({ imageUrl: 42 })])[0].imageUrl, null);
});

test("pretul se pastreaza cu zecimalele lui: liniile de pachet sunt nerotunjite", () => {
  assert.equal(normalizeazaCos([linie({ price: 250 / 3 })])[0].price, 250 / 3);
});
