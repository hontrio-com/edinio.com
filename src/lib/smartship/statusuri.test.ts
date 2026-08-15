import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  clasificaStatus, codNumeric, descriereStatus, eStareFinala, esteRetur,
  statusComandaDinCod, statusUrmator, trebuieSemnalat,
} from "./statusuri";

describe("SmartShip: zero e un status, nu o lipsa", () => {
  /*
   * ⚠ La toti ceilalti curieri codurile incep de la 1, iar ajutoarele lor de
   * citire resping zeroul (`n > 0`). Copiat mecanic aici, TOATE coletele proaspat
   * emise ar fi aratat „status necunoscut" si cronul le-ar fi reinterogat la
   * nesfarsit fara sa retina nimic.
   */
  test("codNumeric accepta 0", () => {
    assert.equal(codNumeric(0), 0);
    assert.equal(codNumeric("0"), 0);
  });

  test("statusul 0 e recunoscut, nu necunoscut", () => {
    assert.equal(clasificaStatus(0), "la_comerciant");
    assert.equal(descriereStatus(0), "AWB emis, coletul n-a fost ridicat");
  });

  test("negativul si textul raman respinse", () => {
    assert.equal(codNumeric(-1), null);
    assert.equal(codNumeric("abc"), null);
    assert.equal(codNumeric(1.5), null);
    assert.equal(codNumeric(null), null);
    assert.equal(codNumeric(undefined), null);
  });
});

describe("SmartShip: harta statusurilor", () => {
  /*
   * ⚠ „Emis (neridicat)" NU e „expediat": marfa e inca la comerciant. Marcata
   * expediata, comanda ar minti clientul.
   */
  test("0 lasa comanda in procesare, nu o expediaza", () => {
    assert.equal(statusComandaDinCod(0), "processing");
  });

  test("1 expediaza, 2 livreaza", () => {
    assert.equal(statusComandaDinCod(1), "shipped");
    assert.equal(statusComandaDinCod(2), "delivered");
  });

  test("refuzul si returul NU misca comanda — decizia e a comerciantului", () => {
    assert.equal(statusComandaDinCod(5), null);
    assert.equal(statusComandaDinCod(6), null);
    assert.equal(statusComandaDinCod(10), null);
  });

  /*
   * ⚠ Refuzul NU e final: coletul se intoarce si abia atunci ajunge la 6. Scos
   * din urmarire aici, nu s-ar mai afla niciodata ca marfa s-a intors — iar la
   * ramburs asta inseamna si ca banii nu vin.
   */
  test("refuzul (5) ramane in urmarire, returul (6) o incheie", () => {
    assert.equal(eStareFinala(5), false);
    assert.equal(eStareFinala(6), true);
    assert.equal(eStareFinala(2), true);
    assert.equal(eStareFinala(10), true);
    assert.equal(eStareFinala(0), false);
    assert.equal(eStareFinala(1), false);
  });

  test("refuzul, returul si anularea se semnaleaza; drumul normal nu", () => {
    assert.equal(trebuieSemnalat(5), true);
    assert.equal(trebuieSemnalat(6), true);
    assert.equal(trebuieSemnalat(10), true);
    assert.equal(trebuieSemnalat(0), false);
    assert.equal(trebuieSemnalat(1), false);
    assert.equal(trebuieSemnalat(2), false);
  });

  test("returul cuprinde si refuzul de primire", () => {
    assert.equal(esteRetur(5), true);
    assert.equal(esteRetur(6), true);
    assert.equal(esteRetur(2), false);
  });
});

describe("SmartShip: implicitul e tacerea", () => {
  /*
   * ⚠ Documentatia spune „statusurile PRINCIPALE", deci lista poate creste. Un
   * cod nou aparut la ei nu are voie sa miste nicio comanda.
   */
  test("un cod necunoscut nu misca si nu semnaleaza", () => {
    assert.equal(clasificaStatus(77), "necunoscut");
    assert.equal(statusComandaDinCod(77), null);
    assert.equal(trebuieSemnalat(77), false);
    assert.equal(eStareFinala(77), false);
  });

  test("descrierea cade pe textul lor, apoi pe cod", () => {
    assert.equal(descriereStatus(77, "Ceva nou"), "Ceva nou");
    assert.equal(descriereStatus(77), "Status 77");
    assert.equal(descriereStatus(null), "Status necunoscut");
    /* Codul cunoscut are intaietate fata de textul lor: al nostru e mai limpede. */
    assert.equal(descriereStatus(2, "Delivered"), "Livrat");
  });
});

describe("SmartShip: comanda nu coboara si nu se misca dupa anulare", () => {
  test("nu coboara de pe o treapta mai inalta", () => {
    assert.equal(statusUrmator("delivered", 1), null);
    assert.equal(statusUrmator("shipped", 0), null);
  });

  test("urca acolo unde e cazul", () => {
    assert.equal(statusUrmator("confirmed", 1), "shipped");
    assert.equal(statusUrmator("pending", 2), "delivered");
    assert.equal(statusUrmator("confirmed", 0), "processing");
  });

  test("o comanda anulata sau rambursata nu se misca de la curier", () => {
    assert.equal(statusUrmator("cancelled", 2), null);
    assert.equal(statusUrmator("refunded", 2), null);
  });

  test("acelasi status nu produce o schimbare", () => {
    assert.equal(statusUrmator("shipped", 1), null);
    assert.equal(statusUrmator("delivered", 2), null);
  });
});
