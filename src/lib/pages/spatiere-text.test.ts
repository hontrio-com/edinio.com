import { strict as assert } from "node:assert";
import { test } from "node:test";

import { INALTIME_TITLU, spatiere } from "./spatiere-text";

/*
  Spatiul intre litere si intre randuri (07.10.2026), comun pentru Hero, Titlu,
  Text, Buton si Intrebari frecvente.
*/

test("lipsa campurilor nu scrie nimic: un bloc salvat inainte arata ca pana acum", () => {
  assert.deepEqual(spatiere(), {});
  assert.deepEqual(spatiere(undefined, undefined, INALTIME_TITLU), {});
});

test("„normala” aleasa anume se scrie, ca sa bata `tracking-tight` din clasa titlurilor", () => {
  assert.deepEqual(spatiere("normal"), { letterSpacing: "normal" });
});

test("fiecare varianta da o valoare diferita, deci fiecare buton din editor schimba ceva", () => {
  const litere = ["tight", "normal", "wide", "wider"].map((v) => spatiere(v).letterSpacing);
  const randuri = ["tight", "normal", "relaxed", "loose"].map((v) => spatiere(null, v).lineHeight);
  const titluri = ["tight", "normal", "relaxed", "loose"].map((v) => spatiere(null, v, INALTIME_TITLU).lineHeight);
  for (const l of [litere, randuri, titluri]) {
    assert.equal(new Set(l).size, 4);
    assert.ok(l.every((x) => x !== undefined));
  }
});

test("o valoare necunoscuta sau din prototip nu ajunge in stil", () => {
  assert.deepEqual(spatiere("constructor", "__proto__"), {});
  assert.deepEqual(spatiere("toString", "hasOwnProperty", INALTIME_TITLU), {});
  assert.deepEqual(spatiere("foarte", "mult"), {});
});
