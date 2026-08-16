import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { coordPentruPuncte } from "./client";
import { normalizeazaPuncte, RAZA_IMPLICITA_KM } from "./puncte";
import { orasulPotrivit } from "./localitati";
import type { OrasShipo, PunctShipo } from "./client";

/*
 * ⚠ CE APARA PROBELE ASTEA.
 *
 * Prima grupa apara defectul cel mai ascuns din tot contractul lor: coordonatele
 * vin intr-o ordine si se cer in cealalta. Gresit, cautarea de lockere raspunde
 * 200 cu o lista GOALA — adica exact „nu sunt lockere in localitatea ta", intr-un
 * oras plin de lockere, si fara nicio urma in jurnale.
 */

describe("⚠ coordonatele sunt INVERSATE intre /city si /points", () => {
  test("`[lng, lat]` de la ei devine `lat,lng` pentru /points", () => {
    // Bucuresti: /city si /client intorc [26.10, 44.43] — longitudinea intai.
    // /points cere „latitudine,longitudine", cu exemplul 46.7712,23.6236 (Cluj).
    assert.equal(coordPentruPuncte([26.10272, 44.436141]), "44.436141,26.10272");
  });

  test("proba care ar cadea daca cineva scoate rasucirea", () => {
    // Fara rasucire ar iesi „26.10272,44.436141": latitudine 26, longitudine 44 —
    // adica Marea Arabiei. Un punct valid ca numere, si complet gresit ca loc.
    const iesire = coordPentruPuncte([26.10272, 44.436141]);
    const [lat, lng] = String(iesire).split(",").map(Number);
    assert.ok(lat > 43 && lat < 49, `latitudinea ${lat} nu e in Romania`);
    assert.ok(lng > 20 && lng < 30, `longitudinea ${lng} nu e in Romania`);
  });

  test("perechile imposibile se refuza, ca sa se cada pe cautarea dupa nume", () => {
    assert.equal(coordPentruPuncte([26, 200]), null, "latitudine peste 90");
    assert.equal(coordPentruPuncte([500, 44]), null, "longitudine peste 180");
    assert.equal(coordPentruPuncte([0, 0]), null, "zero-zero inseamna „nu stiu”, nu Golful Guineei");
    assert.equal(coordPentruPuncte(null), null);
    assert.equal(coordPentruPuncte([26]), null);
    assert.equal(coordPentruPuncte(["a", "b"]), null);
  });

  test("raza implicita nu e zero", () => {
    // `radius=0` inseamna la ei 100 de metri, nu „fara limita": valorile din afara
    // intervalului sunt aduse la limita. Un zero ar goli lista.
    assert.ok(RAZA_IMPLICITA_KM > 0);
  });
});

const punct = (p: Partial<PunctShipo>): PunctShipo => ({
  id: 1234, name: "easybox OMV Belu", county: "Bucuresti", city: "Sectorul 4",
  street: "Sos. Oltenitei, Nr. 2", street_no: "", postal_code: "041304",
  address: "Sos. Oltenitei, Nr. 2, Sectorul 4, Bucuresti",
  lat: 44.3931, lng: 26.1174, opening_hours: "", accepted_payment: "Card",
  distance_km: 1.24, ...p,
});

