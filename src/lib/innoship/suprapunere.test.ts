import { strict as assert } from "node:assert";
import { test } from "node:test";
import { curierulNostru, suprapuneri, textSuprapunere } from "./suprapunere";

/*
 * Varianta B, hotarata cu clientul: amandoua caile raman disponibile, iar panoul
 * avertizeaza cand un curier e activ si direct, si prin Innoship. Probele de aici
 * apara chiar regula — inclusiv cazurile in care avertismentul NU trebuie sa apara,
 * fiindca un avertisment care striga degeaba invata omul sa nu se mai uite la el.
 */

test("curierii pe care ii avem si direct se recunosc dupa numele din enum-ul lor", () => {
  assert.equal(curierulNostru("Cargus")?.id, "cargus");
  assert.equal(curierulNostru("FanCourier")?.id, "fan-courier");
  assert.equal(curierulNostru("PostaRomana")?.id, "posta");
  assert.equal(curierulNostru("EColet")?.id, "ecolet");
  assert.equal(curierulNostru("Pallex")?.id, "pallex");
});

test("potrivirea nu se increde in majuscule sau separatoare", () => {
  assert.equal(curierulNostru("fancourier")?.id, "fan-courier");
  assert.equal(curierulNostru("FAN_COURIER")?.id, "fan-courier");
  assert.equal(curierulNostru("Posta Romana")?.id, "posta");
});

test("cei ~220 pe care nu-i avem direct nu se potrivesc cu nimic", () => {
  assert.equal(curierulNostru("InPost"), null);
  assert.equal(curierulNostru("DHL_Paket"), null);
  assert.equal(curierulNostru(null), null);
  assert.equal(curierulNostru(""), null);
});

// ─── Suprapunerea ─────────────────────────────────────────────────────────────

const CURIERI = [
  { courierId: 1, courier: "Cargus" },
  { courierId: 2, courier: "DPD" },
  { courierId: 4, courier: "GLS" },
  { courierId: 90, courier: "InPost" },
];

test("se raporteaza doar curierii activi SI direct, SI prin Innoship", () => {
  const s = suprapuneri(CURIERI, ["gls", "sameday"]);
  assert.equal(s.length, 1);
  assert.equal(s[0].id, "gls");
  assert.equal(s[0].courierIdInnoship, 4);
});

test("fara niciun curier direct activ, nu exista suprapunere", () => {
  assert.deepEqual(suprapuneri(CURIERI, []), []);
});

test("un curier activ direct, dar pe care Innoship nu-l are, nu se raporteaza", () => {
  assert.deepEqual(suprapuneri(CURIERI, ["woot"]), []);
});

test("⚠ filtrul comerciantului stinge avertismentul: problema e deja rezolvata", () => {
  /* A scos GLS din lista Innoship, deci in checkout nu mai apare de doua ori. Un
     avertisment aici l-ar invata sa nu se mai uite la avertismente. */
  assert.deepEqual(suprapuneri(CURIERI, ["gls"], [1, 2]), []);
  /* Dar daca l-a lasat inauntru, avertismentul ramane. */
  assert.equal(suprapuneri(CURIERI, ["gls"], [1, 4]).length, 1);
});

test("filtrul gol inseamna TOTI, nu NICIUNUL", () => {
  assert.equal(suprapuneri(CURIERI, ["gls"], []).length, 1);
});

test("acelasi curier de doua ori in catalog apare o singura data", () => {
  const s = suprapuneri([...CURIERI, { courierId: 5, courier: "GLS" }], ["gls"]);
  assert.equal(s.length, 1);
});

test("un catalog gol sau lipsa nu arunca", () => {
  assert.deepEqual(suprapuneri([], ["gls"]), []);
  assert.deepEqual(suprapuneri(undefined as never, ["gls"]), []);
});

// ─── Textul ───────────────────────────────────────────────────────────────────

test("textul enumera curierii si spune ce poate face omul", () => {
  const t = textSuprapunere(suprapuneri(CURIERI, ["gls"]));
  assert.ok(t?.includes("GLS"), t ?? "");
  assert.ok(t?.includes("apare"), t ?? "");
  assert.ok(t?.includes("scoate-l"), t ?? "");
});

test("la mai multi, enumerarea e cu „si” inaintea ultimului", () => {
  const t = textSuprapunere(suprapuneri(CURIERI, ["gls", "cargus", "dpd"]));
  assert.ok(t?.includes("Cargus, DPD si GLS"), t ?? "");
  assert.ok(t?.includes("apar"), t ?? "");
});

test("fara suprapunere nu exista text", () => {
  assert.equal(textSuprapunere([]), null);
});
