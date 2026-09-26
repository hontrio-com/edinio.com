import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { sanitizeCss } from "./sanitize-css";
import { inchideCss } from "./cod-personalizat";

/*
  Auditul de securitate al paginilor (26.09.2026).
*/

const INCERCARI = [
  "a{color:red}</style><img src=x onerror=alert(1)>",
  "a{color:red}</sty<!--le><img src=x onerror=alert(1)>",
  "a{color:red}<</style>/style><script>alert(1)</script>",
  "a{color:red}</STYLE\n><svg onload=alert(1)>",
  "a{color:red;</sty<!--le><img src=x onerror=alert(1)>}",
];

test("CSS-ul paginii nu mai poate inchide `<style>`, oricum ar fi despicat", () => {
  for (const x of INCERCARI) {
    const iesit = sanitizeCss(x);
    assert.ok(!iesit.includes("<"), `a ramas un „<” in: ${iesit}`);
  }
});

test("CSS-ul blocului de cod trece prin aceeasi curatare dupa ce e inchis in bloc", () => {
  for (const x of INCERCARI) {
    const iesit = sanitizeCss(inchideCss(x, "#bloc-x"));
    assert.ok(!iesit.includes("<"), `a ramas un „<” in: ${iesit}`);
  }
  const vedere = readFileSync(new URL("../../components/pages/blocks/HtmlBlockView.tsx", import.meta.url), "utf8");
  assert.match(vedere, /sanitizeCss\(inchideCss\(block\.css, scop\)\)/);
});

test("CSS-ul obisnuit ramane neatins, iar `<` din text se afiseaza la fel (escapare CSS)", () => {
  const css = ".x > .y { color: #111; content: \"a\"; }\n@media (min-width: 640px) { .x { padding: 4px } }";
  assert.equal(sanitizeCss(css), css);
  assert.equal(sanitizeCss(".x::before{content:\"<3\"}"), ".x::before{content:\"\\3C 3\"}");
});

test("CSS-ul paginii are plafon si se scrie numai ca text", () => {
  const act = readFileSync(new URL("../actions/page.actions.ts", import.meta.url), "utf8");
  assert.match(act, /patch\.page_css\.length > MAX_CSS_PAGINA/);
  const pub = readFileSync(new URL("../../app/(public)/[slug]/[pageSlug]/page.tsx", import.meta.url), "utf8");
  assert.match(pub, /const pageCss = sanitizeCss\(page\.page_css\)/);
});

test("editorul primeste HTML-ul bogat curatat (text, coloane, coloane in coloane)", async () => {
  const { curataHtmlPentruEditor } = await import("./prepare-blocks");
  const rau = "<p>ok</p><img src=x onerror=alert(1)>";
  const [t, c] = curataHtmlPentruEditor([
    { id: "t", type: "text", html: rau },
    { id: "c", type: "columns", items: [{ html: rau }, { blocks: [{ id: "n", type: "text", html: rau }] }] },
  ] as never) as never as [{ html: string }, { items: [{ html: string }, { blocks: [{ html: string }] }] }];
  for (const h of [t.html, c.items[0].html, c.items[1].blocks[0].html]) {
    assert.ok(!/onerror/i.test(h), h);
    assert.ok(h.includes("<p>ok</p>"), h);
  }
  const editor = readFileSync(new URL("../../app/(dashboard)/dashboard/pages/[pageId]/edit/page.tsx", import.meta.url), "utf8");
  assert.match(editor, /initialBlocks=\{curataHtmlPentruEditor\(/);
});
