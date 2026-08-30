import assert from "node:assert/strict";
import { test } from "node:test";
import { detectTabularFormat, recordsToCsv, sheetToRecords, type SheetCell } from "./tabular";
import { MAX_STOCK_ROWS, parseCsv } from "./csv";

/**
 * Citirea fisierelor tabelare.
 *
 * Testele lucreaza pe randurile brute, exact forma pe care o intoarce
 * `read-excel-file`, deci acopera toata logica noastra fara sa fie nevoie de un
 * fisier .xlsx adevarat in repo.
 */

// ── Recunoasterea formatului, din continut ──────────────────────────────────

test("XLSX se recunoaste dupa semnatura de ZIP, nu dupa extensie", () => {
  const xlsx = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
  assert.equal(detectTabularFormat(xlsx), "xlsx");
});

test("XLS vechi se recunoaste separat, ca sa putem da un sfat util", () => {
  const xls = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1]);
  assert.equal(detectTabularFormat(xls), "xls_vechi");
});

test("textul obisnuit e tratat ca CSV", () => {
  assert.equal(detectTabularFormat(Buffer.from("sku;stoc\nA;1")), "csv");
});

test("fisierul foarte scurt nu arunca", () => {
  assert.equal(detectTabularFormat(Buffer.from([0x50])), "csv");
  assert.equal(detectTabularFormat(Buffer.alloc(0)), "csv");
});

// ── Foaie -> randuri ────────────────────────────────────────────────────────

test("primul rand devine antet, restul devin randuri", () => {
  const p = sheetToRecords([["sku", "stoc"], ["A-1", 5], ["B-2", 7]]);
  assert.deepEqual(p.headers, ["sku", "stoc"]);
  assert.equal(p.rows.length, 2);
  assert.deepEqual(p.rows[0], { sku: "A-1", stoc: "5" });
});

test("randurile goale de deasupra antetului se sar", () => {
  const p = sheetToRecords([[], [null, null], ["sku", "stoc"], ["A", 1]]);
  assert.deepEqual(p.headers, ["sku", "stoc"]);
  assert.equal(p.rows.length, 1);
});

test("randurile complet goale dintre date se sar", () => {
  const p = sheetToRecords([["sku", "stoc"], ["A", 1], [null, null], ["", ""], ["B", 2]]);
  assert.equal(p.rows.length, 2);
  assert.equal(p.rows[1].sku, "B");
});

test("numerele intregi nu capata zecimale", () => {
  // Un cod EAN citit ca numar ar strica potrivirea daca ar ieși "5941234567890.0".
  const p = sheetToRecords([["ean"], [5941234567890]]);
  assert.equal(p.rows[0].ean, "5941234567890");
});

test("zecimalele se pastreaza, ca potrivitorul sa le poata refuza", () => {
  const p = sheetToRecords([["stoc"], [12.5]]);
  assert.equal(p.rows[0].stoc, "12.5");
});

test("valorile logice si datele devin text previzibil", () => {
  const p = sheetToRecords([["activ", "data"], [true, new Date("2026-07-31T10:00:00Z")]]);
  assert.equal(p.rows[0].activ, "true");
  assert.equal(p.rows[0].data, "2026-07-31");
});

test("celulele lipsa devin sir gol, nu undefined", () => {
  const p = sheetToRecords([["sku", "stoc"], ["A"]]);
  assert.equal(p.rows[0].stoc, "");
});

test("antetele se curata de spatii", () => {
  const p = sheetToRecords([["  sku  ", " stoc "], ["A", 1]]);
  assert.deepEqual(p.headers, ["sku", "stoc"]);
});

test("coloanele fara antet sunt ignorate", () => {
  const p = sheetToRecords([["sku", "", "stoc"], ["A", "gunoi", 5]]);
  assert.deepEqual(p.headers, ["sku", "stoc"]);
  assert.deepEqual(p.rows[0], { sku: "A", stoc: "5" });
});

