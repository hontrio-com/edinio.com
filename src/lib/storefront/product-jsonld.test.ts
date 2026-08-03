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

/* ─── Pretul publicat catre Google ─────────────────────────────────────────── */

/**
 * Ramura simpla publica pretul de BAZA, iar pe un produs cu variante baza poate
 * sa nu fie de vanzare deloc: ANTIFOANE INT UF REFILL are baza 156,80 si singura
 * combinatie activa 438,00. Pagina scria 438, microdatele 156,80 — adica exact
 * contradictia pentru care Merchant Center suspenda un cont.
 */
const variabil = (combinations: unknown[], price = 156.8, track = false) => ({
  name: "ANTIFOANE INT UF REFILL",
  description: null,
  price,
  images: null,
  track_inventory: track,
  page_sections: {
    variants: {
      enabled: true,
      options: [{ id: "o1", name: "Marime", values: ["S", "M"] }],
      combinations,
    },
  },
});

const oferta = (combinations: unknown[], price?: number, track = false) =>
  (buildProductJsonLd(variabil(combinations, price, track), "https://exemplu.ro/p", "Exemplu", SHIPPING) as
    Record<string, unknown>).offers as Record<string, unknown>;

test("o singura combinatie: se publica pretul EI, nu baza", () => {
  const o = oferta([{ title: "S", enabled: true, price: 438 }]);
  assert.equal(o["@type"], "Offer");
  assert.equal(o.price, 438);
});

test("toate marimile la acelasi pret: tot pretul lor, nu baza", () => {
  const o = oferta([{ title: "S", enabled: true, price: 203 }, { title: "M", enabled: true, price: 203 }]);
  assert.equal(o["@type"], "Offer");
  assert.equal(o.price, 203);
});

test("titlurile duplicate nu inventeaza un interval", () => {
  // Conteaza PRIMA combinatie, ca peste tot: altfel Google primeste „203-231"
  // pentru o marime care se vinde cu 203.
  const o = oferta([{ title: "S", enabled: true, price: 203 }, { title: "S", enabled: true, price: 231 }]);
  assert.equal(o["@type"], "Offer");
  assert.equal(o.price, 203);
});

test("preturi diferite: interval, cu atatea oferte cate se pot cumpara", () => {
  const o = oferta([
    { title: "S", enabled: true, price: 203 },
    { title: "M", enabled: true, price: 231 },
    { title: "L", enabled: false, price: 5 },
  ]);
  assert.equal(o["@type"], "AggregateOffer");
  assert.equal(o.lowPrice, 203);
  assert.equal(o.highPrice, 231);
  assert.equal(o.offerCount, 2, "combinatia stinsa nu e o oferta");
});

test("niciuna de vanzare: nu se declara in stoc catre Google", () => {
  const o = oferta([{ title: "S", enabled: false, price: 438 }]);
  assert.equal(o.availability, "https://schema.org/OutOfStock");
});

test("toate marimile cu stocul terminat, la un produs care isi tine stocul", () => {
  const o = oferta([{ title: "S", enabled: true, price: 438, stock_quantity: 0 }], undefined, true);
  assert.equal(o.availability, "https://schema.org/OutOfStock");
});

test("acelasi produs, dar cu urmarirea stocului OPRITA, ramane in stoc", () => {
  // 171 de produse publicate la un singur magazin arata asa: zerourile vin din
  // valoarea implicita a importului, iar comerciantul a stins tocmai urmarirea
  // stocului. Declarate epuizate aici, microdatele ar contrazice feedul trimis
  // catre acelasi Merchant Center.
  const o = oferta([{ title: "S", enabled: true, price: 438, stock_quantity: 0 }]);
  assert.equal(o.availability, "https://schema.org/InStock");
});
