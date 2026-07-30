import assert from "node:assert/strict";
import { test } from "node:test";
import { politicaIndexabila, politiciIndexabile, TIPURI_POLITICI } from "./policy-index";

/**
 * Regula are teste fiindca o citesc TREI locuri — pagina, sitemapul per magazin
 * si cel de pe domeniu propriu — iar o nepotrivire intre ele da exact semnalul pe
 * care Search Console il raporteaza ca eroare: pagina spune `noindex`, sitemapul
 * o listeaza.
 */

test("implicit, toate cele sase politici sunt indexabile", () => {
  assert.deepEqual(politiciIndexabile(null, null), TIPURI_POLITICI.map((p) => p.tip));
});

test("noindex-ul de magazin le acopera pe toate", () => {
  assert.deepEqual(politiciIndexabile({ seo: { noindex: true } }, null), []);
});

test("o politica scoasa anume din Setari nu mai intra", () => {
  const pc = { seo: { politiciNoindex: ["gdpr"] } };
  assert.equal(politicaIndexabila(pc, null, "gdpr"), false);
  assert.equal(politicaIndexabila(pc, null, "retur"), true);
});

test("o politica stinsa din editor nu intra, chiar nebifata din Setari", () => {
  const politici = { return: { content: "<p>Text</p>", enabled: false } };
  assert.equal(politicaIndexabila(null, politici, "retur"), false);
});

test("continut gol NU inseamna pagina goala: sablonul generat o umple", () => {
  assert.equal(politicaIndexabila(null, { return: "" }, "retur"), true);
  assert.equal(politicaIndexabila(null, {}, "retur"), true);
});

test("un tip inexistent nu se indexeaza", () => {
  assert.equal(politicaIndexabila(null, null, "inventat"), false);
});
