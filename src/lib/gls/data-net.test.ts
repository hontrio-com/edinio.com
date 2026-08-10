import { strict as assert } from "node:assert";
import { test } from "node:test";
import { dataDinNet } from "./data-net";

/*
 * Formatul .NET al MyGLS e genul de lucru care nu crapa: `new Date()` intoarce
 * „Invalid Date", panoul afiseaza gol, si nimeni nu leaga golul de format.
 */

test("citeste formatul .NET cu decalaj", () => {
  assert.equal(dataDinNet("/Date(1712345678000+0200)/"), "2024-04-05T19:34:38.000Z");
});

test("citeste formatul .NET fara decalaj", () => {
  assert.equal(dataDinNet("/Date(1712345678000)/"), "2024-04-05T19:34:38.000Z");
});

test("⚠ decalajul NU se aplica inca o data", () => {
  /*
   * Numarul dinaintea parantezei e deja in milisecunde UTC; `+0200` spune doar
   * in ce fus a fost afisata data la ei. Adunat peste, ora ar iesi mutata cu
   * doua ore — o livrare de la 19:34 ar aparea la 21:34.
   */
  const cuDecalaj = dataDinNet("/Date(1712345678000+0200)/");
  const faraDecalaj = dataDinNet("/Date(1712345678000)/");
  assert.equal(cuDecalaj, faraDecalaj);

  const negativ = dataDinNet("/Date(1712345678000-0500)/");
  assert.equal(negativ, faraDecalaj);
});

test("date dinainte de epoca nu se pierd", () => {
  assert.equal(dataDinNet("/Date(-86400000)/"), "1969-12-31T00:00:00.000Z");
});

test("lipsa inseamna null, nu „Invalid Date”", () => {
  /* Un camp gol se citeste ca lipsa de date; „Invalid Date" arata ca un defect
     al nostru si trimite pe drum gresit. */
  assert.equal(dataDinNet(undefined), null);
  assert.equal(dataDinNet(null), null);
  assert.equal(dataDinNet(""), null);
});

test("un text care nu e data da null, nu arunca", () => {
  /* Daca GLS schimba formatul, panoul trebuie sa ramana in picioare. */
  assert.equal(dataDinNet("maine"), null);
  assert.equal(dataDinNet("/Date()/"), null);
  assert.equal(dataDinNet("/Date(abc)/"), null);
});

test("daca GLS trece vreodata pe ISO, tot se intelege", () => {
  assert.equal(dataDinNet("2026-08-27T10:15:00.000Z"), "2026-08-27T10:15:00.000Z");
  assert.equal(dataDinNet("2026-08-27T12:15:00+02:00"), "2026-08-27T10:15:00.000Z");
});
