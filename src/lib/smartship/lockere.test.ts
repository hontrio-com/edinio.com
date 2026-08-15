import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { cheileRaspunsului, lockereIncomplete, normalizeazaLockere } from "./lockere";

/**
 * ⚠ Fisierul asta probeaza o PRESUPUNERE, si e important sa se stie.
 *
 * `/geolocation/easybox` si `/geolocation/fanbox` sunt singurele doua endpointuri
 * din tot API-ul lor fara exemplu de raspuns. Numele campurilor de mai jos sunt
 * ghicite din felul in care isi scriu ei celelalte raspunsuri; probele verifica
 * doar ca citirea TOLERANTA se poarta cum trebuie, nu ca am ghicit bine.
 *
 * Adevarul se afla la prima cheie de cont, din butonul Diagnostic
 * (`cheileRaspunsului`). Pana atunci, `lockereIncomplete` e masura greselii.
 */

describe("SmartShip: lockerele, cu forma neghicita", () => {
  test("citeste forma cea mai probabila", () => {
    const l = normalizeazaLockere([
      {
        id: 4321, name: "Easybox Kaufland Marasti", address: "Str. Fabricii 1",
        city: "Cluj-Napoca", county: "Cluj", postal_code: "400000", lat: 46.77, lng: 23.6,
      },
    ]);
    assert.equal(l.length, 1);
    assert.deepEqual(l[0], {
      id: "4321",
      nume: "Easybox Kaufland Marasti",
      adresa: "Str. Fabricii 1",
      oras: "Cluj-Napoca",
      judet: "Cluj",
      codPostal: "400000",
      lat: 46.77,
      lng: 23.6,
    });
  });

  test("citeste si numele alternative, fara sa se planga", () => {
    const l = normalizeazaLockere([
      { locker_id: "77", nume: "Punct", strada: "Bd. Unirii 2", localitate: "Bucuresti", judet: "Bucuresti", latitude: "44.4", longitude: "26.1" },
    ]);
    assert.equal(l[0].id, "77");
    assert.equal(l[0].nume, "Punct");
    assert.equal(l[0].oras, "Bucuresti");
    assert.equal(l[0].lat, 44.4);
  });

  /*
   * ⚠ `content.locker_id` e „integer" in documentatia lor. Un id nenumeric ar fi
   * respins cu 806 DUPA ce cumparatorul si-a ales deja punctul — deci se arunca
   * aici. Pe dos fata de GLS, Posta si Packeta, unde id-ul e sir.
   */
  test("randurile fara id numeric pozitiv se arunca", () => {
    const brute = [
      { id: "RO-LOCKER-1", name: "Alfanumeric" },
      { id: 0, name: "Zero" },
      { id: -3, name: "Negativ" },
      { name: "Fara id" },
      { id: 12, name: "Bun" },
    ];
    const l = normalizeazaLockere(brute);
    assert.equal(l.length, 1);
    assert.equal(l[0].id, "12");
    assert.equal(lockereIncomplete(brute), 4);
  });

  test("acelasi locker de doua ori se pastreaza o data", () => {
    assert.equal(normalizeazaLockere([{ id: 5, name: "A" }, { id: "5", name: "A" }]).length, 1);
  });

  test("fara nume, punctul ramane recognoscibil dupa adresa", () => {
    assert.equal(normalizeazaLockere([{ id: 9, address: "Str. Lunga 3" }])[0].nume, "Str. Lunga 3");
    assert.equal(normalizeazaLockere([{ id: 9 }])[0].nume, "Locker 9");
  });

  test("coordonatele lipsa devin zero, nu NaN", () => {
    const l = normalizeazaLockere([{ id: 9, lat: "nu-i numar" }])[0];
    assert.equal(l.lat, 0);
    assert.equal(l.lng, 0);
  });

  test("raspunsul gol sau stricat nu crapa", () => {
    assert.deepEqual(normalizeazaLockere([]), []);
    assert.deepEqual(normalizeazaLockere([null as never, 5 as never, "x" as never]), []);
  });
});

describe("SmartShip: diagnosticul care inchide necunoscuta", () => {
  test("arata cheile reale cu cate un exemplu", () => {
    const chei = cheileRaspunsului([{ lockerId: 1, denumire: "X", coords: { lat: 1 } }]);
    assert.deepEqual(chei, [
      { cheie: "lockerId", exemplu: "1" },
      { cheie: "denumire", exemplu: "X" },
      { cheie: "coords", exemplu: "{…}" },
    ]);
  });

  /* Raspunsul poate purta adrese si coordonate: exemplul e pentru ecran, scurt. */
  test("exemplul se taie la 40 de caractere", () => {
    const chei = cheileRaspunsului([{ address: "x".repeat(100) }]);
    assert.equal(chei[0].exemplu.length, 40);
  });

  test("nu se uita decat la primele randuri si nu depaseste plafonul", () => {
    const brute = Array.from({ length: 50 }, (_, i) => ({ [`c${i}`]: i }));
    assert.equal(cheileRaspunsului(brute, 5).length, 5);
  });
});
