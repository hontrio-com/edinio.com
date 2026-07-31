import assert from "node:assert/strict";
import { test } from "node:test";
import { detectTabularFormat, recordsToCsv, sheetToRecords, type SheetCell } from "./tabular";
import { parseCsv } from "./csv";

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

// ── Dus si intors prin CSV ─────────────────────────────────────────────────

test("ce iese din foaie si trece prin CSV rimane la fel", () => {
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
