import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   MOTIVELE RESPINGERII PORNEAU MEREU DE LA PAGINA 1 (27.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   `/products/rejected` se citea de la pagina 1, cel mult 20 de pagini. Peste 2000 de produse
   respinse, un style aflat mai departe nu-si primea NICIODATA motivul: comerciantul vedea
   „respins" fara sa afle de ce, si nu mai avea cum sa afle - `GET /products/` nu are campurile
   alea deloc in schema.

   ⚠ E acelasi defect reparat luna asta la catalogul principal si, inainte, la Trendyol:
   „scanarea fixa de 5 pagini de la zero n-a vazut niciodata nimic dupa produsul 500 intr-un
   catalog de 1033". Ramas aici, pe ruta cea mai stransa la rata: 50 de cereri pe minut.
*/

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/^[ \t]*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const sync = viu("src/lib/aboutyou/sync.ts");

test("⚠ se iese cand s-a gasit tot ce cautam", () => {
  /*
   * Leacul care face aproape toata treaba. Bucla mergea mai departe si dupa ce fiecare style
   * cerut isi primise motivul - pagini cerute degeaba, pe o ruta cu 50 de cereri pe minut. Cu
   * iesirea, plafonul de 20 aproape nu mai are cand sa muste.
   */
  assert.match(sync, /deRespins\.delete\(it\.style_key\);/);
  assert.match(sync, /if \(deRespins\.size === 0\) \{ gasiteToate = true; break; \}/);
});

test("⚠ si roata se invarte, pentru cazul rau", () => {
  assert.match(sync, /const dePeLaR = Math\.max\(1, Number\(ctx\.config\.rejected_page \?\? 1\) \|\| 1\);/);
  assert.match(sync, /for \(let page = dePeLaR; page < dePeLaR \+ Math\.min\(maxPages, 20\); page\+\+\)/);
  assert.match(sync, /rejected_page: urmatoareaR/);
});

test("⚠ cursorul NU se muta cand am gasit tot", () => {
  /*
   * Mutat si atunci, urmatoarea trecere ar sari peste paginile de la inceput fara motiv - iar
   * cele mai multe treceri se termina exact asa, cu tot ce cautam gasit in primele pagini.
   */
  assert.match(sync, /if \(!gasiteToate && urmatoareaR !== dePeLaR\) \{/);
});

test("⚠ catalogul terminat intoarce roata la inceput", () => {
  /* Fara asta, cursorul ar creste la nesfarsit si paginile de la inceput n-ar mai fi citite. */
  const i = sync.indexOf("const dePeLaR");
  const bucata = sync.slice(i, i + 1800);
  assert.equal((bucata.match(/urmatoareaR = 1;/g) ?? []).length, 2,
    "si pe pagina goala, si pe lotul incomplet");
});

test("⚠ `rejected_page` chiar exista in tipul configului", () => {
  /*
   * ⚠ O valoare scrisa intr-un camp pe care tipul nu-l cunoaste trece de `tsc` prin `as never` si
   * pica abia la rulare. Se cere explicit.
   */
  const tipuri = readFileSync("src/lib/aboutyou/types.ts", "utf8");
  assert.match(tipuri, /rejected_page\?: number;/);
});
