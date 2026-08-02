import assert from "node:assert/strict";
import { test } from "node:test";
import { expandProductOffers, type MappableBusiness, type MappableProduct } from "./mapping";
import type { GoogleMerchantConfig } from "./types";

/**
 * Codul de bare al FIECAREI variante ajunge in feedul Google Merchant.
 *
 * Un GTIN identifica un articol anume, nu o familie: cele sapte culori ale
 * aceleiasi huse au sapte coduri diferite. Cat exista doar codul de pe produs,
 * nu se putea trimite niciunul — acelasi cod pe toate variantele inseamna GTIN
 * duplicat, adica respingere — si fiecare oferta pleca cu `identifierExists:
 * false`, adica produs fara identificator.
 */

const BUSINESS: MappableBusiness = {
  slug: "exemplu",
  custom_domain: null,
  store_name: "Exemplu",
  business_name: "Exemplu SRL",
};

const CONFIG = { content_language: "ro", feed_label: "RO" } as GoogleMerchantConfig;

/* Coduri cu cifra de control corecta, altfel ar fi lasate afara pe drept. */
const EAN_ALB = "5941234567899";
const EAN_NEGRU = "5941234567882";

const combo = (title: string, gtin?: string) => ({
  id: title.toLowerCase(),
  title,
  price: "",
  compare_at_price: "",
  sku: "",
  ...(gtin === undefined ? {} : { gtin }),
  stock_quantity: "",
  image: "",
  enabled: true,
});

function produs(combinations: unknown[], google: Record<string, string> = {}): MappableProduct {
  return {
    id: "p1",
    name: "Husa de Pat Jersey 180x200",
    slug: "husa-jersey",
    description: null,
    price: 99,
    compare_at_price: null,
    images: ["https://exemplu.ro/a.jpg"],
    category: null,
    track_inventory: false,
    stock_quantity: null,
    weight_grams: null,
    page_sections: {
      google,
      variants: {
        enabled: true,
        options: [{ id: "culoare", name: "Culoare", values: ["Alb", "Negru"] }],
        combinations,
      },
    },
  };
}

function atribute(oferte: ReturnType<typeof expandProductOffers>) {
  return oferte.map((o) => (o.input as { productAttributes: Record<string, unknown> }).productAttributes);
}

test("fiecare varianta pleaca cu codul ei de bare", () => {
  const attrs = atribute(expandProductOffers(BUSINESS, produs([
    combo("Alb", EAN_ALB),
    combo("Negru", EAN_NEGRU),
  ]), CONFIG));

  assert.deepEqual(attrs[0].gtins, [EAN_ALB]);
  assert.deepEqual(attrs[1].gtins, [EAN_NEGRU]);
  assert.equal(attrs[0].identifierExists, true);
  assert.equal(attrs[1].identifierExists, true);
});

test("varianta fara cod nu imprumuta codul produsului", () => {
  // Acelasi cod pe mai multe variante inseamna GTIN duplicat, deci respingere.
  // Mai bine o oferta fara identificator decat una respinsa.
  const attrs = atribute(expandProductOffers(BUSINESS, produs([
    combo("Alb", EAN_ALB),
    combo("Negru"),
  ], { gtin: EAN_ALB }), CONFIG));

  assert.deepEqual(attrs[0].gtins, [EAN_ALB]);
  assert.equal("gtins" in attrs[1], false);
  assert.equal(attrs[1].identifierExists, false);
});

test("un cod de varianta cu cifra de control gresita se lasa afara", () => {
  const attrs = atribute(expandProductOffers(BUSINESS, produs([
    combo("Alb", "5941234567890"),
    combo("Negru", EAN_NEGRU),
  ]), CONFIG));

  assert.equal("gtins" in attrs[0], false);
  assert.equal(attrs[0].identifierExists, false);
  assert.deepEqual(attrs[1].gtins, [EAN_NEGRU]);
});

test("codul de fabricant ramane pe variante si tine loc de identificator", () => {
  // Spre deosebire de GTIN, `mpn` se poate repeta intre variantele aceluiasi
  // model, deci nu e duplicat si nu strica nimic.
  const attrs = atribute(expandProductOffers(BUSINESS, produs([
    combo("Alb"),
  ], { mpn: "HJ-180200" }), CONFIG));

  assert.equal(attrs[0].mpn, "HJ-180200");
  assert.equal(attrs[0].identifierExists, true);
});

test("produsul simplu ramane cum era: codul de pe produs", () => {
  const simplu = { ...produs([]), page_sections: { google: { gtin: EAN_ALB } } };
  const attrs = atribute(expandProductOffers(BUSINESS, simplu, CONFIG));
  assert.equal(attrs.length, 1);
  assert.deepEqual(attrs[0].gtins, [EAN_ALB]);
});
