import assert from "node:assert/strict";
import { test } from "node:test";
import { autoMapStockColumns, parseStockValue, readFeedRows } from "./mapping";
import { parseIntOrNull } from "@/lib/import/normalize";
import { buildStockPlan } from "./matcher";
import type { CatalogEntry } from "./types";

/**
 * Citirea fisierului. Aici intra date scrise de mana de furnizori, deci se poate
 * intampla orice: unitati lipite de numar, virgula in loc de punct, coloane
 * numite cum s-a nimerit.
 */

// ── Capcana pentru care exista un parser propriu ─────────────────────────────

test("parseIntOrNull din proiect ar strica un stoc zecimal", () => {
  // Nu testam codul nostru aici, ci motivul pentru care nu il folosim: acela
  // sterge separatorii si abia apoi taie, deci 12.5 devine 125.
  assert.equal(parseIntOrNull("12.5"), 125);
  assert.equal(parseIntOrNull("2,5"), 25);

  // Al nostru pastreaza valoarea adevarata, ca potrivitorul sa o poata refuza.
  assert.equal(parseStockValue("12.5"), 12.5);
  assert.equal(parseStockValue("2,5"), 2.5);
});

test("un stoc zecimal ajunge respins, nu inmultit", () => {
  const catalog: CatalogEntry[] = [{
    id: "p1", name: "T", sku: "A", external_id: null, gtin: null,
    price: 10, stock_quantity: 1, track_inventory: true, variantsEnabled: false, variants: [],
  }];
  const rows = readFeedRows(
    { headers: ["sku", "stoc"], rows: [{ sku: "A", stoc: "12.5" }] },
    { identifier: "sku", stock: "stoc" },
    { updatePrice: false },
  );
  const plan = buildStockPlan(rows, catalog, { matchKey: "sku_auto", updatePrice: false });

  assert.equal(plan.changes.length, 0);
  assert.equal(plan.issues[0].problem, "invalid");
});

// ── Valori de stoc ───────────────────────────────────────────────────────────

test("citeste numere intregi si zerouri", () => {
  assert.equal(parseStockValue("12"), 12);
  assert.equal(parseStockValue("0"), 0);
  assert.equal(parseStockValue(" 7 "), 7);
});

test("scapa de unitati lipite de numar", () => {
  assert.equal(parseStockValue("12 buc"), 12);
  assert.equal(parseStockValue("12 pcs"), 12);
  assert.equal(parseStockValue("12buc"), 12);
});

test("zeroul zecimal nu deranjeaza", () => {
  assert.equal(parseStockValue("12.0"), 12);
  assert.equal(parseStockValue("12,00"), 12);
});

test("negativele isi pastreaza semnul, ca sa poata fi respinse cu mesajul corect", () => {
  assert.equal(parseStockValue("-3"), -3);
});

test("gol si text fara cifre dau null", () => {
  assert.equal(parseStockValue(""), null);
  assert.equal(parseStockValue("   "), null);
  assert.equal(parseStockValue(null), null);
  assert.equal(parseStockValue("indisponibil"), null);
});

test("miile separate nu se pierd", () => {
  assert.equal(parseStockValue("1.200"), 1200);
  assert.equal(parseStockValue("1,200"), 1200);
});

// ── Ghicirea coloanelor ──────────────────────────────────────────────────────

test("ghiceste antetele romanesti", () => {
  const m = autoMapStockColumns(["Cod produs", "Stoc", "Pret"]);
  assert.equal(m.identifier, "Cod produs");
  assert.equal(m.stock, "Stoc");
  assert.equal(m.price, "Pret");
});

test("ghiceste antetele englezesti", () => {
  const m = autoMapStockColumns(["SKU", "Quantity", "Price"]);
  assert.equal(m.identifier, "SKU");
  assert.equal(m.stock, "Quantity");
  assert.equal(m.price, "Price");
});

test("diacriticele nu incurca ghicirea", () => {
  const m = autoMapStockColumns(["Cod articol", "Cantitate disponibilă", "Preț"]);
  assert.equal(m.identifier, "Cod articol");
  assert.equal(m.stock, "Cantitate disponibilă");
  assert.equal(m.price, "Preț");
});

test("antetul mai specific castiga cand exista amandoua", () => {
  // "Cod produs" spune mai clar ce e decat "Cod", deci el e alegerea buna.
  const m = autoMapStockColumns(["Cod produs", "Cod", "Stoc"]);
  assert.equal(m.identifier, "Cod produs");
});

test("potrivirea exacta bate una partiala mai lunga", () => {
  // Fara trecerea de potrivire exacta, indiciul "cod produs" ar fi prins
  // "Cod produs extern" si ar fi ignorat coloana numita exact "Cod".
  const m = autoMapStockColumns(["Cod produs extern", "Cod", "Stoc"]);
  assert.equal(m.identifier, "Cod");
});

test("o coloana nu poate fi folosita de doua ori", () => {
  const m = autoMapStockColumns(["SKU", "Stoc"]);
  assert.equal(m.identifier, "SKU");
  assert.equal(m.stock, "Stoc");
  assert.notEqual(m.identifier, m.stock);
});

test("antetele necunoscute nu se mapeaza degeaba", () => {
  const m = autoMapStockColumns(["Coloana A", "Coloana B"]);
  assert.equal(m.identifier, undefined);
  assert.equal(m.stock, undefined);
});

test("prefera SKU peste ID cand exista amandoua", () => {
  const m = autoMapStockColumns(["id", "sku", "stoc"]);
  assert.equal(m.identifier, "sku");
});

// ── Randurile ────────────────────────────────────────────────────────────────

test("numerotarea randurilor porneste de la 1 si nu numara antetul", () => {
  const rows = readFeedRows(
    { headers: ["sku", "stoc"], rows: [{ sku: "A", stoc: "1" }, { sku: "B", stoc: "2" }] },
    { identifier: "sku", stock: "stoc" },
    { updatePrice: false },
  );
  assert.equal(rows[0].rowIndex, 1);
  assert.equal(rows[1].rowIndex, 2);
});

test("coloana de pret e ignorata cand actualizarea pretului e oprita", () => {
  const rows = readFeedRows(
    { headers: ["sku", "stoc", "pret"], rows: [{ sku: "A", stoc: "1", pret: "99" }] },
    { identifier: "sku", stock: "stoc", price: "pret" },
    { updatePrice: false },
  );
  assert.equal(rows[0].price, null);
});

test("pretul se citeste cand actualizarea e pornita", () => {
  const rows = readFeedRows(
    { headers: ["sku", "stoc", "pret"], rows: [{ sku: "A", stoc: "1", pret: "99,50" }] },
    { identifier: "sku", stock: "stoc", price: "pret" },
    { updatePrice: true },
  );
  assert.equal(rows[0].price, 99.5);
});

test("identificatorul se curata de spatii", () => {
  const rows = readFeedRows(
    { headers: ["sku", "stoc"], rows: [{ sku: "  A-1  ", stoc: "1" }] },
    { identifier: "sku", stock: "stoc" },
    { updatePrice: false },
  );
  assert.equal(rows[0].identifier, "A-1");
});

test("coloana nemapata da null, nu arunca", () => {
  const rows = readFeedRows(
    { headers: ["sku"], rows: [{ sku: "A" }] },
    { identifier: "sku" },
    { updatePrice: false },
  );
  assert.equal(rows[0].stock, null);
  assert.equal(rows[0].price, null);
});