test("antetul repetat pastreaza prima coloana", () => {
  const p = sheetToRecords([["stoc", "stoc"], [1, 2]]);
  assert.deepEqual(p.headers, ["stoc"]);
  assert.equal(p.rows[0].stoc, "1");
});

test("foaia goala da antet gol, nu arunca", () => {
  assert.deepEqual(sheetToRecords([]), { headers: [], rows: [] });
  assert.deepEqual(sheetToRecords([[], [null]]), { headers: [], rows: [] });
});

test("numarul de randuri e plafonat", () => {
  const rows: SheetCell[][] = [["sku"]];
  for (let i = 0; i < 5200; i++) rows.push([`SKU-${i}`]);
  assert.equal(sheetToRecords(rows).rows.length, 5000);
});

// ── Plafonul, si faptul ca taierea se SPUNE ────────────────────────────────
//
// Plafonul implicit e pentru importul de produse. Feedul de stoc are un rand
// per varianta, deci cere unul mult mai mare: un magazin real cu 1221 de
// produse are 12.048 de variante, si plafonul de 5000 taia doua treimi.

test("taierea la plafon e raportata, nu tacuta", () => {
  const rows: SheetCell[][] = [["sku"]];
  for (let i = 0; i < 12; i++) rows.push([`SKU-${i}`]);

  const taiat = sheetToRecords(rows, 10);
  assert.equal(taiat.rows.length, 10);
  assert.equal(taiat.truncated, true, "trebuie sa spuna ca a taiat");

  const intreg = sheetToRecords(rows, 100);
  assert.equal(intreg.rows.length, 12);
  assert.equal(intreg.truncated, false);
});

test("randurile goale de dupa plafon nu trec drept taiere", () => {
  // Multe exporturi au zeci de randuri goale la coada. Daca acelea ar marca
  // fisierul ca taiat, feedul ar fi respins degeaba.
  const rows: SheetCell[][] = [["sku"], ["A"], ["B"], [null, null], ["", ""], []];
  const p = sheetToRecords(rows, 2);
  assert.equal(p.rows.length, 2);
  assert.equal(p.truncated, false);
});

test("un feed cat cel real de la un magazin cu variante incape", () => {
  // 12.178 de randuri, exact marimea feedului care a scos plafonul la iveala.
  const linii = ["Cod;stoc"];
  for (let i = 0; i < 12178; i++) linii.push(`H${i}-M;${i % 40}`);

  const implicit = parseCsv(linii.join("\n"));
  assert.equal(implicit.rows.length, 5000, "plafonul de produse taie");
  assert.equal(implicit.truncated, true);

  const caFeedDeStoc = parseCsv(linii.join("\n"), MAX_STOCK_ROWS);
  assert.equal(caFeedDeStoc.rows.length, 12178, "feedul de stoc trebuie sa il ia intreg");
  assert.equal(caFeedDeStoc.truncated, false);
  assert.equal(caFeedDeStoc.rows[12177].Cod, "H12177-M");
});

// ── Dus si intors prin CSV ─────────────────────────────────────────────────

test("ce iese din foaie si trece prin CSV ramane la fel", () => {
  // Asta e drumul adevarat: XLSX -> randuri -> CSV pastrat in R2 -> recitit.
  const original = sheetToRecords([
    ["cod produs", "stoc", "pret"],
    ["A-1", 5, 19.99],
    ["B;2", 0, 100],
  ]);
  const dupaDrum = parseCsv(recordsToCsv(original));

  assert.deepEqual(dupaDrum.headers, original.headers);
  assert.deepEqual(dupaDrum.rows, original.rows);
});

test("valorile cu punct si virgula sau ghilimele supravietuiesc drumului", () => {
  const original = sheetToRecords([
    ["nume", "stoc"],
    ['Tricou "mare"; roșu', 3],
  ]);
  const dupaDrum = parseCsv(recordsToCsv(original));
  assert.equal(dupaDrum.rows[0].nume, 'Tricou "mare"; roșu');
});
