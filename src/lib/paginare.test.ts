import { strict as assert } from "node:assert";
import { test } from "node:test";
import { numereDeAratat, fereastraPaginii } from "@/lib/paginare";

/*
 * Ce numere de pagină se arată.
 *
 * ⚠ Regulile de fereastră cu „…" se strică la MARGINI — prima pagină, ultima, liste
 * scurte — iar acolo greșeala arată ca un buton lipsă, nu ca o eroare. De aceea
 * funcția e pură și separată de randare: se poate proba exact acolo unde se strică.
 *
 * De ce a fost nevoie: ecranul de oferte arată 50 pe pagină, iar după importul din
 * contul unui comerciant erau 3.754 de oferte — 76 de pagini, cu „înainte" ca singură
 * cale către pagina 60.
 */

test("paginație: sub opt pagini se arată toate", () => {
  assert.deepEqual(numereDeAratat(1, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(numereDeAratat(3, 7), [1, 2, 3, 4, 5, 6, 7]);
});

test("paginație: prima și ultima sunt mereu acolo", () => {
  /* ⚠ Fără ele, cineva ajuns la pagina 40 din 76 n-are cum să se întoarcă la început
     dintr-o apăsare — exact plimbarea pe care o repară bara asta. */
  for (const p of [1, 2, 38, 75, 76]) {
    const n = numereDeAratat(p, 76);
    assert.equal(n[0], 1, `pagina ${p}: prima lipsește`);
    assert.equal(n[n.length - 1], 76, `pagina ${p}: ultima lipsește`);
  }
});

test("paginație: pagina curentă e mereu între numerele arătate", () => {
  /* ⚠ Cel mai supărător fel de a greși: bara arată numere, dar niciunul nu e cel pe
     care stai, deci omul nu mai știe unde e. */
  for (const p of [1, 2, 3, 40, 74, 75, 76]) {
    assert.equal(numereDeAratat(p, 76).includes(p), true, `pagina ${p} nu se vede pe ea însăși`);
  }
});

test("paginație: la mijloc apar puncte de amândouă părțile", () => {
  const n = numereDeAratat(40, 76);
  assert.deepEqual(n, [1, "…", 39, 40, 41, "…", 76]);
});

test("paginație: la margini punctele apar doar pe o parte", () => {
  assert.deepEqual(numereDeAratat(1, 76), [1, 2, "…", 76]);
  assert.deepEqual(numereDeAratat(76, 76), [1, "…", 75, 76]);
});

test("paginație: o singură pagină nu produce nimic ciudat", () => {
  assert.deepEqual(numereDeAratat(1, 1), [1]);
  assert.deepEqual(numereDeAratat(1, 0), []);
});

/*
  ═══════════════════════════════════════════════════════════════════════════
  FEREASTRA UNEI PAGINI — strânsă la câte pagini există (31.08.2026)
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ DEFECTUL PĂZIT AICI SE APRINDEA CU BAZA SĂNĂTOASĂ. `listeazaAbonati` cerea
  `range(de_la, …)` dintr-un `?p=` venit din adresă, fără să știe câte rânduri
  există. Peste sfârșit, PostgREST răspunde 416 / `PGRST103`, iar `postgrest-js`
  citește `count` doar când răspunsul e bun — deci arunca și numărul pe care
  serverul tocmai i-l trimisese în `Content-Range`.

  Ce vedea omul: „N abonați confirmați" și „Niciun abonat încă" în același ecran,
  scăderea dintre ele negativă, paginația dispărută — deci fără drum înapoi.

  Probat pe producție, cu o citire: `Range: 50-99` pe o tabelă cu 0 rânduri →
  `HTTP/1.1 416`, `Content-Range: * / 0`, `{"code":"PGRST103"}`.
*/

test("pagina cerută se strânge la ultima care există", () => {
  const f = fereastraPaginii(4, 120, 50); /* 120 de rânduri = 3 pagini */
  assert.equal(f.pagini, 3);
  assert.equal(f.pagina, 3, "a rămas pe pagina 4, care nu există");
  assert.equal(f.deLa, 100);
});

test("lista goală are tot o pagină, iar fereastra începe de la zero", () => {
  const f = fereastraPaginii(7, 0, 50);
  assert.equal(f.pagini, 1);
  assert.equal(f.pagina, 1);
  assert.equal(f.deLa, 0, "cu offset peste zero, PostgREST ar raspunde 416");
});

test("o pagină din interior rămâne neatinsă", () => {
  const f = fereastraPaginii(2, 120, 50);
  assert.deepEqual({ p: f.pagina, de: f.deLa, pana: f.panaLa }, { p: 2, de: 50, pana: 99 });
});

test("un `?p=` scris de mână nu poate scoate fereastra din limite", () => {
  for (const scris of [0, -3, 1.5, Number.NaN, 1e21]) {
    const f = fereastraPaginii(scris, 120, 50);
    assert.ok(f.pagina >= 1 && f.pagina <= f.pagini, `pagina ${f.pagina} pentru intrarea ${scris}`);
    assert.ok(f.deLa >= 0 && f.deLa < 120, `deLa ${f.deLa} pentru intrarea ${scris}`);
  }
});

test("exact cât încape pe o pagină nu naște o pagină goală în plus", () => {
  assert.equal(fereastraPaginii(1, 50, 50).pagini, 1);
});
