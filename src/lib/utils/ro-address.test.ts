import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { stripDiacritics, normalizeLocalityName, normalizeCountyName } from "./ro-address";

/**
 * Cazul real care a produs `Woot API error 400` pe comanda #0075 (magazinul
 * suporti-numar, 04.08.2026): livrare la "Comanesti", str. "Garii 98".
 *
 * Doua comenzi identice, acelasi produs, aceeasi greutate:
 *   #0074 -> "Bl 44 Sc A str Republicii"  (numai ASCII)  -> AWB emis
 *   #0075 -> "Garii 98"                   (cu diacritice) -> 400 fara motiv
 *
 * In plus, orasul nu se preselecta in modalul de AWB, fiindca potrivirea
 * compara text brut si romana are DOUA codificari uzuale pentru aceleasi
 * litere: ș/ț cu virgula dedesubt (U+0219/U+021B) si ş/ţ cu sedila
 * (U+015F/U+0163). Sunt caractere diferite pentru un `===` sau `includes`.
 */

const COMANESTI_VIRGULA = "Comănești"; // ș U+0219 — ce scrie clientul
const COMANESTI_SEDILA  = "Comăneşti"; // ş U+015F — ce livreaza nomenclatoarele

describe("cele doua codificari romanesti ajung la acelasi rezultat", () => {
  test("virgula dedesubt si sedila se normalizeaza identic", () => {
    assert.notEqual(COMANESTI_VIRGULA, COMANESTI_SEDILA, "premisa: sunt siruri diferite");
    assert.equal(stripDiacritics(COMANESTI_VIRGULA), "Comanesti");
    assert.equal(stripDiacritics(COMANESTI_SEDILA), "Comanesti");
    assert.equal(stripDiacritics(COMANESTI_VIRGULA), stripDiacritics(COMANESTI_SEDILA));
  });

  test("acelasi lucru pentru t (U+021B vs U+0163)", () => {
    assert.equal(stripDiacritics("Constanța"), "Constanta");
    assert.equal(stripDiacritics("Constanţa"), "Constanta");
  });

  test("adresa care a picat la Woot devine ASCII", () => {
    assert.equal(stripDiacritics("Gării 98"), "Garii 98");
    assert.match(stripDiacritics("Gării 98"), /^[\x20-\x7E]+$/);
  });
});

describe("localitati si judete reale din comenzile magazinului", () => {
  const cazuri: [string, string][] = [
    ["Bacău", "Bacau"],
    [COMANESTI_VIRGULA, "Comanesti"],
    ["Făgăraș", "Fagaras"],
    ["Piatra Neamț", "Piatra Neamt"],
    ["Tândarei", "Tandarei"],
    ["Cristuru Secuiesc", "Cristuru Secuiesc"],
  ];
  for (const [intrare, asteptat] of cazuri) {
    test(`${intrare} -> ${asteptat}`, () => {
      assert.equal(normalizeLocalityName(intrare), asteptat);
    });
  }

  test("judetul isi pierde prefixul si diacriticele", () => {
    assert.equal(normalizeCountyName("Județul Bacău"), "Bacau");
    assert.equal(normalizeCountyName("judeţul Iași"), "Iasi");
  });

  test("Bucurestiul si sectoarele raman o singura localitate", () => {
    assert.equal(normalizeLocalityName("Sector 3", "Bucuresti"), "Bucuresti");
    assert.equal(normalizeLocalityName("București"), "Bucuresti");
  });
});
