import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  alegeJudetul, alegeLocalitatea, cheieNume, esteInBucuresti, localitateSmartship,
  potrivesteJudetul, sectorSmartship,
} from "./localitati";

const JUDETE = [
  { id: 1, county: "Alba" },
  { id: 2, county: "Arad" },
  { id: 13, county: "Cluj" },
  { id: 26, county: "Mures" },
  { id: 25, county: "Maramures" },
  { id: 40, county: "Bucuresti" },
];

const CLUJ = [
  { id: 256212, city: "Cluj-Napoca" },
  { id: 256213, city: "Apahida" },
  { id: 256214, city: "Turda" },
];

describe("SmartShip: cheia de potrivire", () => {
  test("cele DOUA codificari ale diacriticelor ajung la aceeasi cheie", () => {
    /* „ș" U+0219 (corect) si „ş" U+015F (sedila, din Latin-2). */
    assert.equal(cheieNume("Timișoara"), cheieNume("Timişoara"));
    assert.equal(cheieNume("Iași"), "iasi");
    assert.equal(cheieNume("Târgu Mureș"), "targumures");
  });

  test("cratima si spatiul nu despart", () => {
    assert.equal(cheieNume("Cluj-Napoca"), cheieNume("Cluj Napoca"));
  });

  test("diacriticul se scoate, litera ramane", () => {
    /* O clasa prea lata ar manca „ș" cu totul, si „Iasi" n-ar mai gasi „Iași". */
    assert.equal(cheieNume("ș"), "s");
    assert.equal(cheieNume("ă"), "a");
  });
});

describe("SmartShip: judetul", () => {
  /*
   * ⚠ SINGURA pereche din tara in care un judet e subsir in altul. O incluziune
   * oarba trimitea „Dumbrava, Maramures" drept „Dumbrava, Mures", la 300 km.
   */
  test("Mures NU se potriveste cu Maramures", () => {
    assert.equal(potrivesteJudetul("mures", "maramures"), false);
    assert.equal(potrivesteJudetul("maramures", "mures"), false);
    assert.equal(alegeJudetul(JUDETE, "Maramures")?.id, 25);
    assert.equal(alegeJudetul(JUDETE, "Mures")?.id, 26);
  });

  test("Municipiul Bucuresti gaseste judetul Bucuresti", () => {
    assert.equal(alegeJudetul(JUDETE, "Municipiul Bucuresti")?.id, 40);
    assert.equal(alegeJudetul(JUDETE, "București")?.id, 40);
  });

  test("un judet necunoscut da null, nu prima linie", () => {
    assert.equal(alegeJudetul(JUDETE, "Ilfov"), null);
    assert.equal(alegeJudetul(JUDETE, ""), null);
    assert.equal(alegeJudetul(JUDETE, null), null);
  });
});

describe("SmartShip: localitatea", () => {
  test("potrivire exacta, cu si fara diacritice", () => {
    assert.equal(alegeLocalitatea(CLUJ, "Cluj-Napoca", "Cluj")?.id, 256212);
    assert.equal(alegeLocalitatea(CLUJ, "cluj napoca", "Cluj")?.id, 256212);
  });

  /*
   * ⚠ O potrivire „pe fragment" ar face ca „Cluj" sa aleaga „Cluj-Napoca", iar
   * „Ocna" primul din zece sate cu numele asta. Curierul livreaza dupa id.
   */
  test("un fragment NU alege o localitate", () => {
    assert.equal(alegeLocalitatea(CLUJ, "Cluj", "Cluj"), null);
    assert.equal(alegeLocalitatea(CLUJ, "Turd", "Cluj"), null);
  });

  test("o localitate necunoscuta da null — apelantul cade pe tariful fix", () => {
    assert.equal(alegeLocalitatea(CLUJ, "Sinaia", "Cluj"), null);
    assert.equal(alegeLocalitatea([], "Cluj-Napoca", "Cluj"), null);
  });

  /*
   * ⚠ Cea mai mare piata din tara. Fara pliere, „Sector 3" n-ar gasi nimic si
   * TOATE comenzile bucurestene ar cadea tacut pe tariful fix.
   */
  test("Sector 3 gaseste localitatea Bucuresti", () => {
    const bucuresti = [{ id: 255154, city: "Bucuresti" }];
    assert.equal(alegeLocalitatea(bucuresti, "Sector 3", "Municipiul Bucuresti")?.id, 255154);
    assert.equal(alegeLocalitatea(bucuresti, "Bucuresti", "Bucuresti")?.id, 255154);
  });
});

describe("SmartShip: Bucurestiul si sectorul", () => {
  test("orasul se plieaza — SmartShip e in tabara CEA MARE, nu cu Sameday", () => {
    assert.equal(localitateSmartship("Sector 3", "Municipiul Bucuresti"), "Bucuresti");
    assert.equal(localitateSmartship("București", "Bucuresti"), "Bucuresti");
    assert.equal(localitateSmartship("Cluj-Napoca", "Cluj"), "Cluj-Napoca");
  });

  test("sectorul se scoate din oras, in toate formele in care il scrie lumea", () => {
    assert.equal(sectorSmartship("Sector 3", "Municipiul Bucuresti"), 3);
    assert.equal(sectorSmartship("sectorul 5", "Bucuresti"), 5);
    assert.equal(sectorSmartship("SEC 1", "Bucuresti"), 1);
  });

  /*
   * ⚠ TREI raspunsuri, nu doua. `0` inseamna „nu e in Bucuresti" — o AFIRMATIE,
   * nu o valoare lipsa. Pentru o adresa bucuresteana fara sector se raspunde
   * `null`, iar `lipsuriExpediere` opreste.
   */
  test("in afara Bucurestiului: 0, cum cer ei", () => {
    assert.equal(sectorSmartship("Cluj-Napoca", "Cluj"), 0);
  });

  test("in Bucuresti fara sector: null, NICIODATA 0", () => {
    assert.equal(sectorSmartship("Bucuresti", "Municipiul Bucuresti"), null);
    assert.equal(sectorSmartship("Bucuresti", "Bucuresti"), null);
  });

  test("sectorul scris cu judet gresit tot se recunoaste", () => {
    /* Se intampla: „Sector 3", judetul „Ilfov". */
    assert.equal(esteInBucuresti("Sector 3", "Ilfov"), true);
    assert.equal(sectorSmartship("Sector 3", "Ilfov"), 3);
  });
});
