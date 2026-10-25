import test from "node:test";
import assert from "node:assert/strict";
import { expandProductOffers, type MappableBusiness } from "@/lib/google-merchant/mapping";
import { produsPentruHontrio, type RandProdus } from "./produse";

const MAGAZIN: MappableBusiness = {
  slug: "magazin-test", custom_domain: null, store_name: "Magazin Test", business_name: "Test SRL", prefix_produs: "product",
};
const FARA_STARI = new Map<string, string>();

function produs(peste: Partial<RandProdus> = {}): RandProdus {
  return {
    id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    name: "Geaca de iarna",
    slug: "geaca-de-iarna",
    description: "<p>Calda</p>",
    price: 100,
    compare_at_price: 120,
    images: ["https://cdn.exemplu.ro/geaca.jpg", "https://cdn.exemplu.ro/geaca-2.jpg"],
    category: "Geci",
    is_active: true,
    is_bundle: false,
    track_inventory: true,
    stock_quantity: 5,
    weight_grams: null,
    sku: "GEACA-1",
    page_sections: { google: { brand: "Marca", custom_label_0: "iarna" } },
    created_at: "2026-10-01T00:00:00+00:00",
    updated_at: "2026-10-20T00:00:00+00:00",
    ...peste,
  };
}

const combo = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id, title, price: "", compare_at_price: "", sku: "", stock_quantity: "", image: "", enabled: true, ...extra,
});

const CU_VARIANTE = {
  variants: {
    enabled: true,
    options: [{ name: "Mărime", values: ["S", "M", "L"] }],
    combinations: [
      combo("s", "S", { stock_quantity: "0", sku: "GEACA-S", gtin: "4006381333931" }),
      combo("m", "M", { price: "110" }),
      combo("l", "L", { enabled: false }),
    ],
  },
};

/* Fixtura din `retrage-pretul-care-minte.test.ts`: pretul se socoteste la metru patrat. */
const PRET_PE_M2 = {
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
    pret: { fel: "suprafata", campDimensiuni: "dim", tarif: 69, campTarif: "mat", includePretulProdusului: false },
  },
};

test("⚠ ofertele sunt EXACT cele care pleaca la Merchant Center: aceleasi ID-uri, aceleasi linkuri", () => {
  for (const p of [produs(), produs({ page_sections: CU_VARIANTE })]) {
    const laGoogle = expandProductOffers(MAGAZIN, p, {});
    const laHontrio = produsPentruHontrio(MAGAZIN, p, {}, null, FARA_STARI).oferte;
    assert.deepEqual(laHontrio.map((o) => o.id), laGoogle.map((o) => o.offerId));
    assert.deepEqual(
      laHontrio.map((o) => o.url),
      laGoogle.map((o) => (o.input.productAttributes as { link: string }).link),
    );
  }
});

test("produsul simplu: o oferta, cu pretul platit si cel taiat", () => {
  const [o] = produsPentruHontrio(MAGAZIN, produs(), {}, null, FARA_STARI).oferte;
  assert.equal(o.id, produs().id);
  assert.equal(o.grup_id, null);
  assert.equal(o.varianta, null);
  assert.equal(o.pret, 100);
  assert.equal(o.pret_vechi, 120);
  assert.equal(o.disponibil, true);
  assert.equal(o.stoc, 5);
  assert.equal(o.brand, "Marca");
  assert.deepEqual(o.etichete, { custom_label_0: "iarna" });
  assert.equal(o.imagine, "https://cdn.exemplu.ro/geaca.jpg");
  assert.ok(o.url.startsWith("https://www.edinio.com/magazin-test/product/geaca-de-iarna"));
});

test("fara reducere, nu exista pret taiat; fara stoc urmarit, stocul e `null` (nelimitat)", () => {
  const [o] = produsPentruHontrio(MAGAZIN, produs({ compare_at_price: null, track_inventory: false, stock_quantity: null }), {}, null, FARA_STARI).oferte;
  assert.equal(o.pret, 100);
  assert.equal(o.pret_vechi, null);
  assert.equal(o.stoc, null);
  assert.equal(o.disponibil, true);
});

test("variantele: cate o oferta pe combinatie activa, cu pretul, stocul si codul ei", () => {
  const p = produsPentruHontrio(MAGAZIN, produs({ page_sections: CU_VARIANTE, compare_at_price: null }), {}, null, FARA_STARI);
  assert.deepEqual(p.oferte.map((o) => o.varianta), ["S", "M"], "combinatia stinsa nu are oferta");
  const [s, m] = p.oferte;
  assert.equal(s.grup_id, p.id);
  assert.equal(s.stoc, 0);
  assert.equal(s.disponibil, false);
  assert.equal(s.gtin, "4006381333931");
  assert.equal(s.sku, "GEACA-S");
  /* ⚠ Campul de stoc gol pe varianta inseamna „stocul produsului", nu zero. */
  assert.equal(m.stoc, 5);
  assert.equal(m.disponibil, true);
  assert.equal(m.pret, 110);
  assert.equal(m.sku, "GEACA-1");
});

test("produsul stins n-are oferte, si nici motiv: motivul e chiar `activ: false`", () => {
  const p = produsPentruHontrio(MAGAZIN, produs({ is_active: false }), {}, null, FARA_STARI);
  assert.equal(p.activ, false);
  assert.deepEqual(p.oferte, []);
  assert.equal(p.fara_oferte, null);
});

test("⚠ pretul care minte: nicio oferta, ca la Google, si Hontrio afla de ce", () => {
  const p = produsPentruHontrio(MAGAZIN, produs({ page_sections: PRET_PE_M2, track_inventory: false }), {}, null, FARA_STARI);
  assert.equal(p.activ, true);
  assert.deepEqual(p.oferte, []);
  assert.equal(p.fara_oferte, "pret_neconfirmat");
});

test("pachetul: stocul e cate pachete intregi ies din componente", () => {
  const pachet = (inStock: boolean, max: number) =>
    produsPentruHontrio(MAGAZIN, produs({ is_bundle: true, track_inventory: false }), {}, { inStock, max }, FARA_STARI).oferte[0];
  assert.deepEqual([pachet(true, 3).stoc, pachet(true, 3).disponibil], [3, true]);
  assert.deepEqual([pachet(true, Infinity).stoc, pachet(true, Infinity).disponibil], [null, true]);
  assert.deepEqual([pachet(false, 0).stoc, pachet(false, 0).disponibil], [0, false]);
});

test("starea de la Google se lipeste pe oferta ei", () => {
  const p = produs();
  const [o] = produsPentruHontrio(MAGAZIN, p, {}, null, new Map([[p.id, "disapproved"]])).oferte;
  assert.equal(o.stare_google, "disapproved");
});
