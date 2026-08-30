import { test } from "node:test";
import assert from "node:assert/strict";
import { pretVechiDeTaiat } from "./compare-at";

test("pretul vechi peste cel curent se taie", () => {
  assert.equal(pretVechiDeTaiat(250, 199), 250);
});

test("Jordan negru alb: 200 lei taiat cu 150 nu mai apare", () => {
  // Produsul chiar exista in productie la magazinul-online, cu inca sase copii.
  assert.equal(pretVechiDeTaiat("150.00", "200.00"), null);
});

test("structuri metalice: pret vechi egal cu cel curent nu se taie", () => {
  // sibiu, 1,00 lei taiat cu 1,00 lei.
  assert.equal(pretVechiDeTaiat("1.00", "1.00"), null);
});

test("tonel-beauty: diferenta de banuti in jos tot nu e reducere", () => {
  assert.equal(pretVechiDeTaiat("23.00", "23.54"), null);
});

test("valoare lipsa: null, undefined si sirul gol", () => {
  assert.equal(pretVechiDeTaiat(null, 100), null);
  assert.equal(pretVechiDeTaiat(undefined, 100), null);
  assert.equal(pretVechiDeTaiat("", 100), null);
});

test("zero nu e o valoare de taiat, dar nici nu arunca", () => {
  assert.equal(pretVechiDeTaiat(0, 100), null);
});

test("text care nu e numar nu produce NaN taiat pe ecran", () => {
  assert.equal(pretVechiDeTaiat("gratis", 100), null);
  assert.equal(pretVechiDeTaiat(250, "necunoscut"), null);
});

test("preturile venite ca text din baza se compara ca numere, nu ca siruri", () => {
  // Ca siruri, "9.00" > "100.00" e adevarat si ar fi taiat 100 cu 9.
  assert.equal(pretVechiDeTaiat("9.00", "100.00"), null);
  assert.equal(pretVechiDeTaiat("100.00", "9.00"), 100);
});
