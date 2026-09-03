import { strict as assert } from "node:assert";
import { test } from "node:test";
import { GET, raspunsRetras } from "./route";

/*
  ═══ INDEXUL DE SITEMAPURI E RETRAS (03.09.2026) ═══

  Edinio.com indexeaza numai continutul platformei. Storefront-urile merchant
  sunt noindex pe host-ul platformei si devin indexabile doar pe custom domain.

  Deci nu mai exista un index catre sitemapurile magazinelor de pe platforma.
  Proba de aici cade daca cineva il reintroduce — sau daca ruta incepe sa
  raspunda cu altceva decat 410: un 200 gol ar fi luat de Google drept
  „am hotarat sa nu mai am nicio adresa", un redirect drept „s-a mutat".
*/

test("raspunde 410 Gone, fara cache, si isi cere propria scoatere din index", async () => {
  const r = await GET();
  assert.equal(r.status, 410);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.match(r.headers.get("x-robots-tag") ?? "", /noindex/);
});

test("corpul e minimal si NU e un sitemap", async () => {
  const text = await (await GET()).text();
  assert.ok(text.length < 200, "corpul ar trebui sa fie o propozitie, nu un document");
  assert.ok(!text.includes("<sitemapindex"), "s-a intors un index de sitemapuri");
  assert.ok(!text.includes("<urlset"), "s-a intors un sitemap");
  assert.ok(!text.includes("<?xml"), "s-a intors XML");
});

test("nu e redirect catre sitemap.xml", async () => {
  const r = await GET();
  assert.ok(r.status < 300 || r.status >= 400, "ruta redirecteaza");
  assert.equal(r.headers.get("location"), null);
});

test("ruta si raspunsul retras sunt acelasi lucru", async () => {
  const a = await GET();
  const b = raspunsRetras();
  assert.equal(a.status, b.status);
  assert.equal(await a.text(), await b.text());
});
