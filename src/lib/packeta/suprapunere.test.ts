import assert from "node:assert/strict";
import { test } from "node:test";
import { curierulNostru, suprapuneri, textSuprapunere } from "./suprapunere";

test("numele Packeta se recunosc, desi poarta tara si serviciul", () => {
  // Forma lor reala: „RO Cargus HD", „RO Sameday Box".
  assert.equal(curierulNostru("RO Cargus HD")?.id, "cargus");
  assert.equal(curierulNostru("RO FAN HD")?.id, "fan-courier");
  assert.equal(curierulNostru("RO Sameday Box")?.id, "sameday");
  assert.equal(curierulNostru("RO DPD HD")?.id, "dpd");
});

test("un curier pe care nu-l avem direct nu produce nicio suprapunere", () => {
  assert.equal(curierulNostru("CZ Česká pošta"), null);
  assert.equal(curierulNostru(""), null);
  assert.equal(curierulNostru(null), null);
});

test("se raporteaza doar curierii activi DIRECT", () => {
  const lista = [{ id: "1", nume: "RO Cargus HD" }, { id: "2", nume: "RO DPD HD" }];
  assert.deepEqual(suprapuneri(lista, ["cargus"]).map((s) => s.id), ["cargus"]);
  assert.deepEqual(suprapuneri(lista, []).map((s) => s.id), []);
});

test("⚠ un curier pe care comerciantul l-a scos deja nu mai e o suprapunere", () => {
  /* Un avertisment care apare cand problema e rezolvata invata omul sa nu se mai
     uite la avertismente. */
  const lista = [{ id: "1", nume: "RO Cargus HD" }, { id: "2", nume: "RO DPD HD" }];
  assert.deepEqual(suprapuneri(lista, ["cargus", "dpd"], ["2"]).map((s) => s.id), ["dpd"]);
});

test("acelasi curier cu doua servicii se numara o singura data", () => {
  const lista = [{ id: "1", nume: "RO Sameday HD" }, { id: "2", nume: "RO Sameday Box" }];
  assert.equal(suprapuneri(lista, ["sameday"]).length, 1);
});

test("textul se acorda dupa numar, si lipsa suprapunerii nu produce text", () => {
  assert.equal(textSuprapunere([]), null);
  const unu = textSuprapunere([{ id: "cargus", eticheta: "Cargus", numePacketa: "RO Cargus HD" }]);
  assert.ok(unu?.includes("Cargus apare"));
  const doi = textSuprapunere([
    { id: "cargus", eticheta: "Cargus", numePacketa: "RO Cargus HD" },
    { id: "dpd", eticheta: "DPD", numePacketa: "RO DPD HD" },
  ]);
  assert.ok(doi?.includes("Cargus si DPD apar"));
});
