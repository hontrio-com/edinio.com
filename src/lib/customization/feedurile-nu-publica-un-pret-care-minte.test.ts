import assert from "node:assert/strict";
import { test } from "node:test";
import { pretulDinCatalogMinte } from "./pretul-din-catalog-minte";
import { expandProductOffers, type MappableBusiness, type MappableProduct } from "@/lib/google-merchant/mapping";
import { buildCatalogItems, type CatalogBusiness, type CatalogProduct } from "@/lib/facebook/catalog-feed";
import type { GoogleMerchantConfig } from "@/lib/google-merchant/types";
import { slimPageSections } from "@/lib/storefront/catalog-slim";

/**
 * Nici Google Merchant, nici catalogul Meta nu mai publica un pret pe care nimeni nu-l plateste.
 *
 * ═══ ⚠ DE CE E O PROBLEMA DE BANI, NU DE DATE ═══
 *
 * Feedurile n-au unde sa puna decat un singur numar, si il luau pe cel din `products.price`. La un
 * fototapet vandut la metru patrat, cu `includePretulProdusului` stins, numarul ala nu se incaseaza
 * NICIODATA: feedul anunta 89 de lei, pagina cere 603,75. Comerciantul plateste clicul si pierde
 * omul, iar la Google nepotrivirea intre pretul din feed si cel de pe pagina e chiar clasa pentru
 * care se suspenda ofertele.
 *
 * ⚠ SI PARTEA CEALALTA CONTEAZA LA FEL DE MULT. In productie sunt 29 de produse cu personalizare
 * FARA pret — text, textarea, image — si patru magazine care le vand corect azi. O poarta pusa pe
 * „are personalizare" in loc de „pretul minte" le-ar fi retras pe toate din Google si din Meta
 * intr-o singura rulare de cron, fara ca nimeni sa fi cerut asta. De-aia fiecare proba de mai jos
 * are perechea ei: unul iese, doua raman.
 */

const BUSINESS: MappableBusiness & CatalogBusiness = {
  slug: "exemplu",
  custom_domain: null,
  store_name: "Exemplu",
  business_name: "Exemplu SRL",
};

const CONFIG = { content_language: "ro", feed_label: "RO" } as GoogleMerchantConfig;

/* ── Cele trei produse din sarcina ────────────────────────────────────────── */

/** Cel VECHI: gravura si o poza, fara niciun pret. Asa arata toate cele 29 din productie. */
const VECHI = {
  customization: {
    enabled: true,
    fields: [
      { id: "nume", type: "text", label: "Nume gravat", required: true, max_length: 20 },
      { id: "poza", type: "image", label: "Poza", required: false },
    ],
  },
};

/**
 * Fototapetul: 89 de lei in catalog, dar catalogul nu se incaseaza (`includePretulProdusului`
 * stins). Cel mai ieftin exemplar posibil e 100x70 cm pe material Standard = 0,7 m² x 69 = 48,30.
 */
const FOTOTAPET = {
  customization: {
    enabled: true,
    fields: [
      { id: "dim", type: "dimensiuni", label: "Dimensiuni", required: true, unitate: "cm",
        latime: { min: 100, max: 500 }, inaltime: { min: 70, max: 350 } },
      { id: "mat", type: "butoane", label: "Material", required: true,
        optiuni: [
          { id: "std", eticheta: "Standard", impact: { fel: "pe_m2", suma: 69 } },
          { id: "prm", eticheta: "Premium", impact: { fel: "pe_m2", suma: 89 } },
        ] },
    ],
    pret: { fel: "suprafata", campDimensiuni: "dim", tarif: 69, campTarif: "mat",
      includePretulProdusului: false },
  },
};

/** Suplimentul strict OPTIONAL: cutia cadou la +30. Aici 89 CHIAR e pretul de pornire. */
const OPTIONAL = {
  customization: {
    enabled: true,
    fields: [
      { id: "cutie", type: "comutator", label: "Cutie cadou", required: false,
        impact: { fel: "fix", suma: 30 } },
    ],
  },
};

/* ── Produsele, asa cum le primesc cele doua feeduri ──────────────────────── */

function laGoogle(page_sections: unknown): MappableProduct {
  return {
    id: "p1", name: "Fototapet Personalizat", slug: "fototapet",
    description: "Tiparit la comanda", price: 89, compare_at_price: null,
    images: ["https://exemplu.ro/a.jpg"], category: null,
    track_inventory: false, stock_quantity: null, weight_grams: null,
    page_sections,
  };
}

