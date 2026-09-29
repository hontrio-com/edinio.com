import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import type { EvenimentCuriera } from "./client";
import {
  cheieStare,
  clasificaStatus,
  descriereEveniment,
  descriereStare,
  eStareFinala,
  esteRetur,
  evenimenteDeSemnalat,
  normalizeazaStatus,
  statusDinCheie,
  statusUrmator,
  trebuieSemnalat,
} from "./statusuri";

describe("starile vin in doua limbi", () => {
  test("romana si engleza ajung la aceeasi forma", () => {
    assert.equal(normalizeazaStatus("neridicat"), "neridicat");
    assert.equal(normalizeazaStatus("uncollected"), "neridicat");
    assert.equal(normalizeazaStatus("in_transit"), "in_curs");
    assert.equal(normalizeazaStatus("active"), "in_curs");
    assert.equal(normalizeazaStatus("notified"), "avizat");
    assert.equal(normalizeazaStatus("canceled"), "anulat");
    assert.equal(normalizeazaStatus("cancelled"), "anulat");
    assert.equal(normalizeazaStatus(" LIVRAT "), "livrat");
    assert.equal(normalizeazaStatus("draft"), "initial");
  });

  test("ce nu stim ramane necunoscut, nu se ghiceste", () => {
    assert.equal(normalizeazaStatus("in_depozit"), null);
    assert.equal(normalizeazaStatus(""), null);
    assert.equal(normalizeazaStatus(null), null);
    assert.equal(clasificaStatus("in_depozit"), "necunoscut");
  });
});

describe("harta", () => {
  test("⚠ „neridicat” lasa comanda in procesare, NU o expediaza", () => {
    assert.equal(statusUrmator("confirmed", "neridicat"), "processing");
    assert.equal(statusUrmator("processing", "neridicat"), null);
  });

  test("in_curs expediaza, livrat livreaza", () => {
    assert.equal(statusUrmator("processing", "in_curs"), "shipped");
    assert.equal(statusUrmator("shipped", "livrat"), "delivered");
  });

  test("nu se coboara si nu se misca o comanda anulata", () => {
    assert.equal(statusUrmator("delivered", "in_curs"), null);
    assert.equal(statusUrmator("cancelled", "livrat"), null);
    assert.equal(statusUrmator("refunded", "livrat"), null);
  });

  test("⚠ avizat si exceptie NU sunt finale (urmeaza alta incercare, sau se rezolva)", () => {
    assert.equal(eStareFinala("avizat"), false);
    assert.equal(eStareFinala("exceptie"), false);
    assert.ok(trebuieSemnalat("avizat"));
    assert.ok(trebuieSemnalat("exceptie"));
  });

  test("returnat si anulat sunt finale si se semnaleaza, fara sa miste comanda", () => {
    for (const s of ["returnat", "anulat"]) {
      assert.ok(eStareFinala(s));
      assert.ok(trebuieSemnalat(s));
      assert.equal(statusUrmator("shipped", s), null);
    }
    assert.ok(esteRetur("returnat|RETURNAT"));
  });

  test("⚠ codul nu e starea: „LIVP” sub in_curs nu livreaza nimic", () => {
    assert.equal(statusUrmator("shipped", cheieStare("in_curs", "LIVP")), null);
    assert.equal(eStareFinala(cheieStare("in_curs", "LIVP")), false);
  });

  test("starea necunoscuta nu misca si nu scoate din urmarire", () => {
    assert.equal(statusUrmator("processing", "ceva_nou"), null);
    assert.equal(eStareFinala("ceva_nou"), false);
    assert.equal(trebuieSemnalat("ceva_nou"), false);
  });
});

