import test from "node:test";
import assert from "node:assert/strict";

import {
  NUMELE_SEGMENTULUI, SEGMENTE, TREPTE_VALOARE, cateFiltre, segmentValid, treaptaValoare,
} from "./filtre";

test("fiecare segment isi are numele lui, si nu se repeta", () => {
  const nume = SEGMENTE.map((s) => NUMELE_SEGMENTULUI[s]);
  assert.equal(nume.length, SEGMENTE.length);
  assert.equal(new Set(nume).size, nume.length, "doua segmente cu acelasi nume");
  for (const n of nume) assert.ok(n.length > 3);
});

test("⚠ un segment necunoscut din adresa cade pe „toti”, nu arunca", () => {
  /*
   * Adresa vine de la om: o poate scrie de mana, o poate purta dintr-o legatura
   * veche. Un segment necunoscut trebuie sa dea lista intreaga, nu o pagina goala
   * care pare ca magazinul si-a pierdut clientii.
   */
  assert.equal(segmentValid("cine-stie"), "toti");
  assert.equal(segmentValid(null), "toti");
  assert.equal(segmentValid(""), "toti");
  assert.equal(segmentValid("recurenti"), "recurenti");
});

test("treptele de valoare nu lasa goluri si nu se suprapun", () => {
  /*
   * ⚠ Un gol intre trepte inseamna clienti pe care niciun filtru nu-i gaseste; o
   * suprapunere inseamna clienti numarati de doua ori. Amandoua se observa abia
   * cand cineva aduna.
   */
  for (let i = 1; i < TREPTE_VALOARE.length; i++) {
    assert.equal(TREPTE_VALOARE[i].min, TREPTE_VALOARE[i - 1].max, `gol sau suprapunere la treapta ${i}`);
  }
  assert.equal(TREPTE_VALOARE[0].min, 0, "prima treapta trebuie sa porneasca de la zero");
  assert.equal(TREPTE_VALOARE[TREPTE_VALOARE.length - 1].max, null, "ultima treapta trebuie sa fie deschisa");
});

test("treapta necunoscuta iese `null`, nu una ghicita", () => {
  assert.equal(treaptaValoare("altceva"), null);
  assert.equal(treaptaValoare(null), null);
  assert.equal(treaptaValoare("200-500")?.max, 500);
});

test("numarul de filtre puse se socoteste ca sa poata fi sters", () => {
  assert.equal(cateFiltre({ segment: "toti", valoare: null }), 0);
  assert.equal(cateFiltre({ segment: "vip", valoare: null }), 1);
  assert.equal(cateFiltre({ segment: "vip", valoare: "200-500" }), 2);
});
