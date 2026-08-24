import { strict as assert } from "node:assert";
import { test } from "node:test";
import { numereDeAratat } from "@/lib/paginare";

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
