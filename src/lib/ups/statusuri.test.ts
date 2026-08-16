import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import {
  clasificaStatus, codStatus, descriereStatus, eCombinatieNecunoscuta, eLivrat,
  eStareFinala, esteRetur, statusUrmator, tipStatus, trebuieSemnalat,
} from "./statusuri";

/*
 * ⚠ CE APARA PROBELE ASTEA.
 *
 * O singura confuzie face cea mai scumpa stricaciune posibila:
 *
 *   `currentStatus.type === "D"` NU inseamna „livrat".
 *
 * Titlul enumerarii lor e „Delivery", dar propria lor explicatie il desface in trei:
 * „**loaded on delivery vehicle, out for delivery, delivered**". Citit ca livrare,
 * comanda trece pe „Livrata" si se DECLANSEAZA FACTURAREA AUTOMATA in timp ce coletul
 * e inca in masina — iar daca livrarea esueaza, factura ramane emisa.
 */

describe("UPS: `D` nu inseamna livrat", () => {
  test("⚠ tipul `D` singur clasifica DOAR „in reteaua curierului”", () => {
    assert.equal(clasificaStatus("D"), "in_retea");
    assert.equal(eLivrat("D", "OT", null, false), false);
    assert.equal(statusUrmator("processing", "D", "OT", null, false), "shipped");
  });

  test("livrarea se dovedeste cu data de tip DEL", () => {
    assert.equal(eLivrat("D", null, "20260816"), true);
    assert.equal(statusUrmator("shipped", "D", null, "20260816"), "delivered");
  });

  test("sau cu prezenta lui `deliveryInformation`", () => {
    assert.equal(eLivrat("D", null, null, true), true);
  });

  test("sau cu codul `FS`, singurul pe care UPS il scrie el insusi langa „Delivered”", () => {
    assert.equal(eLivrat("D", "FS", null, false), true);
    assert.equal(descriereStatus("D", "FS"), "Livrat");
  });

  test("⚠ `OT` („Out for Delivery”) NU e livrare, desi vine tot cu un tip de miscare", () => {
    assert.equal(eLivrat("I", "OT", null, false), false);
    assert.equal(descriereStatus("I", "OT"), "Iesit la livrare");
  });
});

describe("UPS: cele sase tipuri documentate", () => {
  test("`M` = eticheta facuta, marfa inca la comerciant", () => {
    assert.equal(clasificaStatus("M"), "la_comerciant");
    assert.equal(statusUrmator("confirmed", "M", null), "processing");
  });

  test("`I` si `U` misca comanda pe „Expediata”", () => {
    assert.equal(statusUrmator("processing", "I", null), "shipped");
    assert.equal(statusUrmator("processing", "U", null), "shipped");
  });

  test("⚠ `X` (exceptie) NU misca nimic — „it may still be delivered on time”", () => {
    assert.equal(clasificaStatus("X"), "problema");
    assert.equal(statusUrmator("shipped", "X", null), null);
    assert.equal(trebuieSemnalat("X"), true);
    /* Si NU e stare finala: coletul poate ajunge totusi. */
    assert.equal(eStareFinala("X", null), false);
  });

  test("`MV` (AWB anulat la ei) e final si se semnaleaza", () => {
    assert.equal(eStareFinala("MV", null), true);
    assert.equal(trebuieSemnalat("MV"), true);
    assert.equal(statusUrmator("shipped", "MV", null), null);
  });

  test("un tip necunoscut nu misca si nu semnaleaza nimic", () => {
    assert.equal(clasificaStatus("ZZ"), "necunoscut");
    assert.equal(statusUrmator("shipped", "ZZ", null), null);
    assert.equal(trebuieSemnalat("ZZ"), false);
  });
});

describe("UPS: returul nu se poate afla din API, si se spune pe fata", () => {
  test("⚠ nu exista niciun tip de retur in enumerarea lor", () => {
    /* Cele sase sunt D, I, M, MV, U, X. Tabelul de coduri de EXCEPTIE de pe site-ul
       lor e alt vocabular — `FS` (Delivered) nici nu apare in el. */
    assert.equal(esteRetur(), false);
  });

  test("un retur ajunge la comerciant ca exceptie, cu textul LOR alaturi", () => {
    assert.equal(trebuieSemnalat("X"), true);
    assert.equal(
      descriereStatus("X", "TU", "Address information is incomplete. The package was returned to the sender."),
      "Address information is incomplete. The package was returned to the sender.",
    );
  });
});

describe("UPS: statusul nu coboara niciodata", () => {
  test("o comanda livrata nu se intoarce la „expediata”", () => {
    assert.equal(statusUrmator("delivered", "I", null), null);
  });

  test("o comanda anulata sau rambursata nu se misca de la curier", () => {
    assert.equal(statusUrmator("cancelled", "D", null, "20260816"), null);
    assert.equal(statusUrmator("refunded", "D", null, "20260816"), null);
  });

  test("acelasi status nu se rescrie", () => {
    assert.equal(statusUrmator("shipped", "I", null), null);
  });
});

describe("UPS: normalizarea si cresterea tabelului", () => {
  test("tipul si codul se aduc la majuscule, fara alte ghiciri", () => {
    assert.equal(tipStatus(" d "), "D");
    assert.equal(codStatus("fs"), "FS");
    assert.equal(codStatus(""), null);
    assert.equal(tipStatus(123), null);
  });

  test("⚠ carligul prin care tabelul creste din traficul real", () => {
    assert.equal(eCombinatieNecunoscuta("D", "FS"), false);
    /* Un cod nou pe un tip cunoscut: se retine, ca sa se poata completa `CODURI`. */
    assert.equal(eCombinatieNecunoscuta("D", "KM"), true);
    /* Un tip nou: cu atat mai mult. */
    assert.equal(eCombinatieNecunoscuta("RS", null), true);
  });

  test("descrierea cade pe textul lor, apoi pe tip, apoi pe cod brut", () => {
    assert.equal(descriereStatus("I", "ZZ", "In transit"), "In transit");
    assert.equal(descriereStatus("I", null), "In tranzit prin reteaua UPS");
    assert.equal(descriereStatus("QQ", "ZZ"), "Status UPS QQ (ZZ)");
    assert.equal(descriereStatus(null, null), "Status necunoscut");
  });
});
