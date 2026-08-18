import assert from "node:assert/strict";
import { test } from "node:test";
import { buildStockPlan } from "./matcher";
import type { CatalogEntry, CatalogVariant, StockFeedRow } from "./types";

/*
 * Scrierile care „reusesc" fara sa ajunga nicaieri.
 *
 * Sunt cele mai periculoase din tot feedul: raportul spune „actualizat",
 * ecranul e verde, si stocul din magazin ramane cel vechi. Un rand negasit se
 * vede; un rand raportat drept reusit nu se vede niciodata.
 */

function varianta(over: Partial<CatalogVariant> = {}): CatalogVariant {
  return { id: "v1", title: "M", sku: "A-M", gtin: null, enabled: true, stock_quantity: 1, stockNumeric: true, price: 100, ...over };
}

function produs(over: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    id: "p1",
    name: "Tricou",
    sku: "A",
    external_id: null,
    gtin: null,
    price: 100,
    stock_quantity: 5,
    track_inventory: true,
    variantsEnabled: false,
    variants: [],
    ...over,
  };
}

const rand = (over: Partial<StockFeedRow> = {}): StockFeedRow => ({
  rowIndex: 1,
  identifier: "A",
  stock: 12,
  price: null,
  ...over,
});

const peSku = { matchKey: "sku" as const, updatePrice: false };
const peEan = { matchKey: "gtin" as const, updatePrice: false };
const peVariantaSku = { matchKey: "variant_sku" as const, updatePrice: false };

test("stocul scris pe un produs CU variante aprinse se raporteaza, nu se pretinde reusit", () => {
  /*
   * `products_sync_variant_stock` recalculeaza `products.stock_quantity` ca suma
   * combinatiilor aprinse. Scrierea supravietuia pana la prima vanzare a oricarei
   * marimi, apoi disparea — iar raportul spusese deja „actualizat".
   */
  const catalog = [
    produs({
      variantsEnabled: true,
      variants: [varianta({ id: "m", title: "M" }), varianta({ id: "l", title: "L", sku: "A-L" })],
    }),
  ];
  const plan = buildStockPlan([rand({ identifier: "A", stock: 40 })], catalog, peSku);

  assert.equal(plan.changes.length, 0, "n-are voie sa promita o scriere care nu tine");
  assert.equal(plan.issues[0].problem, "ignored");
  assert.match(plan.issues[0].detail, /suma/);
  assert.match(plan.issues[0].detail, /SKU varianta/);
});

test("PRETUL produsului-parinte se scrie chiar daca are variante", () => {
  /*
   * Prima mea reparatie refuza randul INTREG, deci si o actualizare doar de
   * pret pe produsul-parinte — care e perfect legitima: pretul produsului e al
   * lui, nu o suma a combinatiilor. Doar STOCUL e recalculat de declansator.
   */
  const catalog = [
    produs({
      price: 100,
      variantsEnabled: true,
      variants: [varianta({ id: "m", title: "M" })],
    }),
  ];
  const plan = buildStockPlan(
    [{ rowIndex: 1, identifier: "A", stock: null, price: 149 }],
    catalog,
    { matchKey: "sku", updatePrice: true },
  );

  assert.equal(plan.issues.length, 0, JSON.stringify(plan.issues));
  assert.equal(plan.changes.length, 1);
  assert.equal(plan.changes[0].priceTo, 149);
  assert.equal(plan.changes[0].stockTo, null);
});

test("acelasi produs FARA variante se scrie normal", () => {
  /* Proba trebuie sa poata si sa treaca: majoritatea produselor n-au variante,
     iar pentru ele coloana de stoc a produsului e singurul adevar. */
  const plan = buildStockPlan([rand({ identifier: "A", stock: 40 })], [produs()], peSku);
  assert.equal(plan.issues.length, 0, JSON.stringify(plan.issues));
  assert.equal(plan.changes.length, 1);
  assert.equal(plan.changes[0].stockTo, 40);
  assert.equal(plan.changes[0].variantId, null);
});

test("un produs cu blocul de variante pornit dar TOATE stinse se scrie pe produs", () => {
  /* Declansatorul sare cand nu exista nicio combinatie aprinsa, deci acolo
     scrierea pe produs chiar tine. */
  const catalog = [
    produs({ variantsEnabled: true, variants: [varianta({ enabled: false })] }),
  ];
  const plan = buildStockPlan([rand({ identifier: "A", stock: 40 })], catalog, peSku);
  assert.equal(plan.changes.length, 1);
  assert.equal(plan.changes[0].variantId, null);
});

