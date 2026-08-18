import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseCsv } from "@/lib/import/csv";
import { parseTabular, recordsToCsv } from "@/lib/import/tabular";
import { autoMapStockColumns, readFeedRows } from "./mapping";
import { buildStockPlan } from "./matcher";
import type { CatalogEntry } from "./types";

/**
 * Drumul intreg al unui XLSX ADEVARAT, prin toata conducta.
 *
 * Fixtura din `__fixtures__/stoc.xlsx` e un fisier .xlsx valid, cu numere
 * adevarate in celule, un rand gol la mijloc si un cod de 13 cifre. Testele de
 * mai jos trec exact pe drumul din productie:
 *
 *   XLSX -> parseTabular -> CSV pastrat in R2 -> parseCsv -> randuri -> plan
 *
 * De ce e nevoie de un fisier adevarat, si nu doar de randuri sintetice: restul
 * testelor verifica logica NOASTRA, dar nu si daca biblioteca de citire intoarce
 * ce credem noi. Aici se verifica si asta.
 */

const FIXTURE = path.join(process.cwd(), "src/lib/import/__fixtures__/stoc.xlsx");

function catalog(): CatalogEntry[] {
  return [
    {
      id: "p1", name: "Tricou", sku: "TRIC-001", external_id: null, gtin: null,
      price: 19.99, stock_quantity: 2, track_inventory: true,
      variantsEnabled: false,
      variants: [{ id: "m", title: "M", sku: "TRIC-001-M", stock_quantity: 1, price: 19.99, gtin: null, enabled: true, stockNumeric: true }],
    },
    {
      id: "p2", name: "Cu EAN", sku: "EAN-TEST", external_id: null, gtin: null,
      price: 5, stock_quantity: 0, track_inventory: true, variantsEnabled: false, variants: [],
    },
    {
      id: "p3", name: "Zecimal", sku: "ZEC", external_id: null, gtin: null,
      price: 1, stock_quantity: 1, track_inventory: true, variantsEnabled: false, variants: [],
    },
  ];
}

test("un XLSX adevarat se citeste si da antetele corecte", async () => {
  const read = await parseTabular(readFileSync(FIXTURE), "stoc.xlsx");
  assert.ok(!("error" in read), "error" in read ? read.error : "");
  if ("error" in read) return;

  assert.equal(read.format, "xlsx");
  assert.deepEqual(read.parsed.headers, ["cod produs", "stoc", "pret"]);
  /* Randul gol din mijloc nu ajunge in date. */
  assert.equal(read.parsed.rows.length, 4);
});

test("codul de 13 cifre nu se strica la citire", async () => {
  const read = await parseTabular(readFileSync(FIXTURE), "stoc.xlsx");
  if ("error" in read) throw new Error(read.error);

  const rand = read.parsed.rows.find((r) => r["cod produs"] === "EAN-TEST");
  assert.equal(rand?.stoc, "5941234567890");
});

test("coloanele se ghicesc din antetele venite din Excel", async () => {
  const read = await parseTabular(readFileSync(FIXTURE), "stoc.xlsx");
  if ("error" in read) throw new Error(read.error);

  const m = autoMapStockColumns(read.parsed.headers);
  assert.equal(m.identifier, "cod produs");
  assert.equal(m.stock, "stoc");
  assert.equal(m.price, "pret");
});

test("drumul complet: XLSX, prin CSV pastrat, pana la plan", async () => {
  const read = await parseTabular(readFileSync(FIXTURE), "stoc.xlsx");
  if ("error" in read) throw new Error(read.error);

  /* Exact ce se intampla in productie: se pastreaza CSV si se reciteste de acolo. */
  const reparsed = parseCsv(recordsToCsv(read.parsed));
  const mapping = autoMapStockColumns(reparsed.headers);
  const rows = readFeedRows(reparsed, mapping, { updatePrice: false });
  const plan = buildStockPlan(rows, catalog(), { matchKey: "sku_auto", updatePrice: false });

  const byId = new Map(plan.changes.map((c) => [c.identifier, c]));

  /* Produs simplu: 2 -> 12 */
  assert.equal(byId.get("TRIC-001")?.stockTo, 12);
  assert.equal(byId.get("TRIC-001")?.variantId, null);

  /* Varianta, dupa SKU-ul ei: 1 -> 4 */
  assert.equal(byId.get("TRIC-001-M")?.variantId, "m");
  assert.equal(byId.get("TRIC-001-M")?.stockTo, 4);

  /* Numarul mare a ajuns intreg pana la plan. */
  assert.equal(byId.get("EAN-TEST")?.stockTo, 5941234567890);

  /* Stocul zecimal din Excel e respins, nu rotunjit si nici inmultit. */
  assert.equal(byId.has("ZEC"), false);
  const problema = plan.issues.find((i) => i.identifier === "ZEC");
  assert.equal(problema?.problem, "invalid");
});

test("pretul din Excel se scrie doar cand e cerut", async () => {
  const read = await parseTabular(readFileSync(FIXTURE), "stoc.xlsx");
  if ("error" in read) throw new Error(read.error);

  const mapping = autoMapStockColumns(read.parsed.headers);
  const rows = readFeedRows(read.parsed, mapping, { updatePrice: true });
  /* p2 are pretul 5 in catalog, iar fisierul spune 0. */
  const plan = buildStockPlan(rows, catalog(), { matchKey: "sku_auto", updatePrice: true });

  const ean = plan.changes.find((c) => c.identifier === "EAN-TEST");
  assert.equal(ean?.priceFrom, 5);
  assert.equal(ean?.priceTo, 0);
});

test("un fisier care nu e nici CSV nici XLSX da eroare limpede", async () => {
  /* Semnatura de XLS vechi (Office 2003). */
  const xlsVechi = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  const read = await parseTabular(xlsVechi, "vechi.xls");
  assert.ok("error" in read);
  if ("error" in read) assert.match(read.error, /\.xls/);
});