function laMeta(page_sections: unknown): CatalogProduct {
  return {
    id: "p1", name: "Fototapet Personalizat", slug: "fototapet",
    description: "Tiparit la comanda", price: 89, compare_at_price: null,
    images: ["https://exemplu.ro/a.jpg"], category: null,
    track_inventory: false, stock_quantity: null,
    page_sections,
  };
}

const oferteGoogle = (ps: unknown) => expandProductOffers(BUSINESS, laGoogle(ps), CONFIG);
const articoleMeta = (ps: unknown) => buildCatalogItems(BUSINESS, laMeta(ps));
const pretulGoogle = (ps: unknown) =>
  ((oferteGoogle(ps)[0].input as { productAttributes: Record<string, unknown> })
    .productAttributes.price as { amountMicros: string }).amountMicros;

/* ══════════════════════════════════════════════════════════════════════════
   POARTA
   ══════════════════════════════════════════════════════════════════════════ */

test("⚠ produsul VECHI ramane publicat in amandoua feedurile", () => {
  /*
   * ⚠ ASTA E PROBA CARE APARA PRODUCTIA. Sunt 29 de produse in 4 magazine, cu text, textarea si
   * image, fara nici un pret pe camp. Podeaua lor e chiar pretul de catalog, deci poarta n-are ce
   * sa gaseasca — iar daca gaseste ceva, s-au retras 29 de oferte care se vindeau corect.
   */
  assert.equal(pretulDinCatalogMinte(laGoogle(VECHI)), false);

  const g = oferteGoogle(VECHI);
  assert.equal(g.length, 1, "produsul vechi a disparut din Google");
  assert.equal(pretulGoogle(VECHI), "89000000", "alt pret decat cel de catalog");

  const m = articoleMeta(VECHI);
  assert.equal(m.length, 1, "produsul vechi a disparut din catalogul Meta");
  assert.equal(m[0].price, "89.00 RON");
});

test("⚠ fototapetul cu pret pe m² iese din amandoua feedurile", () => {
  /*
   * Cei 89 de lei nu se incaseaza niciodata: cea mai ieftina bucata pe care o poate cumpara cineva
   * costa 48,30, si cea de pe pagina din exemplu 603,75. Orice numar am fi trimis ar fi fost altul
   * decat cel de pe pagina, deci nu se trimite nimic.
   */
  assert.equal(pretulDinCatalogMinte(laGoogle(FOTOTAPET)), true);
  assert.deepEqual(oferteGoogle(FOTOTAPET), [], "89 de lei au plecat spre Google");
  assert.deepEqual(articoleMeta(FOTOTAPET), [], "89 de lei au plecat spre Meta");
});

test("⚠ suplimentul strict OPTIONAL nu scoate produsul: acolo 89 chiar E pretul de pornire", () => {
  /*
   * Distinctia asta hotaraste totul. Cutia cadou la +30 se poate refuza, deci exista cumparatori
   * care platesc chiar 89 — feedul e cinstit. Cu gravura OBLIGATORIE la +20 nu mai exista niciunul,
   * si atunci acelasi produs iese (vezi perechea de mai jos).
   */
  assert.equal(pretulDinCatalogMinte(laGoogle(OPTIONAL)), false);
  assert.equal(oferteGoogle(OPTIONAL).length, 1, "produsul cu supliment optional a fost retras");
  assert.equal(pretulGoogle(OPTIONAL), "89000000");
  assert.equal(articoleMeta(OPTIONAL).length, 1, "produsul cu supliment optional a fost retras");

  const obligatoriu = {
    customization: {
      enabled: true,
      fields: [{ id: "g", type: "text", label: "Gravura", required: true,
        impact: { fel: "fix", suma: 20 } }],
    },
  };
  assert.equal(pretulDinCatalogMinte(laGoogle(obligatoriu)), true);
  assert.deepEqual(oferteGoogle(obligatoriu), [], "nimeni nu poate plati 89, si totusi s-au trimis");
  assert.deepEqual(articoleMeta(obligatoriu), []);
});