describe("normalizarea punctelor", () => {
  test("citeste campurile garantate de documentatia lor", () => {
    const [p] = normalizeazaPuncte([punct({})]);
    assert.equal(p.id, "1234");
    assert.equal(p.nume, "easybox OMV Belu");
    assert.equal(p.oras, "Sectorul 4");
    assert.equal(p.judet, "Bucuresti");
    assert.equal(p.codPostal, "041304");
    assert.equal(p.distantaKm, 1.24);
  });

  test("un punct fara id se ARUNCA: nu s-ar putea emite", () => {
    assert.equal(normalizeazaPuncte([punct({ id: 0 })]).length, 0);
    assert.equal(normalizeazaPuncte([punct({ id: -3 })]).length, 0);
  });

  test("acelasi punct de doua ori se numara o data", () => {
    assert.equal(normalizeazaPuncte([punct({}), punct({})]).length, 1);
  });

  test("⚠ campurile care lipsesc la unii curieri nu rup nimic", () => {
    // Documentatia lor spune care: `street_no` lipseste la Posta si Sameday,
    // `accepted_payment` la FAN si Posta, `opening_hours` aproape peste tot.
    const [p] = normalizeazaPuncte([punct({ street_no: "", accepted_payment: "", opening_hours: "" })]);
    assert.equal(p.program, "");
    assert.ok(p.adresa.length > 0);
  });

  test("fara `address`, adresa se compune din strada si numar", () => {
    const [p] = normalizeazaPuncte([punct({ address: "", street: "Calea Victoriei", street_no: "10" })]);
    assert.equal(p.adresa, "Calea Victoriei, 10");
  });

  test("fara nume, punctul ramane recognoscibil dupa adresa", () => {
    const [p] = normalizeazaPuncte([punct({ name: "" })]);
    assert.equal(p.nume, "Sos. Oltenitei, Nr. 2, Sectorul 4, Bucuresti");
  });

  test("un punct fara coordonate NU se arunca", () => {
    // Harta are nevoie de ele, lista nu. Un punct PUDO real fara lat/lng ramane alegibil.
    const [p] = normalizeazaPuncte([punct({ lat: 0, lng: 0 })]);
    assert.equal(p.id, "1234");
  });

  test("distanta lipsa e `null`, nu zero", () => {
    // Zero inseamna „chiar la coordonatele cerute", si e o valoare cu inteles.
    const [p] = normalizeazaPuncte([punct({ distance_km: null })]);
    assert.equal(p.distantaKm, null);
    const [q] = normalizeazaPuncte([punct({ distance_km: 0 })]);
    assert.equal(q.distantaKm, 0);
  });
});

describe("orasul potrivit, nu primul din lista", () => {
  const oras = (id: number, value: string, county: string, coord: [number, number]): OrasShipo =>
    ({ id, label: `${value}, ${county}`, value, county, coord });

  test("⚠ `/city` e cautare pe TERMEN: judetul departe omonimele", () => {
    // „Victoria" exista in Brasov, Iasi, Braila si Vaslui. Luata orbeste prima,
    // cautarea de lockere pleaca in alt judet — si raspunde 200 cu puncte reale,
    // ordonate dupa distanta fata de punctul gresit. Nu arata a defect.
    const lista = [
      oras(1, "Victoria", "Iasi", [27.6, 47.3]),
      oras(2, "Victoria", "Brasov", [24.7, 45.7]),
    ];
    assert.equal(orasulPotrivit(lista, "Victoria", "Brasov")?.id, 2);
    assert.equal(orasulPotrivit(lista, "Victoria", "Judetul Iasi")?.id, 1);
  });

  test("ambiguu fara judet: mai bine NIMIC decat coordonate gresite", () => {
    const lista = [oras(1, "Victoria", "Iasi", [27.6, 47.3]), oras(2, "Victoria", "Brasov", [24.7, 45.7])];
    assert.equal(orasulPotrivit(lista, "Victoria", null), null);
  });

  test("un singur rezultat se ia, chiar fara judet", () => {
    assert.equal(orasulPotrivit([oras(9, "Cluj-Napoca", "Cluj", [23.6, 46.7])], "Cluj-Napoca", null)?.id, 9);
  });

  test("Bucurestiul se potriveste prin forma pliata", () => {
    const lista = [oras(16404, "Bucuresti", "Bucuresti", [26.1, 44.43])];
    assert.equal(orasulPotrivit(lista, "Sector 3", "Municipiul Bucuresti")?.id, 16404);
  });

  test("lista goala nu produce nimic", () => {
    assert.equal(orasulPotrivit([], "Cluj-Napoca", "Cluj"), null);
  });
});
