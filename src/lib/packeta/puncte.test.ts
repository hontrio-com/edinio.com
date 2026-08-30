import assert from "node:assert/strict";
import { test } from "node:test";
import {
  curierDupaId, curieriLaAdresa, normalizeazaCurieri, normalizeazaPuncte, puncteBune,
} from "./puncte";

/** Un rand de flux, in forma LOR: totul e sir, chiar si numerele. */
const punct = (peste: Record<string, unknown> = {}) => ({
  id: "12",
  name: "Cluj-Napoca, Piata Unirii 1",
  street: "Piata Unirii 1",
  city: "Cluj-Napoca",
  zip: "400098",
  country: "ro",
  displayFrontend: "1",
  latitude: "46.7712",
  longitude: "23.5934",
  maxWeight: "15",
  ...peste,
});

const curier = (peste: Record<string, unknown> = {}) => ({
  id: "106", name: "RO Cargus HD", country: "ro", ...peste,
});

/* ── Punctele ─────────────────────────────────────────────────────────────── */

test("un punct se citeste cu toate campurile, desi in JSON totul e sir", () => {
  const [p] = normalizeazaPuncte([punct()], "ro", false);
  assert.equal(p.id, "12");
  assert.equal(typeof p.id, "string", "id-ul ramane SIR: merge direct in addressId");
  assert.equal(p.oras, "Cluj-Napoca");
  assert.equal(p.codPostal, "400098");
  assert.equal(p.lat, 46.7712);
  assert.equal(p.lng, 23.5934);
  assert.equal(p.maxKg, 15);
  assert.equal(p.automat, false);
});

test("⚠ fluxul e MONDIAL: punctele altor tari se scot", () => {
  const lista = normalizeazaPuncte(
    [punct(), punct({ id: "13", country: "cz", city: "Praha" })], "ro", false,
  );
  assert.deepEqual(lista.map((p) => p.id), ["12"]);
});

test("tara se compara fara sa conteze majusculele", () => {
  assert.equal(normalizeazaPuncte([punct({ country: "RO" })], "ro", false).length, 1);
  assert.equal(normalizeazaPuncte([punct()], "RO", false).length, 1);
});

test("⚠ un punct pe care ei nu-l arata nu se arata nici la noi", () => {
  /*
   * `displayFrontend` e neechivoc; codurile de status se contrazic intre cele doua
   * fisiere ale documentatiei lor. Un punct ascuns de ei si oferit de noi ar fi o
   * comanda pe care n-o poate ridica nimeni.
   */
  assert.equal(normalizeazaPuncte([punct({ displayFrontend: "0" })], "ro", false).length, 0);
  assert.equal(normalizeazaPuncte([punct({ displayFrontend: "" })], "ro", false).length, 0);
});

test("un rand fara id se sare, nu produce un punct fara destinatie", () => {
  assert.equal(normalizeazaPuncte([punct({ id: "" }), punct({ id: undefined })], "ro", false).length, 0);
});

test("gunoiul in loc de flux da lista goala, nu exceptie", () => {
  for (const rau of [null, undefined, {}, "text", 42, [null, "x", 7]]) {
    assert.deepEqual(normalizeazaPuncte(rau, "ro", false), []);
  }
});

test("automatele: rambursul vine din `codAllowed`, punctele fizice il au implicit", () => {
  const [automat] = normalizeazaPuncte([punct({ codAllowed: "0" })], "ro", true);
  assert.equal(automat.acceptaRamburs, false);
  assert.equal(automat.automat, true);
  const [fizic] = normalizeazaPuncte([punct()], "ro", false);
  assert.equal(fizic.acceptaRamburs, true, "documentatia spune ca punctele accepta ramburs");
});

test("coordonatele necitibile dau null, nu zero", () => {
  // Zero ar fi o coordonata VALIDA (in golful Guineei) si ar aseza punctul acolo.
  const [p] = normalizeazaPuncte([punct({ latitude: "", longitude: "n/a" })], "ro", false);
  assert.equal(p.lat, null);
  assert.equal(p.lng, null);
});

