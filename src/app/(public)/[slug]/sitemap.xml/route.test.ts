import { strict as assert } from "node:assert";
import { test } from "node:test";
import { GET } from "./route";

/*
  ═══ SITEMAPUL DE MAGAZIN PE PLATFORMA E RETRAS (03.09.2026) ═══

  Edinio.com indexeaza numai continutul platformei. Storefront-urile merchant
  sunt noindex pe host-ul platformei si devin indexabile doar pe custom domain.

  Un magazin fara domeniu propriu NU are sitemap SEO. Adresa veche,
  `www.edinio.com/{slug}/sitemap.xml`, raspunde 410 pentru orice slug — fara
  nicio citire din baza, deci nu poate nici sa iasa „goala cu 200" cand cade o
  citire. Magazinul cu domeniu e trimis de proxy catre domeniul lui inainte sa
  ajunga aici, iar sitemapul lui traieste la `https://domeniul-lui/sitemap.xml`.
*/

test("raspunde 410 Gone pentru un magazin fara domeniu propriu", async () => {
  const r = await GET();
  assert.equal(r.status, 410);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.match(r.headers.get("x-robots-tag") ?? "", /noindex/);
});

test("nu e un sitemap gol cu 200 si nu e redirect", async () => {
  const r = await GET();
  const text = await r.text();
  assert.notEqual(r.status, 200);
  assert.ok(!text.includes("<urlset"), "s-a intors un sitemap");
  assert.ok(!text.includes("<?xml"), "s-a intors XML");
  assert.equal(r.headers.get("location"), null);
});

test("ruta nu mai are nevoie de slug: raspunde la fel pentru oricare", async () => {
  /* `GET` nu mai citeste `params`. Daca ar incepe din nou sa citeasca baza dupa
     slug, semnatura ei s-ar schimba si randul de mai jos ar cadea la typecheck. */
  const fara: () => Promise<Response> = GET;
  assert.equal((await fara()).status, 410);
});
