import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import {
  clasificaStatus, codStatus, descriereStatus, eLivrat, esteRetur, eStareFinala,
  statusComandaDinCod, statusUrmator, trebuieSemnalat,
} from "./statusuri";

/*
 * ⚠ CE APARA PROBELE ASTEA.
 *
 * `derivedCode` e SET DESCHIS — FedEx nu publica enumerarea, doar exemple, iar unul
 * dintre exemplele lor (`HL`) nici nu apare in tabelul lor de `eventType`. Deci:
 *
 *  - un cod nou nu are voie sa arunce, sa mute comanda sau sa scoata coletul din
 *    urmarire;
 *  - „gata de ridicare" NU e livrare (aceeasi capcana ca `loaded_locker` la Shipo);
 *  - livrarea trebuie sa se poata citi si din `dateAndTimes`, fiindca acolo enumerarea
 *    CHIAR e inchisa.
 */

describe("FedEx: codurile pe care le stim", () => {
  test("livrarea", () => {
    assert.equal(clasificaStatus("DL"), "livrat");
    assert.equal(eStareFinala("DL"), true);
    assert.equal(statusComandaDinCod("DL"), "delivered");
  });

  test("⚠ AWB emis NU inseamna expediat — marfa e inca la comerciant", () => {
    assert.equal(clasificaStatus("OC"), "la_comerciant");
    assert.equal(statusComandaDinCod("OC"), "processing");
  });

  test("drumul prin retea muta comanda pe „Expediata”", () => {
    for (const cod of ["PU", "IP", "IT", "AR", "DP", "OD", "CC", "DO"]) {
      assert.equal(clasificaStatus(cod), "in_retea", `${cod} ar trebui sa fie in retea`);
      assert.equal(statusComandaDinCod(cod), "shipped", `${cod} ar trebui sa duca la shipped`);
    }
  });

  test("⚠ „gata de ridicare” NU e livrare", () => {
    // Coletul e la capatul drumului, dar clientul inca nu l-a atins, si daca nu-l
    // ridica se intoarce. Marcata livrata aici, comanda ar declansa factura.
    assert.equal(clasificaStatus("HP"), "in_retea");
    assert.equal(clasificaStatus("HL"), "in_retea");
    assert.notEqual(statusComandaDinCod("HP"), "delivered");
  });

  test("exceptiile se semnaleaza, dar NU misca comanda", () => {
    for (const cod of ["DE", "DD", "SE", "CD", "PD"]) {
      assert.equal(clasificaStatus(cod), "problema", cod);
      assert.equal(trebuieSemnalat(cod), true, cod);
      assert.equal(statusComandaDinCod(cod), null, cod);
    }
  });

  test("anularea vazuta de cron e finala si se semnaleaza", () => {
    assert.equal(eStareFinala("CA"), true);
    assert.equal(trebuieSemnalat("CA"), true);
  });

  test("⚠ returul NU e final: descrie miscarea inapoi, nu incheierea ei", () => {
    // FedEx n-are cod de „retur incheiat"; inchiderea se vede ca `DL` pe AWB-ul de
    // retur, care e alt numar. Marcat final, coletul ar iesi din urmarire pe drum.
    assert.equal(esteRetur("RS"), true);
    assert.equal(eStareFinala("RS"), false);
    assert.equal(trebuieSemnalat("RS"), true);
  });

  test("actualizarile de data nu sunt probleme", () => {
    for (const cod of ["US", "AE", "AO", "DY"]) {
      assert.equal(clasificaStatus(cod), "in_retea", cod);
      assert.equal(trebuieSemnalat(cod), false, cod);
    }
  });

  test("cele patru coduri care exista doar in cazurile lor de test sunt tratate", () => {
    for (const cod of ["AD", "AP", "ED", "FD"]) {
      assert.equal(clasificaStatus(cod), "in_retea", cod);
    }
  });
});

describe("FedEx: setul e DESCHIS", () => {
  test("⚠ un cod necunoscut nu misca nimic si nu se semnaleaza", () => {
    assert.equal(clasificaStatus("ZZ"), "necunoscut");
    assert.equal(statusComandaDinCod("ZZ"), null);
    assert.equal(trebuieSemnalat("ZZ"), false);
    assert.equal(eStareFinala("ZZ"), false);
  });

  test("un cod necunoscut nu ingheata coletul: nu e final, deci cronul il reia", () => {
    assert.equal(eStareFinala("QQ"), false);
  });

  test("codul necunoscut isi pastreaza descrierea de la ei, cand exista", () => {
    assert.equal(descriereStatus("ZZ", "Something New Happened"), "Something New Happened");
    assert.equal(descriereStatus("ZZ"), "Status ZZ");
    assert.equal(descriereStatus(null), "Status necunoscut");
  });

  test("descrierea NOASTRA bate textul lor pe codurile cunoscute", () => {
    // `statusByLocale` e text tradus dupa `x-locale`; nu se compara si nu se prefera.
    assert.equal(descriereStatus("DL", "Delivered"), "Livrat");
  });

  test("codurile se normalizeaza la MAJUSCULE, dar nu se ghicesc", () => {
    assert.equal(codStatus("dl"), "DL");
    assert.equal(clasificaStatus("dl"), "livrat");
    assert.equal(codStatus("  it  "), "IT");
    assert.equal(codStatus(""), null);
    assert.equal(codStatus(42), null);
    assert.equal(codStatus("X".repeat(40)), null);
  });
});

describe("FedEx: livrarea, citita din doua locuri", () => {
  test("⚠ `ACTUAL_DELIVERY` livreaza comanda chiar daca nu recunoastem codul", () => {
    // `derivedCode` e set deschis; `dateAndTimes[].type` are enum INCHIS.
    assert.equal(eLivrat("ZZ", "2026-08-16T11:20:00"), true);
    assert.equal(statusComandaDinCod("ZZ", "2026-08-16T11:20:00"), "delivered");
  });

  test("fara niciunul dintre semnale, nu e livrata", () => {
    assert.equal(eLivrat("IT", null), false);
    assert.equal(eLivrat("IT", ""), false);
  });
});

describe("FedEx: statusul urmator", () => {
  test("nu coboara niciodata — evenimentele pot sosi in alta ordine", () => {
    assert.equal(statusUrmator("delivered", "IT"), null);
    assert.equal(statusUrmator("shipped", "OC"), null);
  });

  test("urca cand chiar e o inaintare", () => {
    assert.equal(statusUrmator("confirmed", "IT"), "shipped");
    assert.equal(statusUrmator("shipped", "DL"), "delivered");
    assert.equal(statusUrmator("pending", "OC"), "processing");
  });

  test("⚠ o comanda anulata sau rambursata nu se misca de la un transportator", () => {
    assert.equal(statusUrmator("cancelled", "DL"), null);
    assert.equal(statusUrmator("refunded", "DL"), null);
  });

  test("acelasi status nu se rescrie degeaba", () => {
    assert.equal(statusUrmator("shipped", "IT"), null);
  });

  test("un status al comenzii pe care nu-l stim nu blocheaza inaintarea", () => {
    assert.equal(statusUrmator("ceva_nou", "DL"), "delivered");
  });
});