/* ── Alegerea punctului ───────────────────────────────────────────────────── */

test("punctele prea mici pentru colet se scot", () => {
  const puncte = normalizeazaPuncte([punct({ id: "1", maxWeight: "5" }), punct({ id: "2", maxWeight: "30" })], "ro", false);
  assert.deepEqual(puncteBune(puncte, 10, 0).map((p) => p.id), ["2"]);
});

test("⚠ fara `maxWeight` nu se exclude nimic: „nu stim” nu e „nu incape”", () => {
  const puncte = normalizeazaPuncte([punct({ maxWeight: "" })], "ro", false);
  assert.equal(puncteBune(puncte, 99, 0).length, 1);
});

test("la comanda cu ramburs se scot punctele care nu-l accepta", () => {
  const puncte = normalizeazaPuncte([punct({ id: "1", codAllowed: "0" }), punct({ id: "2", codAllowed: "1" })], "ro", true);
  assert.deepEqual(puncteBune(puncte, 1, 250).map((p) => p.id), ["2"]);
  assert.equal(puncteBune(puncte, 1, 0).length, 2, "fara ramburs, amandoua sunt bune");
});

/* ── Curierii ─────────────────────────────────────────────────────────────── */

test("un curier se citeste cu toate steagurile lui", () => {
  const [c] = normalizeazaCurieri([curier({
    disallowsCod: "1", separateHouseNumber: "1", requiresSize: "1", apiAllowed: "1", maxWeight: "31.5",
  })], "ro");
  assert.equal(c.id, "106");
  assert.equal(c.faraRamburs, true);
  assert.equal(c.numarSeparat, true);
  assert.equal(c.cereDimensiuni, true);
  assert.equal(c.etichetaProprie, true);
  assert.equal(c.maxKg, 31.5);
});

test("steagurile accepta si „yes”, si „1”, si „true”", () => {
  for (const v of ["yes", "1", "true", "YES"]) {
    assert.equal(normalizeazaCurieri([curier({ disallowsCod: v })], "ro")[0].faraRamburs, true, `pentru ${v}`);
  }
  for (const v of ["no", "0", "", undefined]) {
    assert.equal(normalizeazaCurieri([curier({ disallowsCod: v })], "ro")[0].faraRamburs, false, `pentru ${v}`);
  }
});

test("⚠ curierii cu puncte proprii NU se ofera ca livrare la adresa", () => {
  /*
   * Ei cer si `carrierPickupPoint`; fara el coletul n-are destinatie. Oferit ca
   * livrare la adresa, ar fi o comanda care pica abia la emitere.
   */
  const curieri = normalizeazaCurieri([
    curier({ id: "1" }),
    curier({ id: "2", pickupPoints: "1", name: "RO Sameday Easybox" }),
  ], "ro");
  assert.deepEqual(curieriLaAdresa(curieri, false).map((c) => c.id), ["1"]);
});

test("⚠ la comanda cu ramburs se scot curierii care nu-l accepta", () => {
  const curieri = normalizeazaCurieri([
    curier({ id: "1" }),
    curier({ id: "2", disallowsCod: "1" }),
  ], "ro");
  assert.deepEqual(curieriLaAdresa(curieri, true).map((c) => c.id), ["1"]);
  assert.deepEqual(curieriLaAdresa(curieri, false).map((c) => c.id), ["1", "2"]);
});

test("curierii altor tari nu ajung in lista", () => {
  const curieri = normalizeazaCurieri([curier(), curier({ id: "80", country: "cz" })], "ro");
  assert.deepEqual(curieri.map((c) => c.id), ["106"]);
});

test("curierul se regaseste dupa id, si lipsa lui e `null`", () => {
  const curieri = normalizeazaCurieri([curier()], "ro");
  assert.equal(curierDupaId(curieri, "106")?.nume, "RO Cargus HD");
  // Un id scos din flux intre timp: comanda veche nu mai gaseste curierul.
  assert.equal(curierDupaId(curieri, "999"), null);
  assert.equal(curierDupaId(curieri, ""), null);
});
