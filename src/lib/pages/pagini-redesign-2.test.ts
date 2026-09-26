import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { cereIzolare, inchideCss } from "./cod-personalizat";
import { sugestiiSeo } from "./sugestii-seo";
import { curataSeoPagina } from "./pagina-seo";
import { prepareBlocksForPublic } from "./prepare-blocks";
import { createBlock, BLOCK_META, BLOCURI_INTEGRARI, BLOCK_PALETTE_ORDER, type Block } from "./blocks.types";
import { esteTipCamp, FORM_FIELD_TYPES } from "./forms.types";

/*
  A doua trecere prin Pagini (25.09.2026): beneficii, pachete, cod personalizat,
  SEO, blocuri din integrari, formulare.
*/

test("codul activ ruleaza izolat: JS, <script>, formulare, on...= (un widget lipit nu se mai curata tacut)", () => {
  assert.equal(cereIzolare("<p>salut</p>", ""), false);
  assert.equal(cereIzolare("<p>x</p>", "alert(1)"), true);
  assert.equal(cereIzolare('<script src="https://x.ro/w.js"></script>', ""), true);
  assert.equal(cereIzolare("<form><input name=e></form>", ""), true);
  assert.equal(cereIzolare('<img src=x onerror="alert(1)">', ""), true);
  assert.equal(cereIzolare("<div class=\"onboarding\">x</div>", ""), false, "„on” din interiorul unui cuvant nu e un handler");
});

test("codul activ ajunge INTREG la cadrul izolat, iar HTML-ul simplu se curata", () => {
  const [izolat, simplu] = prepareBlocksForPublic([
    { id: "a", type: "html", html: '<script>alert(1)</script><p>x</p>' },
    { id: "b", type: "html", html: '<p>ok</p><iframe src="https://rau.ro"></iframe>' },
  ]);
  assert.match(izolat.type === "html" ? izolat.html ?? "" : "", /<script>/);
  assert.doesNotMatch(simplu.type === "html" ? simplu.html ?? "" : "", /rau\.ro/);
});

test("CSS-ul blocului de cod se inchide in bloc, cu @keyframes/@font-face lasate afara", () => {
  const css = inchideCss("/* c */ .titlu{color:red} body{margin:0} @media (max-width:600px){.a{b:c}} @keyframes x{from{opacity:0}to{opacity:1}} @font-face{font-family:F;src:url(a.woff2)}", '[data-cod="b1"]');
  assert.match(css, /^@keyframes x\{from\{opacity:0\}to\{opacity:1\}\}/);
  assert.match(css, /@font-face\{font-family:F;src:url\(a\.woff2\)\}/);
  assert.match(css, /\[data-cod="b1"\] \{\n\.titlu\{color:red\}\n &\{margin:0\}\n@media \(max-width:600px\)\{\.a\{b:c\}\}\n\}$/);
  assert.equal(inchideCss("  ", "[x]"), "");
  assert.doesNotMatch(inchideCss('.a{content:"}"} .b{c:d}', "[x]"), /^\.b/, "acolada din sir nu inchide regula");
});

test("in editor, blocul de cod ruleaza MEREU izolat (nu in panou)", () => {
  const src = readFileSync(new URL("../../components/pages/blocks/HtmlBlockView.tsx", import.meta.url), "utf8");
  assert.match(src, /if \(preview \|\| cereIzolare\(block\.html, block\.js\)\)/);
  const r = readFileSync(new URL("../../components/pages/BlockRenderer.tsx", import.meta.url), "utf8");
  assert.match(r, /<HtmlBlockView block=\{block\} preview=\{ctx\.preview\} \/>/);
});

test("SEO: campurile noi trec pe lista alba; canonica doar http(s)", () => {
  const s = curataSeoPagina({ focusKeyword: "  lampi  ", canonical: "javascript:alert(1)", ogTitle: "x".repeat(200), nofollow: "da" as never });
  assert.equal(s.focusKeyword, "lampi");
  assert.equal(s.canonical, undefined);
  assert.equal(s.ogTitle?.length, 120);
  assert.equal(s.nofollow, undefined);
  assert.equal(curataSeoPagina({ canonical: "https://magazin.ro/original" }).canonical, "https://magazin.ro/original");
});

