import test from "node:test";
import assert from "node:assert/strict";
import { esteContNou, ZILE_AJUTOR_CONFIGURARE } from "./ajutor-configurare";

const ZI = 24 * 60 * 60 * 1000;
const ACUM = Date.parse("2026-09-29T20:00:00Z");
const inUrma = (ms: number) => new Date(ACUM - ms).toISOString();

test("contul de azi si cel de acum 29 de zile sunt noi", () => {
  assert.equal(esteContNou(inUrma(0), ACUM), true);
  assert.equal(esteContNou(inUrma(29 * ZI), ACUM), true);
});

test("din ziua a 30-a cardul nu mai apare", () => {
  assert.equal(ZILE_AJUTOR_CONFIGURARE, 30);
  assert.equal(esteContNou(inUrma(30 * ZI), ACUM), false);
  assert.equal(esteContNou(inUrma(400 * ZI), ACUM), false);
});

test("data lipsa sau stricata inseamna cont vechi, nu nou", () => {
  assert.equal(esteContNou(undefined, ACUM), false);
  assert.equal(esteContNou(null, ACUM), false);
  assert.equal(esteContNou("", ACUM), false);
  assert.equal(esteContNou("nu e data", ACUM), false);
});
