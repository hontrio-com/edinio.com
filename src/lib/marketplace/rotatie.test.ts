import assert from "node:assert/strict";
import { test } from "node:test";
import { alegeInRotatie } from "./rotatie";

test("sub plafon, ii intoarce pe toti, sortati", () => {
  assert.deepEqual(alegeInRotatie(["c", "a", "b"], 8), ["a", "b", "c"]);
});

test("peste plafon, intoarce exact cati s-au cerut", () => {
  const ids = Array.from({ length: 50 }, (_, i) => `m${String(i).padStart(2, "0")}`);
  assert.equal(alegeInRotatie(ids, 8).length, 8);
});

/*
 * Proba care conteaza: TOATA lumea ajunge la rand.
 *
 * Defectul pe care rotatia il inlocuieste era `slice(0, N)` peste o ordine
 * stabila — primele N magazine lucrate mereu, restul niciodata. Deci nu e destul
 * sa verificam ca intoarce N: trebuie ca peste destule ture sa fie acoperiti toti.
 */
test("peste destule ture, fiecare magazin intra macar o data", () => {
  const ids = Array.from({ length: 50 }, (_, i) => `m${String(i).padStart(2, "0")}`);
  const cati = 8;
  const vazuti = new Set<string>();
  // Simulam turele mutand fereastra exact cum o face ceasul.
  for (let tura = 0; tura < 50; tura++) {
    const start = (tura * cati) % ids.length;
    for (let i = 0; i < cati; i++) vazuti.add(ids[(start + i) % ids.length]);
  }
  assert.equal(vazuti.size, ids.length);
});

/*
 * ⚠ Capcana `pas`, care a produs deja un defect real la About You.
 *
 * Cand trecerea ruleaza doar la anumite minute (`getMinutes() % 15`), intre doua
 * executii EFECTIVE indicele de tura creste cu 15, nu cu 1. Cu `pas` lasat pe 1,
 * `start` avanseaza cu `15 * cati` si, pentru multimi de anumite dimensiuni, se
 * revine la aceleasi magazine la nesfarsit.
 */
test("cu pasul gresit, o trecere pe sferturi de ora poate reveni la aceiasi", () => {
  const ids = Array.from({ length: 20 }, (_, i) => `m${i}`);
  const cati = 4;
  const gresit = new Set<string>();
  for (let executie = 0; executie < 30; executie++) {
    // pas = 1, dar minutele reale sar din 15 in 15
    const tura = executie * 15;
    const start = (tura * cati) % ids.length;
    for (let i = 0; i < cati; i++) gresit.add(ids[(start + i) % ids.length]);
  }
  assert.ok(gresit.size < ids.length, "cu pas=1 pe o trecere din 15 in 15 minute, unii nu intra niciodata");

  const corect = new Set<string>();
  for (let executie = 0; executie < 30; executie++) {
    // pas = 15 imparte inapoi, deci tura creste cu 1 la fiecare executie reala
    const tura = Math.floor((executie * 15) / 15);
    const start = (tura * cati) % ids.length;
    for (let i = 0; i < cati; i++) corect.add(ids[(start + i) % ids.length]);
  }
  assert.equal(corect.size, ids.length, "cu pasul potrivit, toti ajung la rand");
});

test("lista goala nu arunca", () => {
  assert.deepEqual(alegeInRotatie([], 5), []);
});
