import { strict as assert } from "node:assert";
import { test } from "node:test";

import { acumCatTimp } from "./format";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  „ACUM 12 MINUTE": ce se poate strica fara sa se vada
  ═══════════════════════════════════════════════════════════════════════════════

  Textul asta ajunge sub fiecare comanda din panou. Greselile lui nu dau nicio
  eroare: scriu doar ceva usor gresit, pe care nimeni nu-l verifica cu ceasul.
*/

const ACUM = new Date("2026-09-20T15:00:00+03:00");
const cuCat = (ms: number) => new Date(ACUM.getTime() - ms);

const SEC = 1000;
const MIN = 60 * SEC;
const ORA = 60 * MIN;
const ZI = 24 * ORA;

test("sub un minut nu se numara secundele", () => {
  assert.equal(acumCatTimp(cuCat(5 * SEC), ACUM), "chiar acum");
  assert.equal(acumCatTimp(cuCat(59 * SEC), ACUM), "chiar acum");
});

test("⚠ o clipa din viitor nu scrie „acum -1 minute”", () => {
  /* Ceasul serverului si cel al bazei pot fi decalate cu o secunda-doua; o
     comanda scrisa „in viitor" ar fi dat un numar negativ chiar sub ochii
     comerciantului. */
  assert.equal(acumCatTimp(new Date(ACUM.getTime() + 30 * SEC), ACUM), "chiar acum");
  assert.equal(acumCatTimp(new Date(ACUM.getTime() + 5 * MIN), ACUM), "chiar acum");
});

test("minutele si orele se scriu cu „de” unde cere romana", () => {
  assert.equal(acumCatTimp(cuCat(1 * MIN), ACUM), "acum 1 minut");
  assert.equal(acumCatTimp(cuCat(12 * MIN), ACUM), "acum 12 minute");
  /* ⚠ 20 e chiar pragul: „acum 20 DE minute", nu „acum 20 minute". */
  assert.equal(acumCatTimp(cuCat(20 * MIN), ACUM), "acum 20 de minute");
  assert.equal(acumCatTimp(cuCat(59 * MIN), ACUM), "acum 59 de minute");
  assert.equal(acumCatTimp(cuCat(1 * ORA), ACUM), "acum 1 ora");
  assert.equal(acumCatTimp(cuCat(5 * ORA), ACUM), "acum 5 ore");
});

test("ziua trecuta se numeste „ieri”, nu „acum 1 zi”", () => {
  assert.equal(acumCatTimp(cuCat(25 * ORA), ACUM), "ieri");
  assert.equal(acumCatTimp(cuCat(3 * ZI), ACUM), "acum 3 zile");
});

test("⚠ dupa o saptamana se scrie data, nu un numar tot mai mare", () => {
  /* „acum 412 zile" nu spune nimanui nimic despre cand a fost comanda. */
  assert.match(acumCatTimp(cuCat(30 * ZI), ACUM), /aug/);
  assert.match(acumCatTimp(cuCat(400 * ZI), ACUM), /2025/);
});

test("o data stricata nu scrie „acum NaN minute”", () => {
  assert.equal(acumCatTimp("nu-i o data", ACUM), "");
});
