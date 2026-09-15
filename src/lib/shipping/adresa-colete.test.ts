import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { judetulColete, localitateaColete } from "./adresa-colete";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * LA COLETE ONLINE DIACRITICELE SE PASTREAZA                    (15.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pe dos fata de Cargus, DPD sau FAN, si o spun chiar ei: colectia lor Postman oficiala
 * trimite `"city": "Timișoara"`, `"county": "Timiș"`, iar modulul lor de WordPress ia orasul
 * din comanda VERBATIM, fara nicio transliterare.
 *
 * ⚠ CE FACEAM: doua reguli pentru acelasi camp, in ACELASI corp. Orasul destinatarului trecea
 * prin `normalizeLocalityName` (care le scoate), iar judetul lui si toata adresa
 * expeditorului plecau neatinse. Deci o cerere purta „Timisoara" langa „Timiș".
 *
 * ⚠ Masurat: din 468 de comenzi cu adresa, 64 au diacritice in oras si 14 in judet. Una din
 * sapte comenzi, nu un caz de colt.
 */

test("⚠⚠ diacriticele RAMAN, si in oras, si in judet", () => {
  assert.equal(localitateaColete("Timișoara", "Timiș"), "Timișoara");
  assert.equal(judetulColete("Timiș"), "Timiș");
  assert.equal(localitateaColete("Târgu Mureș", "Mureș"), "Târgu Mureș");
  assert.equal(judetulColete("Mureș"), "Mureș");
  assert.equal(localitateaColete("Brașov", "Brașov"), "Brașov");
});

test("⚠ prefixul selectorului NOSTRU se scoate, ca nu e al lor", () => {
  /* „Judetul Timis" si „Municipiul Bucuresti" sunt forme pe care le produce selectorul
     nostru de judete, nu nomenclatorul lor. */
  assert.equal(judetulColete("Județul Timiș"), "Timiș");
  assert.equal(judetulColete("Judetul Cluj"), "Cluj");
  assert.equal(localitateaColete("Municipiul Arad", "Arad"), "Arad");
});

test("⚠⚠ sectorul se pliaza in capitala, fiindca ei sunt BROKER", () => {
  /*
   * Colete Online da mai departe la Cargus, DPD si ceilalti, unde Bucurestiul e o SINGURA
   * localitate. „Sector 3" trimis ca oras n-ar fi gasit in niciun nomenclator din lantul lor.
   * Pe dos fata de Sameday, unde sectoarele CHIAR sunt orase.
   */
  for (const forma of ["Sector 3", "sectorul 5", "SECTOR 1", "Sec 2", "bucuresti sector 6"]) {
    assert.equal(localitateaColete(forma, "Bucuresti"), "București", forma);
  }
  assert.equal(localitateaColete("Bucuresti", "Bucuresti"), "București");
  assert.equal(localitateaColete("București", "Municipiul București"), "București");
  assert.equal(localitateaColete("Bucharest", "Bucuresti"), "București");
});

test("⚠ judetul capitalei iese tot in forma capitalei", () => {
  assert.equal(judetulColete("Municipiul Bucuresti"), "București");
  assert.equal(judetulColete("Bucuresti"), "București");
  assert.equal(judetulColete("București"), "București");
});

test("⚠ si judetul singur pliaza orasul, cand orasul nu spune nimic", () => {
  /* Cumparatorul scrie uneori doar cartierul. Judetul ramane singurul semnal. */
  assert.equal(localitateaColete("Militari", "Bucuresti"), "București");
  assert.equal(localitateaColete("Drumul Taberei", "Municipiul București"), "București");
});

test("un oras obisnuit nu se atinge deloc", () => {
  assert.equal(localitateaColete("Cluj-Napoca", "Cluj"), "Cluj-Napoca");
  assert.equal(localitateaColete("  Arad  ", "Arad"), "Arad");
  assert.equal(localitateaColete("Voluntari", "Ilfov"), "Voluntari");
  /* ⚠ Ilfovul NU e capitala, desi e in jurul ei. */
  assert.equal(judetulColete("Ilfov"), "Ilfov");
});

test("intrarile goale nu arunca si nu inventeaza", () => {
  assert.equal(localitateaColete("", ""), "");
  assert.equal(judetulColete(""), "");
  assert.equal(localitateaColete("", "Cluj"), "");
});

/* ═══ MUTANTUL STA PE APELANT ═══ */
test("⚠⚠ corpul comenzii foloseste ACEEASI regula pe AMANDOUA adresele", () => {
  /*
   * Asta e afirmatia care apara chiar defectul: nu ca regula exista, ci ca e aceeasi la
   * expeditor si la destinatar. Doua reguli in acelasi corp au fost problema.
   */
  const sursa = readFileSync(new URL("../colete.ts", import.meta.url), "utf8");
  const start = sursa.indexOf("function buildOrderBody");
  assert.notEqual(start, -1);
  const corp = sursa.slice(start, sursa.indexOf("\n}", start)).replace(/\/\*[\s\S]*?\*\//g, "");

  assert.equal(
    (corp.match(/city: localitateaColete\(/g) ?? []).length, 2,
    "amandoua adresele trebuie sa treaca prin aceeasi regula de localitate",
  );
  assert.equal(
    (corp.match(/county: judetulColete\(/g) ?? []).length, 2,
    "amandoua adresele trebuie sa treaca prin aceeasi regula de judet",
  );
  assert.ok(
    !corp.includes("normalizeLocalityName"),
    "`normalizeLocalityName` scoate diacriticele: a fost chiar defectul",
  );
  assert.ok(
    !corp.includes("normalizeCountyName"),
    "`normalizeCountyName` le scoate si el",
  );
});

test("⚠ si nimic de pe drumul Colete nu mai scoate diacritice", () => {
  /* Plasa larga: daca cineva readuce un `stripDiacritics` oriunde pe drumul asta, cade. */
  const sursa = readFileSync(new URL("../colete.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.ok(!sursa.includes("stripDiacritics"), "la Colete Online diacriticele se pastreaza");
});