describe("cheia salvata", () => {
  test("stare|cod, in forma romaneasca", () => {
    assert.equal(cheieStare("notified", "A2"), "avizat|A2");
    assert.equal(cheieStare("livrat", ""), "livrat");
    assert.equal(cheieStare("in_depozit", "X"), "in_depozit|X");
    assert.equal(statusDinCheie("avizat|A2"), "avizat");
    assert.equal(statusDinCheie(null), null);
  });

  test("descrierea pune motivul lor langa stare", () => {
    assert.equal(descriereStare("avizat", "A2", "Nu raspunde la telefon"), "Livrare nereusita, urmeaza o noua incercare (Nu raspunde la telefon)");
    assert.equal(descriereStare("livrat"), "Livrat");
    assert.equal(descriereStare("ceva_nou"), "Stare Curiera „ceva_nou”");
  });
});

describe("evenimentele din istoric", () => {
  const ev = (tip: string, data: number, status = "", cod = "", descriere = ""): EvenimentCuriera =>
    ({ tip, status, cod, descriere, locatie: "", data });

  /*
   * ⚠ Lotul da doar starea CURENTA. Un „avizat" urmat de „in_curs" intre doua treceri s-ar
   * pierde; istoricul il aduce inapoi.
   */
  const ISTORIC = [
    ev("ShipmentCreated", 1),
    ev("StatusChanged:neridicat", 2, "neridicat"),
    ev("StatusChanged:in_curs", 3, "in_curs"),
    ev("StatusChanged:avizat", 4, "avizat", "", "Destinatarul nu a raspuns"),
    ev("CodeChanged:A2", 5, "avizat", "A2", "Nu raspunde la telefon"),
    ev("StatusChanged:in_curs", 6, "in_curs"),
  ];

  test("avizatul pierdut sub un in_curs se gaseste si se semnaleaza", () => {
    const r = evenimenteDeSemnalat(ISTORIC, null);
    assert.deepEqual(r.noi.map((e) => e.tip), ["StatusChanged:avizat", "CodeChanged:A2"]);
    assert.equal(r.memorie.length, 2);
  });

  test("o data semnalat, nu se mai semnaleaza", () => {
    const prima = evenimenteDeSemnalat(ISTORIC, null);
    const a_doua = evenimenteDeSemnalat(ISTORIC, prima.memorie);
    assert.deepEqual(a_doua.noi, []);
    assert.deepEqual(a_doua.memorie.sort(), prima.memorie.sort());
  });

  test("acelasi fel de eveniment la alta clipa e eveniment nou", () => {
    const prima = evenimenteDeSemnalat(ISTORIC, null);
    const r = evenimenteDeSemnalat([...ISTORIC, ev("StatusChanged:avizat", 9, "avizat")], prima.memorie);
    assert.equal(r.noi.length, 1);
  });

  test("⚠ un CodeChanged fara stare o mosteneste pe a ultimului StatusChanged", () => {
    /* Pe fir, evenimentele care nu schimba starea au venit cu `status: ""`. */
    const istoric = [
      ev("StatusChanged:in_curs", 1, "in_curs"),
      ev("CodeChanged:Colectat", 2, "", "Colectat"),
      ev("StatusChanged:avizat", 3, "avizat"),
      ev("CodeChanged:A3", 4, "", "A3", "Livrarea in alta zi"),
    ];
    const r = evenimenteDeSemnalat(istoric, null);
    assert.deepEqual(r.noi.map((e) => e.tip), ["StatusChanged:avizat", "CodeChanged:A3"],
      "motivul sub avizat se spune; codul de sub in_curs nu");
  });

  test("starile in engleza se citesc la fel", () => {
    const r = evenimenteDeSemnalat([ev("StatusChanged:returned", 7, "returned")], []);
    assert.equal(r.noi.length, 1);
  });

  test("memoria de forma straina se ia drept goala", () => {
    assert.equal(evenimenteDeSemnalat(ISTORIC, { x: 1 }).noi.length, 2);
  });

  test("descrierea evenimentului poarta codul", () => {
    assert.equal(descriereEveniment(ev("CodeChanged:A2", 5, "avizat", "A2", "Nu raspunde la telefon")), "Nu raspunde la telefon (A2)");
    assert.equal(descriereEveniment(ev("StatusChanged:anulat", 5, "anulat", "", "")), "AWB anulat");
  });
});
