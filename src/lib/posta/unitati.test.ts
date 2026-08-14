import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  cheileNomenclatorului,
  normalizeazaUnitati,
  unitateLaPunct,
  unitatiIncomplete,
} from "./unitati";

/*
 * ⚠ Din tot randul nomenclatorului, documentatia numeste UN SINGUR camp: `id`.
 * Restul numelor sunt presupuneri, deci probele de aici apara tocmai purtarea
 * cand presupunerea e gresita: lista nu are voie sa iasa goala, si nu are voie sa
 * scoata randuri fara denumire pe care cumparatorul sa nu le poata alege.
 */

test("randul documentat: id-ul e destul ca sa iasa un punct", () => {
  const p = unitateLaPunct({ id: 31793 });
  assert.equal(p?.id, "31793");
  assert.ok(p?.name.includes("31793"), p?.name);
});

test("denumirea se cauta prin numele romanesti si englezesti", () => {
  assert.equal(unitateLaPunct({ id: 1, denumire: "Timisoara 1" })?.name, "Timisoara 1");
  assert.equal(unitateLaPunct({ id: 1, numeUnitate: "Timisoara 1" })?.name, "Timisoara 1");
  assert.equal(unitateLaPunct({ id: 1, oficiu: "Timisoara 1" })?.name, "Timisoara 1");
  assert.equal(unitateLaPunct({ id: 1, name: "Timisoara 1" })?.name, "Timisoara 1");
});

test("fara denumire, punctul primeste localitatea — nu un rand gol in lista", () => {
  assert.equal(unitateLaPunct({ id: 7, localitate: "Cluj-Napoca" })?.name, "Oficiu postal Cluj-Napoca");
  assert.equal(unitateLaPunct({ id: 7 })?.name, "Oficiu postal 7");
});

test("adresa, localitatea, judetul si codul postal se cauta la fel", () => {
  const p = unitateLaPunct({
    id: 31793,
    denumire: "Timisoara 1 of",
    adresa: "Bd. Revolutiei 2",
    localitate: "Timisoara",
    judet: "Timis",
    codPostal: "300054",
  });
  assert.equal(p?.address, "Bd. Revolutiei 2");
  assert.equal(p?.city, "Timisoara");
  assert.equal(p?.county, "Timis");
  assert.equal(p?.postCode, "300054");
});

test("si prin numele englezesti, daca asa vin", () => {
  const p = unitateLaPunct({
    id: 1, name: "Office", address: "Str. Mare 3", city: "Iasi", county: "Iasi", postalCode: "700001",
  });
  assert.equal(p?.address, "Str. Mare 3");
  assert.equal(p?.city, "Iasi");
  assert.equal(p?.postCode, "700001");
});

test("⚠ fara id, randul se scoate: alegerea n-ar avea ce scrie in idOficiuPR", () => {
  assert.equal(unitateLaPunct({ denumire: "Fara id" }), null);
  assert.equal(unitateLaPunct({}), null);
});

test("coordonatele lipsa devin zero, si asta e in regula cat timp selectorul e o lista", () => {
  const p = unitateLaPunct({ id: 1 });
  assert.equal(p?.lat, 0);
  assert.equal(p?.lng, 0);

  const cu = unitateLaPunct({ id: 1, lat: 45.75, lng: 21.22 });
  assert.equal(cu?.lat, 45.75);
  assert.equal(cu?.lng, 21.22);
});

test("coordonatele venite ca siruri se citesc tot ca numere", () => {
  const p = unitateLaPunct({ id: 1, latitudine: "45.75", longitudine: "21.22" });
  assert.equal(p?.lat, 45.75);
  assert.equal(p?.lng, 21.22);
});

// ─── Nomenclatorul intreg ─────────────────────────────────────────────────────

test("acelasi oficiu de doua ori apare o singura data in selector", () => {
  const puncte = normalizeazaUnitati([
    { id: 1, denumire: "Unu" },
    { id: "1", denumire: "Unu, din nou" },
    { id: 2, denumire: "Doi" },
  ]);
  assert.equal(puncte.length, 2);
  assert.deepEqual(puncte.map((p) => p.id), ["1", "2"]);
});

test("randurile fara id nu ajung in lista", () => {
  const puncte = normalizeazaUnitati([{ id: 1 }, { denumire: "fara id" }, {}]);
  assert.equal(puncte.length, 1);
});

test("un nomenclator gol da o lista goala, nu o exceptie", () => {
  assert.deepEqual(normalizeazaUnitati([]), []);
});

// ─── Sondele pentru „am ghicit gresit numele campurilor” ──────────────────────

test("se numara cate randuri au ramas fara denumire adevarata", () => {
  /* E chiar sonda: cu zero puncte numite din cateva mii, lista e inutilizabila,
     iar fara masuratoarea asta singurul semn ar fi fost un cumparator nedumerit. */
  const brute = [
    { id: 1, denumire: "Unu" },
    { id: 2 },
    { id: 3, alt_nume_neasteptat: "Trei" },
    { denumire: "fara id, nu se numara" },
  ];
  assert.equal(unitatiIncomplete(brute), 2);
});

test("cheile intalnite se scot cu cate un exemplu, pentru prima proba pe fir", () => {
  const chei = cheileNomenclatorului([
    { id: 31793, denumireNeasteptata: "Timisoara 1 of", obiect: { nu: "se ia" }, gol: null },
  ]);
  assert.deepEqual(chei, [
    { cheie: "denumireNeasteptata", exemplu: "Timisoara 1 of" },
    { cheie: "id", exemplu: "31793" },
  ]);
});