test("⚠ pretul de catalog CHIAR se compara: fototapetul cinstit ramane in feeduri", () => {
  /*
   * ⚠ PROBA CARE APARA `price`-ul DIN POARTA. Poarta compara podeaua cu `products.price`.
   * Scos pretul din comparatie — `pretulDepindeDeAlegeri(definitie, 0)` — toate celelalte probe
   * din fisier raman verzi, fiindca in ele podeaua difera de pret oricum. Masurat, nu presupus:
   * mutantul ala a trecut 9 din 9.
   *
   * Ce costa: comerciantul care pune in catalog CHIAR suma minima facturabila (1 m² x 89) spune
   * adevarul — nimeni nu plateste mai putin de 89 — si totusi produsul lui ar fi fost retras din
   * amandoua feedurile. Adica poarta ar fi inceput sa scoata produse cinstite.
   */
  const cinstit = {
    customization: {
      enabled: true,
      fields: [
        { id: "dim", type: "dimensiuni", label: "Dimensiuni", required: true, unitate: "cm",
          latime: { min: 100, max: 500 }, inaltime: { min: 70, max: 350 } },
      ],
      /* Bucata cea mai mica, 100x70 cm, face 0,7 m² — ridicata la minimul de 1 m² x 89 = 89. */
      pret: { fel: "suprafata", campDimensiuni: "dim", tarif: 89,
        includePretulProdusului: false, minimM2: 1 },
    },
  };
  assert.equal(pretulDinCatalogMinte(laGoogle(cinstit)), false);
  assert.equal(oferteGoogle(cinstit).length, 1, "un fototapet cu pret adevarat a fost retras");
  assert.equal(pretulGoogle(cinstit), "89000000");
  assert.equal(articoleMeta(cinstit).length, 1, "un fototapet cu pret adevarat a fost retras");

  /* Perechea, pe ACELASI produs: cu 120 in catalog nimeni nu mai plateste atat, deci iese. */
  assert.equal(pretulDinCatalogMinte({ price: 120, page_sections: cinstit }), true);
  assert.equal(pretulDinCatalogMinte({ price: 48.3, page_sections: cinstit }), true);
});

test("⚠ produsul FARA personalizare nu e atins de poarta", () => {
  /* Marea majoritate a catalogului. O poarta care s-ar inchide si aici ar goli feedurile. */
  const simplu = { variants: { enabled: false, options: [] } };
  assert.equal(pretulDinCatalogMinte(laGoogle(simplu)), false);
  assert.equal(pretulDinCatalogMinte(laGoogle(null)), false);
  assert.equal(pretulDinCatalogMinte(laGoogle(undefined)), false);
  assert.equal(pretulDinCatalogMinte(laGoogle("scris strambe")), false);
  assert.equal(oferteGoogle(simplu).length, 1);
  assert.equal(articoleMeta(simplu).length, 1);
});

test("⚠ fototapetul cu variante iese INTREG, nu doar oferta de baza", () => {
  /*
   * Un produs cu variante da cate o oferta pe combinatie, fiecare cu pretul ei derivat din cel de
   * baza. Daca pretul de baza minte, mint toate — deci nu se publica niciuna. Fara proba asta,
   * poarta ar fi putut fi pusa dupa expandare si ar fi lasat variantele sa plece.
   */
  const cuVariante = {
    ...FOTOTAPET,
    variants: {
      enabled: true,
      options: [{ id: "culoare", name: "Culoare", values: ["Alb", "Negru"] }],
      combinations: [
        { id: "alb", title: "Alb", price: "", compare_at_price: "", sku: "", stock_quantity: "", image: "", enabled: true },
        { id: "negru", title: "Negru", price: "129", compare_at_price: "", sku: "", stock_quantity: "", image: "", enabled: true },
      ],
    },
  };
  assert.deepEqual(oferteGoogle(cuVariante), [], "variantele fototapetului au plecat spre Google");
  assert.deepEqual(articoleMeta(cuVariante), [], "variantele fototapetului au plecat spre Meta");

  /* Perechea: aceleasi variante pe un produs vechi raman amandoua. */
  const vechiCuVariante = { ...VECHI, variants: cuVariante.variants };
  assert.equal(oferteGoogle(vechiCuVariante).length, 2);
  assert.equal(articoleMeta(vechiCuVariante).length, 2);
});

test("⚠ pe forma SLIMUITA pretul nu se poate verifica, deci nu pleaca", () => {
  /*
   * `slimPageSections` taie campurile si lasa in loc doar steagul `{ cere: true }`. Feedurile
   * citesc azi randul intreg din baza, deci ramura asta nu se atinge — dar tocmai asa a intrat
   * defectul pe carduri: cineva a slimuit `page_sections` si toate portile de dedesubt au inceput
   * sa raspunda „nu cere personalizare". Aici raspunsul e „nu stiu", si un pret neverificat nu
   * pleaca pe feed.
   */
  const slim = slimPageSections(FOTOTAPET);
  assert.ok(slim, "slimuirea a aruncat tot");
  assert.equal(pretulDinCatalogMinte({ price: 89, page_sections: slim }), true);

  /* Si produsul vechi slimuit: tot „cere personalizare", tot neverificabil. */
  assert.equal(pretulDinCatalogMinte({ price: 89, page_sections: slimPageSections(VECHI) }), true);
});
