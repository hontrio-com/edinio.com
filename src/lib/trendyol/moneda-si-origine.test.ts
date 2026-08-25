import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildVariantPrices } from "./mapping";
import type { MappableProduct, TrendyolVariantData } from "./mapping";

/* ══════════════════════════════════════════════════════════════════════════
   DOUA LUCRURI CARE PLEACA GRESIT LA EI FARA SA DEA NICIO EROARE (26.08.2026)
   ══════════════════════════════════════════════════════════════════════════ */

const PRODUS = {
  id: "p1", name: "Ceva", description: null, price: 100, compare_at_price: 120,
  sku: "SKU1", track_inventory: true, stock_quantity: 5, images: [], page_sections: null,
} as unknown as MappableProduct;

const varianta = (peste: Partial<TrendyolVariantData> = {}) => ({
  barcode: "BC1", quantity: 3, sale_price: null, list_price: null,
  vat_rate: 19, enabled: true, stock_code: null, variant_title: null, attributes: [],
  ...peste,
} as unknown as TrendyolVariantData);

/* ── Pretul in moneda vitrinei ─────────────────────────────────────────────── */

test("⚠ pe vitrina de acasa, pretul din magazin ramane implicitul", () => {
  const r = buildVariantPrices(PRODUS, varianta(), { storefront: "RO" });
  assert.deepEqual(r, { listPrice: 120, salePrice: 100 });
});

test("⚠ pe o vitrina cu ALTA moneda, lipsa pretului explicit OPRESTE trimiterea", () => {
  /*
   * ═══ 100 DE LEI TRIMISI CA 100 DE EURO ═══
   *
   * Trendyol citeste numarul in moneda vitrinei; noi nu convertim nimic. Cand varianta n-avea
   * pret Trendyol propriu, se cadea inapoi pe pretul din magazin — care e in lei:
   *
   *   product.price = 100 (RON, vreo 20 EUR)  ->  vitrina GR  ->  „100 EUR"
   *
   * Marfa pleaca la de cinci ori pretul. Si NU DA NICIO EROARE: numarul e valid, doar
   * intelesul e altul. Se vede abia la prima comanda.
   */
  const r = buildVariantPrices(PRODUS, varianta(), { storefront: "GR" });
  assert.ok("error" in r, "trebuie sa fie o piedica, nu o valoare implicita");
  assert.match(r.error, /Grecia/);
  assert.match(r.error, /EUR/, "si se spune moneda ceruta");
  assert.match(r.error, /RON/, "si de ce nu se poate folosi cel din magazin");
});

test("⚠ cu pret explicit, vitrina straina trece", () => {
  const r = buildVariantPrices(PRODUS, varianta({ sale_price: 19.9 }), { storefront: "GR" });
  assert.deepEqual(r, { listPrice: 19.9, salePrice: 19.9 });
  /* ⚠ Pretul TAIAT nu se ia din magazin cand moneda difera: ar fi fost tot in lei. Fara unul
     explicit, ramane egal cu cel de vanzare. */
  const cu = buildVariantPrices(PRODUS, varianta({ sale_price: 19.9, list_price: 24.9 }), { storefront: "GR" });
  assert.deepEqual(cu, { listPrice: 24.9, salePrice: 19.9 });
});

test("⚠ fara vitrina data, purtarea ramane cea de pana acum", () => {
  /* Apelantii care listeaza acasa nu trebuie sa se schimbe. */
  assert.deepEqual(buildVariantPrices(PRODUS, varianta()), { listPrice: 120, salePrice: 100 });
});

/* ── `origin`, cu termen pe 23 octombrie ───────────────────────────────────── */

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

test("⚠ `origin` pleaca de pe listare, cu implicitul magazinului peste", () => {
  const m = viu("src/lib/trendyol/mapping.ts");
  assert.match(m, /listing\.country_of_origin \|\| config\.default_country_of_origin/);
  assert.match(m, /if \(\/\^\[A-Z\]\{2\}\$\/\.test\(taraFabricatiei\)\) item\.origin = taraFabricatiei;/);
});

test("⚠ NU se inventeaza un implicit „RO”", () => {
  /*
   * Cea mai importanta proba de aici. Un magazin din Romania vinde hrana facuta in Germania si
   * jucarii facute in China: un „RO" pus de noi peste tot ar fi o declaratie FALSA despre
   * marfa comerciantului, nu o comoditate.
   *
   * ⚠ Cat timp campul e optional la ei (pana pe 23.10.2026), lipsa lui nu strica nimic. Cand
   * devine obligatoriu, refuzul lor va numi chiar campul.
   */
  const m = viu("src/lib/trendyol/mapping.ts");
  const i = m.indexOf("const taraFabricatiei");
  assert.ok(i > 0);
  assert.doesNotMatch(m.slice(i, i + 240), /\|\| "RO"/, "fara implicit inventat");
});

test("⚠ campul nou NU inlocuieste atributul, pana la termen", () => {
  /*
   * In perioada hibrida, o categorie care cere „origine" si ca ATRIBUT trebuie sa primeasca
   * in continuare si atributul. Ele merg impreuna, nu unul in locul celuilalt — de-aia nu se
   * scoate nimic din `attributes`.
   */
  const m = viu("src/lib/trendyol/mapping.ts");
  /* ⚠ Forma s-a schimbat in aceeasi zi, cand atributele au inceput sa treaca prin
     `curataAtribute` (multi-select). Intelesul probei e acelasi: atributele PLEACA mai
     departe, alaturi de `origin`, nu in locul lui. */
  assert.match(m, /attributes: curataAtribute\(\[\.\.\.productLevelAttrs, \.\.\.\(Array\.isArray\(v\.attributes\) \? v\.attributes : \[\]\)\]\)/);
});

test("⚠ si baza pazeste forma: doua litere mari, sau nimic", () => {
  /* Fara paza, un „Romania" scris in graba ar fi plecat la ei si ar fi fost refuzat abia in
     lot, cu un mesaj despre un camp pe care comerciantul nu-l vede. */
  const baseline = readFileSync("migrations/000-schema-baseline.sql", "utf8");
  assert.match(baseline, /trendyol_listings_origin_chk/);
  assert.match(baseline, /country_of_origin ~ '\^\[A-Z\]\{2\}\$'/);
});

test("⚠ si e ALT lucru decat originea vanzatorului", () => {
  /*
   * `config.origine` exista de mult si e originea VANZATORULUI, folosita la cotele de TVA sub
   * Cross Country. Confundate, un magazin cu originea RO ar fi declarat toata marfa „facuta in
   * Romania".
   */
  const t = readFileSync("src/lib/trendyol/types.ts", "utf8");
  assert.match(t, /default_country_of_origin\?: string;/);
  assert.match(t, /NU E `origine`/);
});
