import { strict as assert } from "node:assert";
import { test } from "node:test";

import { zileRamase } from "./abonament-timp";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CATE ZILE MAI ARE ABONAMENTUL
  ═══════════════════════════════════════════════════════════════════════════════

  Numarul asta hotaraste ce vede comerciantul in capul panoului: o informare, o
  atentionare sau o urgenta. Greselile lui nu dau nicio eroare, doar il sperie
  sau il linistesc degeaba.
*/

const ACUM = new Date("2026-09-20T15:00:00+03:00").getTime();
const peste = (ms: number) => new Date(ACUM + ms).toISOString();
const ORA = 3600000;
const ZI = 24 * ORA;

test("⚠ ultima zi se rotunjeste IN SUS, nu se pierde", () => {
  /* Cu doua ore ramase, omul mai are o zi de folosit. Rotunjit in jos, banda i-ar
     fi spus „0 zile ramase" inca dintr-o dimineata in care totul mergea. */
  assert.equal(zileRamase(peste(2 * ORA), ACUM), 1);
  assert.equal(zileRamase(peste(ZI + ORA), ACUM), 2);
});

test("o data trecuta da zero sau negativ, adica expirat", () => {
  assert.ok(zileRamase(peste(-ORA), ACUM) <= 0);
  assert.ok(zileRamase(peste(-5 * ZI), ACUM) <= 0);
});

test("pragurile pe care se schimba tonul benzii", () => {
  /* Peste 15 zile banda nu se arata deloc, sub 3 devine atentionare. */
  assert.equal(zileRamase(peste(16 * ZI), ACUM), 16);
  assert.equal(zileRamase(peste(3 * ZI), ACUM), 3);
});

test("fara data, sau cu una stricata, nu iese NaN", () => {
  /* ⚠ `NaN` ar fi ajuns pe ecran scris ca „NaN zile ramase". */
  assert.equal(zileRamase(null, ACUM), 0);
  assert.equal(zileRamase(undefined, ACUM), 0);
  assert.equal(zileRamase("nu-i o data", ACUM), 0);
});