test("sugestii SEO: lipsa H1, descriere, alt si cuvantul cheie se spun; pagina buna ia scor mare", () => {
  const goala = sugestiiSeo({ title: "X", slug: "x", seo: {}, blocks: [] });
  assert.ok(goala.sugestii.some((s) => s.nivel === "problema" && /titlu/.test(s.text)));
  assert.ok(goala.scor < 50);

  const text = "<p>" + "Lampadare din lemn aduc lumina calda in casa. ".repeat(20) + '<a href="/magazin">vezi</a></p>';
  const buna: Block[] = [
    { id: "h", type: "heading", text: "Lampadare din lemn", level: 1 },
    { id: "t", type: "text", html: text },
    { id: "i", type: "image", src: "https://x.ro/a.jpg", alt: "Lampadar" },
  ];
  const r = sugestiiSeo({
    title: "Lampadare din lemn", slug: "lampadare-din-lemn",
    seo: { title: "Lampadare din lemn lucrate manual | Casa Lumen", description: "Lampadare din lemn masiv, lucrate manual in atelierul nostru din Bucuresti, cu livrare in 1-3 zile.", ogImage: "https://x.ro/o.jpg", focusKeyword: "lampadare din lemn" },
    blocks: buna,
  });
  assert.equal(r.sugestii.filter((s) => s.nivel !== "bine").length, 0, JSON.stringify(r.sugestii));
  assert.equal(r.scor, 100);
  const faraAlt = sugestiiSeo({ title: "x", slug: "x", seo: {}, blocks: [{ id: "i", type: "image", src: "https://x.ro/a.jpg" }] });
  assert.ok(faraAlt.sugestii.some((s) => /text alternativ/.test(s.text) && s.nivel === "atentie"));
});

test("blocul de produse nou are „Adauga in cos” pornit; unul vechi cu `false` ramane oprit", () => {
  const b = createBlock("products");
  assert.equal(b.type === "products" && b.showAddToCart, true);
  const src = readFileSync(new URL("../../components/pages/blocks/ProductsBlock.tsx", import.meta.url), "utf8");
  assert.match(src, /block\.showAddToCart !== false/);
});

test("blocurile noi au metadate; cele de integrari nu stau in paleta obisnuita", () => {
  for (const t of ["bundles", "newsletter", "payments", "couriers"] as const) assert.ok(BLOCK_META[t], t);
  assert.ok(BLOCK_PALETTE_ORDER.includes("bundles"));
  for (const t of BLOCURI_INTEGRARI) assert.ok(!BLOCK_PALETTE_ORDER.includes(t), `${t} ar aparea de doua ori`);
});

test("newsletter: acordul e cerut pe server, iar setarile se citesc din blocul salvat", () => {
  const src = readFileSync(new URL("../actions/page.actions.ts", import.meta.url), "utf8");
  const f = src.slice(src.indexOf("export async function aboneazaNewsletter"));
  assert.match(f, /if \(input\.acord !== true\) return \{ error:/);
  assert.match(f, /findRawBlockById\(/);
  assert.match(f, /block\.type !== "newsletter"/);
  assert.match(f, /rateLimit\(`newsletter:\$\{ip\}`/);
});

test("imaginile proprii din beneficii si din newsletter: numai http(s)", () => {
  const [t, n] = prepareBlocksForPublic([
    { id: "t", type: "trust", items: [{ icon: "Star", title: "a", desc: "b", image: "javascript:x" }, { icon: "Star", title: "a", desc: "b", image: "https://x.ro/i.svg" }] },
    { id: "n", type: "newsletter", image: "data:text/html,1" },
  ]);
  assert.deepEqual(t.type === "trust" && t.items!.map((i) => i.image), [null, "https://x.ro/i.svg"]);
  assert.equal(n.type === "newsletter" && n.image, null);
});

test("tipurile de camp: lista si garda se potrivesc, iar serverul le trece prin garda", () => {
  for (const t of FORM_FIELD_TYPES) assert.ok(esteTipCamp(t.value));
  assert.equal(esteTipCamp("script"), false);
  const src = readFileSync(new URL("../actions/form.actions.ts", import.meta.url), "utf8");
  assert.match(src, /type: esteTipCamp\(f\.type\) \? f\.type : "text"/);
});
