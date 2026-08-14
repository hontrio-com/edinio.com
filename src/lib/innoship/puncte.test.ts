import { strict as assert } from "node:assert";
import { test } from "node:test";
import { cheileRaspunsului, normalizeazaPuncte, puncteIncomplete, randLaPunct } from "./puncte";

/*
 * ⚠ `FixedLocations` e SINGURUL raspuns nedocumentat din tot API-ul Innoship.
 * Probele de aici apara purtarea cand presupunerea despre numele campurilor e
 * gresita: lista nu are voie sa iasa goala, si nu are voie sa scoata randuri pe
 * care cumparatorul nu le poate alege.
 */

test("`fixedLocationId` e cautat PRIMUL: e chiar numele pe care il cere comanda inapoi", () => {
  const p = randLaPunct({ id: "999", fixedLocationId: "FL-1" });
  assert.equal(p?.id, "FL-1");
});

test("id-ul se gaseste si sub celelalte nume cu putinta", () => {
  assert.equal(randLaPunct({ id: 4321 })?.id, "4321");
  assert.equal(randLaPunct({ locationId: "L7" })?.id, "L7");
});

test("denumirea se cauta prin numele englezesti si romanesti", () => {
  assert.equal(randLaPunct({ id: 1, name: "Easybox Unirii" })?.name, "Easybox Unirii");
  assert.equal(randLaPunct({ id: 1, fixedLocationName: "Easybox Unirii" })?.name, "Easybox Unirii");
  assert.equal(randLaPunct({ id: 1, denumire: "Easybox Unirii" })?.name, "Easybox Unirii");
});

test("fara denumire, punctul primeste localitatea — nu un rand gol in lista", () => {
  assert.equal(randLaPunct({ id: 7, localityName: "Cluj-Napoca" })?.name, "Punct de ridicare Cluj-Napoca");
  assert.equal(randLaPunct({ id: 7 })?.name, "Punct de ridicare 7");
});

test("restul campurilor se cauta la fel", () => {
  const p = randLaPunct({
    fixedLocationId: "FL-9",
    name: "Easybox Iulius",
    address: "Str. Alexandru Vaida Voevod 53B",
    localityName: "Cluj-Napoca",
    countyName: "Cluj",
    postalCode: "400436",
    latitude: 46.7712,
    longitude: 23.6236,
  });
  assert.equal(p?.address, "Str. Alexandru Vaida Voevod 53B");
  assert.equal(p?.city, "Cluj-Napoca");
  assert.equal(p?.county, "Cluj");
  assert.equal(p?.postCode, "400436");
  assert.equal(p?.lat, 46.7712);
  assert.equal(p?.lng, 23.6236);
});

test("coordonatele venite ca siruri se citesc tot ca numere", () => {
  const p = randLaPunct({ id: 1, lat: "46.77", lng: "23.62" });
  assert.equal(p?.lat, 46.77);
  assert.equal(p?.lng, 23.62);
});

test("⚠ fara id, randul se scoate: alegerea n-ar avea ce trimite inapoi", () => {
  assert.equal(randLaPunct({ name: "Fara id" }), null);
  assert.equal(randLaPunct({}), null);
});

test("coordonatele lipsa devin zero, cat timp selectorul e o lista si nu o harta", () => {
  const p = randLaPunct({ id: 1 });
  assert.equal(p?.lat, 0);
  assert.equal(p?.lng, 0);
});

test("acelasi punct de doua ori apare o singura data", () => {
  const puncte = normalizeazaPuncte([
    { fixedLocationId: "A", name: "Unu" },
    { fixedLocationId: "A", name: "Unu, din nou" },
    { fixedLocationId: "B", name: "Doi" },
  ]);
  assert.deepEqual(puncte.map((p) => p.id), ["A", "B"]);
});

test("un nomenclator gol sau lipsa da o lista goala, nu o exceptie", () => {
  assert.deepEqual(normalizeazaPuncte([]), []);
  assert.deepEqual(normalizeazaPuncte(undefined as never), []);
});

test("campurile necunoscute nu strica nimic", () => {
  /* Documentatia lor cere anume asta: „client applications should be able to
     accept unknown fields in responses for backward compatibility". */
  const p = randLaPunct({ fixedLocationId: "A", name: "Unu", cevaNouAparutLaEi: 42 });
  assert.equal(p?.id, "A");
  assert.equal(p?.name, "Unu");
});

test("se numara cate randuri au ramas fara denumire adevarata", () => {
  const brute = [
    { fixedLocationId: "A", name: "Unu" },
    { fixedLocationId: "B" },
    { fixedLocationId: "C", numeNeasteptat: "Trei" },
    { name: "fara id, nu se numara" },
  ];
  assert.equal(puncteIncomplete(brute), 2);
});

test("cheile intalnite se scot cu cate un exemplu, pentru prima proba pe fir", () => {
  const chei = cheileRaspunsului([
    { fixedLocationId: "FL-1", numeNeasteptat: "Easybox", obiect: { nu: "se ia" }, gol: null },
  ]);
  assert.deepEqual(chei, [
    { cheie: "fixedLocationId", exemplu: "FL-1" },
    { cheie: "numeNeasteptat", exemplu: "Easybox" },
  ]);
});
