import assert from "node:assert/strict";
import { test } from "node:test";
import { buildProductJsonLd } from "./product-jsonld";

/**
 * Codul de bare al produsului ajunge in datele structurate ale paginii publice.
 *
 * Comerciantul il scria in formularul de produs si il vedea afisat la
 * specificatii, dar `buildProductJsonLd` nu-l citea: pagina declara un produs
 * fara niciun identificator, iar Google Merchant nu avea cu ce sa confirme ce
 * primea prin feed. De aici veneau respingerile la aprobare.
 */

const SHIPPING = { cost: 20, min: 1, max: 3 };

const produs = (google: Record<string, string>) => ({
  name: "Saltea Ortopedica",
  description: null,
  price: 1200,
  images: null,
  page_sections: { google },
});

function build(google: Record<string, string>) {
  return buildProductJsonLd(produs(google), "https://exemplu.ro/product/saltea", "Exemplu", SHIPPING) as
    Record<string, unknown>;
}

test("un GTIN valid ajunge in datele structurate", () => {
  // Cifra de control a lui 594123456789 e 9 (suma ponderata 131), deci codul
  // asta trece verificarea mod 10, iar cel din testul de mai jos, cu 0, pica.
  assert.equal(build({ gtin: "5941234567899" }).gtin, "5941234567899");
});

test("spatiile din cod se curata inainte de scriere", () => {
  assert.equal(build({ gtin: "594 1234 567899" }).gtin, "5941234567899");
});

test("un GTIN cu cifra de control gresita NU se scrie", () => {
  // Un cod respins de Google e mai rau decat un camp lipsa: produsul pica, in
  // loc sa fie doar mai putin bogat. Deci se lasa afara si comerciantul vede.
  assert.equal("gtin" in build({ gtin: "5941234567890" }), false);
});

test("un GTIN cu numar gresit de cifre NU se scrie", () => {
  assert.equal("gtin" in build({ gtin: "12345" }), false);
});

test("codul de fabricant se scrie cand exista", () => {
  assert.equal(build({ mpn: "SO-160200" }).mpn, "SO-160200");
});

test("campurile goale nu apar deloc, nu apar goale", () => {
  const jsonLd = build({ gtin: "", mpn: "   " });
  assert.equal("gtin" in jsonLd, false);
  assert.equal("mpn" in jsonLd, false);
});

test("un produs fara sectiunea google nu se strica", () => {
  const jsonLd = buildProductJsonLd(
    { name: "Simplu", description: null, price: 10, images: null },
    "https://exemplu.ro/product/simplu",
    "Exemplu",
    SHIPPING,
  ) as Record<string, unknown>;
  assert.equal("gtin" in jsonLd, false);
  assert.equal(jsonLd.name, "Simplu");
});
