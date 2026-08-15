import assert from "node:assert/strict";
import { test } from "node:test";
import {
  STATUSURI, clasificaStatus, codNumeric, descriereStatus, eStareFinala, esteRetur,
  laMoment, statusComandaDinCod, statusFinalDinStari, statusUrmator, trebuieSemnalat,
  ultimaStare, type StarePacketa,
} from "./statusuri";

const stare = (cod: number | null, cand: string | null = null): StarePacketa =>
  ({ cod, nume: "", cand });

test("nomenclatorul are exact cele 17 coduri documentate, fara 8 si 13", () => {
  const coduri = Object.keys(STATUSURI).map(Number).sort((a, b) => a - b);
  assert.deepEqual(coduri, [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 17, 999]);
  assert.equal(8 in STATUSURI, false, "codul 8 nu exista in nomenclatorul lor");
  assert.equal(13 in STATUSURI, false, "codul 13 nu exista in nomenclatorul lor");
});

test("⚠ „ready for pickup” NU e livrare", () => {
  /*
   * Coletul e la punct, clientul n-a venit. Marcat livrat, o comanda cu ramburs ar
   * trece drept incasata desi banii n-au fost predati.
   */
  assert.equal(clasificaStatus(5), "in_retea");
  assert.equal(statusComandaDinCod(5), "shipped");
  assert.notEqual(statusComandaDinCod(5), "delivered");
});

test("⚠ „collected” NU e livrare — e preluarea DE LA comerciant", () => {
  // Cuvantul englezesc trage in partea gresita: e inceputul drumului.
  assert.equal(clasificaStatus(12), "in_retea");
  assert.notEqual(statusComandaDinCod(12), "delivered");
});

test("singurul cod care inseamna livrare e 7", () => {
  const livrate = Object.keys(STATUSURI).map(Number).filter((c) => statusComandaDinCod(c) === "delivered");
  assert.deepEqual(livrate, [7]);
});

test("cele trei sfarsituri sunt 7, 10 si 11", () => {
  const finale = Object.keys(STATUSURI).map(Number).filter(eStareFinala).sort((a, b) => a - b);
  assert.deepEqual(finale, [7, 10, 11]);
});

test("returul cuprinde 9, 10 si 15", () => {
  assert.deepEqual([9, 10, 15].map(esteRetur), [true, true, true]);
  assert.equal(esteRetur(7), false);
});

test("⚠ „delivery attempt” nu se semnaleaza — e purtare normala", () => {
  assert.equal(trebuieSemnalat(16), false);
  // In schimb refuzul si returul chiar cer o decizie omeneasca.
  assert.deepEqual([9, 10, 11, 15, 17].map(trebuieSemnalat), [true, true, true, true, true]);
});

test("`999 unknown` e un status DECLARAT de ei, nu o scapare a noastra", () => {
  assert.equal(clasificaStatus(999), "necunoscut");
  assert.equal(descriereStatus(999), "Stare necunoscuta la Packeta");
  assert.equal(eStareFinala(999), false, "necunoscut nu opreste urmarirea");
});

test("un cod nou, nemaivazut, nu misca nimic si nu opreste urmarirea", () => {
  // Nomenclatorul e o fotografie; ei il pot largi oricand.
  assert.equal(clasificaStatus(42), "necunoscut");
  assert.equal(statusComandaDinCod(42), null);
  assert.equal(eStareFinala(42), false);
  assert.equal(statusUrmator("processing", 42), null);
});

test("descrierea necunoscuta arata ce a spus furnizorul, apoi chiar codul", () => {
  assert.equal(descriereStatus(42, "ceva de la ei"), "ceva de la ei");
  assert.equal(descriereStatus(42), "Status 42");
  assert.equal(descriereStatus(null), "Status necunoscut");
});

test("codNumeric respinge zeroul si gunoiul, dar accepta 999", () => {
  assert.equal(codNumeric(999), 999);
  assert.equal(codNumeric("7"), 7);
  assert.equal(codNumeric(" 7 "), 7);
  // Un zero pe fir inseamna „camp gol citit ca numar" — capcana XML-ului.
  assert.equal(codNumeric(0), null);
  assert.equal(codNumeric(""), null);
  assert.equal(codNumeric("7a"), null);
  assert.equal(codNumeric(null), null);
  assert.equal(codNumeric(7.5), null);
});

test("statusul nu coboara niciodata", () => {
  assert.equal(statusUrmator("delivered", 4), null, "din livrat nu se coboara in tranzit");
  assert.equal(statusUrmator("shipped", 1), null);
  assert.equal(statusUrmator("processing", 4), "shipped");
  assert.equal(statusUrmator("shipped", 7), "delivered");
});

test("o comanda anulata sau rambursata nu se misca de la transportator", () => {
  assert.equal(statusUrmator("cancelled", 7), null);
  assert.equal(statusUrmator("refunded", 7), null);
});

test("⚠ se ia treapta cea mai INALTA din istoric, nu ultima stare", () => {
  /*
   * Lectie platita la GLS: intre doua treceri ale cronului pot intra mai multe
   * evenimente, iar ultimul poate fi administrativ. Citind doar pe el, livrarea
   * petrecuta intre timp n-ar mai fi vazuta — la ramburs, bani neinregistrati.
   */
  const istoric = [stare(4), stare(7), stare(16)];
  assert.equal(statusFinalDinStari("processing", istoric), "delivered");
});

test("un istoric fara nimic de inteles nu misca comanda", () => {
  assert.equal(statusFinalDinStari("processing", [stare(42), stare(null)]), null);
});

test("ultima stare se ia dupa data, nu dupa ordinea din raspuns", () => {
  // Ordinea din raspuns NU e documentata, deci nu se presupune.
  const s = ultimaStare([
    stare(4, "2026-08-10 10:00:00"),
    stare(7, "2026-08-12 09:00:00"),
    stare(5, "2026-08-11 08:00:00"),
  ]);
  assert.equal(s?.cod, 7);
});

test("fara date citibile, ultima stare e ultima din lista — stabil, nu la intamplare", () => {
  const s = ultimaStare([stare(4), stare(5), stare(6)]);
  assert.equal(s?.cod, 6);
  assert.equal(ultimaStare([]), null);
});

test("data fara fus se citeste ca ora Romaniei, si vara difera de iarna", () => {
  // Vara Romania e UTC+3, iarna UTC+2. O constanta ar fi gresit jumatate de an.
  assert.equal(laMoment("2026-08-12 09:00:00"), Date.parse("2026-08-12T06:00:00Z"));
  assert.equal(laMoment("2026-01-12 09:00:00"), Date.parse("2026-01-12T07:00:00Z"));
});

test("data cu fus explicit se ia asa cum e", () => {
  assert.equal(laMoment("2026-08-12T09:00:00Z"), Date.parse("2026-08-12T09:00:00Z"));
  assert.equal(laMoment("2026-08-12T09:00:00+02:00"), Date.parse("2026-08-12T07:00:00Z"));
});

test("o data necitibila da null, nu o data inventata", () => {
  // O data gresita e mai rea decat lipsa ei: ar reordona istoricul.
  assert.equal(laMoment("maine"), null);
  assert.equal(laMoment(""), null);
  assert.equal(laMoment(null), null);
});
