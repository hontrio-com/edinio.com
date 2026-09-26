import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { ultimele30Zile } from "./statistici-formulare";
import { coboaraH1, prepareBlocksForPublic } from "./prepare-blocks";

/*
  Auditul final al paginilor (26.09.2026): regulile gasite atunci, fiecare cu proba ei.
*/

test("statisticile: 30 de zile calendaristice distincte, si peste schimbarea orei din octombrie", () => {
  const zile = ultimele30Zile(Date.parse("2026-10-30T10:00:00Z"));
  assert.equal(zile.length, 30);
  assert.equal(new Set(zile).size, 30, "o zi numarata de doua ori");
  assert.equal(zile[0], "2026-10-01");
  assert.equal(zile[29], "2026-10-30");
  // Seara tarziu in Romania, dimineata in UTC: „azi” e ziua Romaniei.
  assert.equal(ultimele30Zile(Date.parse("2026-09-26T22:30:00Z"))[29], "2026-09-27");
  const src = readFileSync(new URL("./statistici-formulare.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /\.limit\(5000\)/, "PostgREST taie tacut la 1000");
  assert.match(src, /ultimele30: peZile\.reduce/, "cifra si barele numara aceleasi zile");
});

test("„Titlu mare” dintr-un text nu mai face un al doilea H1 pe pagina publica", () => {
  assert.equal(coboaraH1("<h1>A</h1><h1 class=\"x\">B</h1><h10>"), "<h2 data-h1=\"\">A</h2><h2 data-h1=\"\" class=\"x\">B</h2><h10>");
  const [t] = prepareBlocksForPublic([{ id: "t", type: "text", html: "<h1>Titlu</h1><p>x</p>" }] as never) as never as [{ html: string }];
  assert.ok(!/<h1/i.test(t.html), t.html);
});

test("editorul si pagina aseaza coloanele cu aceeasi functie", () => {
  const editor = readFileSync(new URL("../../components/pages/PageBuilder.tsx", import.meta.url), "utf8");
  const pagina = readFileSync(new URL("../../components/pages/blocks/StaticBlocks.tsx", import.meta.url), "utf8");
  assert.match(editor, /const a = asezareColoane\(block\)/);
  assert.match(pagina, /const a = asezareColoane\(block\)/);
});

test("adresa schimbata a unei pagini muta si intrarea din meniu", () => {
  const act = readFileSync(new URL("../actions/page.actions.ts", import.meta.url), "utf8");
  assert.match(act, /if \(nextSlug !== page\.slug\) await mutaPaginaInMeniu\(/);
  assert.doesNotMatch(act, /export async function mutaPaginaInMeniu/, "\"use server\": un export ar fi un capat public");
});

test("un formular nu poate trimite de pe o pagina nepublicata sau a altui magazin", () => {
  const act = readFileSync(new URL("../actions/page.actions.ts", import.meta.url), "utf8");
  const f = act.slice(act.indexOf("export async function submitPageForm"), act.indexOf("export async function aboneazaNewsletter"));
  assert.match(f, /\.eq\("id", input\.pageId\)\.eq\("business_id", biz\.id\)\.maybeSingle\(\)/);
  assert.match(f, /if \(!data \|\| !data\.is_published\) return \{ error:/);
});

test("incarcarea de imagini verifica destinatia la rulare si are limita", () => {
  const src = readFileSync(new URL("../actions/upload.actions.ts", import.meta.url), "utf8");
  const f = src.slice(src.indexOf("export async function uploadImage"), src.indexOf("export async function createVideoUpload"));
  assert.match(f, /GALETI as readonly string\[\]\)\.includes\(bucket\)/);
  assert.match(f, /rateLimit\(`imagine:\$\{user\.id\}`/);
  assert.match(f, /consumaLimita\(`imagine:\$\{user\.id\}`/);
});