test("cand declansatorul NU ar suprascrie, scrierea pe produs merge mai departe", () => {
  /*
   * `sync_product_stock_from_variants` sare cand macar o combinatie aprinsa n-are
   * stoc numeric — si atunci coloana produsului chiar ramane a noastra. Masurat
   * in productie: 351 de produse din 3.207 sunt in situatia asta.
   *
   * Prima mea reparatie nu copia conditia declansatorului si le refuza pe toate.
   */
  const catalog = [
    produs({
      variantsEnabled: true,
      variants: [
        varianta({ id: "m", title: "M" }),
        varianta({ id: "l", title: "L", sku: "A-L", stockNumeric: false }),
      ],
    }),
  ];
  const plan = buildStockPlan([rand({ identifier: "A", stock: 40 })], catalog, peSku);

  assert.equal(plan.issues.length, 0, JSON.stringify(plan.issues));
  assert.equal(plan.changes.length, 1);
  assert.equal(plan.changes[0].variantId, null);
  assert.equal(plan.changes[0].stockTo, 40);
});

test("stocul scris intr-o combinatie DEZACTIVATA se raporteaza, nu se pretinde reusit", () => {
  /* 8.313 din 47.314 de combinatii sunt stinse in productie. Magazinul nu le
     arata, iar declansatorul nu le numara: stocul scris acolo nu exista. */
  const catalog = [
    produs({ variantsEnabled: true, variants: [varianta({ id: "m", sku: "A-M", enabled: false })] }),
  ];
  const plan = buildStockPlan([rand({ identifier: "A-M", stock: 25 })], catalog, peVariantaSku);

  assert.equal(plan.changes.length, 0);
  assert.equal(plan.issues[0].problem, "ignored");
  assert.match(plan.issues[0].detail, /dezactivata/);
});

test("aceeasi combinatie, aprinsa, se scrie", () => {
  const catalog = [
    produs({ variantsEnabled: true, variants: [varianta({ id: "m", sku: "A-M", enabled: true })] }),
  ];
  const plan = buildStockPlan([rand({ identifier: "A-M", stock: 25 })], catalog, peVariantaSku);
  assert.equal(plan.issues.length, 0, JSON.stringify(plan.issues));
  assert.equal(plan.changes.length, 1);
  assert.equal(plan.changes[0].variantId, "m");
});

test("cheia Cod EAN ajunge si la combinatii", () => {
  /*
   * 9.991 de combinatii au cod de bare propriu. Inainte, indexul lua doar EAN-ul
   * de pe produs, deci un feed pe coduri de bare per marime — exact cum cere
   * Google — iesea „negasit" pe fiecare rand.
   */
  const catalog = [
    produs({
      gtin: "5941000000001",
      variantsEnabled: true,
      variants: [
        varianta({ id: "m", title: "M", sku: "A-M", gtin: "5941000000002" }),
        varianta({ id: "l", title: "L", sku: "A-L", gtin: "5941000000003" }),
      ],
    }),
  ];
  const plan = buildStockPlan(
    [
      rand({ rowIndex: 1, identifier: "5941000000002", stock: 4 }),
      rand({ rowIndex: 2, identifier: "5941000000003", stock: 9 }),
    ],
    catalog,
    peEan,
  );

  assert.equal(plan.issues.length, 0, JSON.stringify(plan.issues));
  assert.equal(plan.changes.length, 2);
  assert.equal(plan.changes[0].variantId, "m");
  assert.equal(plan.changes[1].variantId, "l");
  assert.equal(plan.changes[1].stockTo, 9);
});

test("codul care si-a pierdut zeroul din fata in Excel se potriveste totusi", () => {
  /*
   * Excel salveaza o coloana de coduri formatata ca numar fara zeroul din fata.
   * Omul vede codul intreg pe ecran si nu intelege de ce sistemul zice ca nu
   * exista.
   */
  const catalog = [produs({ gtin: "05941234567" })];
  const plan = buildStockPlan([rand({ identifier: "5941234567", stock: 3 })], catalog, peEan);

  assert.equal(plan.issues.length, 0, JSON.stringify(plan.issues));
  assert.equal(plan.changes.length, 1);
  assert.equal(plan.changes[0].stockTo, 3);
});

test("un SKU cu zerouri in fata NU se dezbraca", () => {
  /* La un cod care nu e numai cifre, zeroul poate face parte din el. Regula
     trebuie sa se opreasca acolo, altfel apar potriviri gresite. */
  const catalog = [produs({ sku: "007-ABC" })];
  const plan = buildStockPlan([rand({ identifier: "7-ABC", stock: 3 })], catalog, peSku);

  assert.equal(plan.changes.length, 0);
  assert.equal(plan.issues[0].problem, "not_found");
});

test("cand dezbracarea de zerouri duce la doua produse, randul ramane ambiguu", () => {
  const catalog = [produs({ id: "p1", gtin: "0123" }), produs({ id: "p2", gtin: "00123" })];
  const plan = buildStockPlan([rand({ identifier: "123", stock: 3 })], catalog, peEan);

  assert.equal(plan.changes.length, 0);
  assert.equal(plan.issues[0].problem, "ambiguous");
});
