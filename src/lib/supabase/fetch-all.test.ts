import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchAllRows, fetchAllRowsStrict } from "./fetch-all";

type Fereastra = { data: unknown[] | null; error: { message: string } | null };

/** Un raspuns de PostgREST, fereastra cu fereastra. */
function baza(ferestre: Fereastra[]) {
  const cerute: [number, number][] = [];
  let i = 0;
  const query = (from: number, to: number) => {
    cerute.push([from, to]);
    return Promise.resolve(ferestre[i++] ?? { data: [], error: null });
  };
  return { query: query as never, cerute };
}

const randuri = (n: number) => Array.from({ length: n }, (_, k) => ({ k }));

test("o singura fereastra scurta inseamna gata", async () => {
  const b = baza([{ data: randuri(3), error: null }]);
  assert.equal((await fetchAllRowsStrict("t", b.query)).length, 3);
  assert.deepEqual(b.cerute, [[0, 999]]);
});

test("fereastra PLINA cere urmatoarea — altfel s-ar opri exact la plafonul de 1000", async () => {
  const b = baza([
    { data: randuri(1000), error: null },
    { data: randuri(1000), error: null },
    { data: randuri(7), error: null },
  ]);
  assert.equal((await fetchAllRowsStrict("t", b.query)).length, 2007);
  assert.deepEqual(b.cerute, [[0, 999], [1000, 1999], [2000, 2999]]);
});

test("STRICT arunca la eroare — NU intoarce ce a apucat", async () => {
  /*
   * Inima fixului. Varianta blanda ar fi intors aici 1000 de randuri, iar
   * apelantul n-are cum sa deosebeasca „atatea sunt" de „atatea am apucat".
   * Exact asa a iesit un sitemap valid si gol, cu cod 200, timp de doua saptamani.
   */
  const b = baza([
    { data: randuri(1000), error: null },
    { data: null, error: { message: "could not embed" } },
  ]);
  await assert.rejects(() => fetchAllRowsStrict("sitemap", b.query), /could not embed/);
});

test("mesajul aruncat spune ETICHETA si POZITIA ferestrei", async () => {
  // Fara ele, un `critical` in loguri nu spune care citire a picat, si sunt 67.
  const b = baza([
    { data: randuri(1000), error: null },
    { data: null, error: { message: "timeout" } },
  ]);
  await assert.rejects(() => fetchAllRowsStrict("media.catalog.products", b.query), (e: Error) => {
    assert.ok(e.message.includes("media.catalog.products"), e.message);
    assert.ok(e.message.includes("1000"), e.message);
    return true;
  });
});

test("eroarea pe PRIMA fereastra arunca la fel — un rezultat gol nu e un raspuns", async () => {
  const b = baza([{ data: null, error: { message: "permission denied" } }]);
  await assert.rejects(() => fetchAllRowsStrict("t", b.query), /permission denied/);
});

test("BLAND intoarce ce a apucat, si nu arunca", async () => {
  const b = baza([
    { data: randuri(1000), error: null },
    { data: null, error: { message: "timeout" } },
  ]);
  assert.equal((await fetchAllRows("panou", b.query)).length, 1000);
});

test("`data` null fara eroare nu e o eroare: inseamna zero randuri", async () => {
  const b = baza([{ data: null, error: null }]);
  assert.deepEqual(await fetchAllRowsStrict("t", b.query), []);
});
