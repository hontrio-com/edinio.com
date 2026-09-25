import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/*
 * Permalink-urile (25.09.2026), pe SURSA.
 *
 * Adresa unui produs era scrisa de mana in ~25 de locuri (`${basePath}/product/${slug}`),
 * iar catalogul si brandurile cu constantele fixe. Un loc ramas asa trimite, la un
 * magazin cu alt prefix, o adresa care merge doar prin redirectionare, sau, in
 * sitemap si in feeduri, una pe care Google o raporteaza ca redirectionata.
 * Deci: nicio adresa de vitrina nu se mai compune cu segmentul fix, in afara de
 * modulul care tine regula.
 */

function fisiere(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) fisiere(p, out);
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\./.test(n)) out.push(p);
  }
  return out;
}

const INTERZISE: { re: RegExp; ce: string }[] = [
  { re: /\/product\/\$\{/, ce: "adresa de produs scrisa de mana (foloseste hrefProdus)" },
  { re: /\$\{SEGMENT_MAGAZIN\}/, ce: "prefixul catalogului fix (foloseste prefixele magazinului)" },
  { re: /\$\{SEGMENT_BRAND\}/, ce: "prefixul brandurilor fix (foloseste prefixele magazinului)" },
];

/** Locuri care NU sunt adrese de vitrina: API-urile marketplace-urilor, site-ul platformei. */
const EXCEPTII = [
  /^src\/lib\/storefront\/permalinkuri\.ts$/,
  /^src\/lib\/trendyol\//,
  /^src\/lib\/aboutyou\//,
  /^src\/lib\/website\//,
  /^src\/components\/website\//,
];

export function abateri(sursa: string): { rand: number; ce: string }[] {
  const out: { rand: number; ce: string }[] = [];
  sursa.split(/\r?\n/).forEach((linie, i) => {
    const t = linie.trim();
    if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
    for (const { re, ce } of INTERZISE) if (re.test(linie)) out.push({ rand: i + 1, ce });
  });
  return out;
}

test("nicio adresa de vitrina nu se mai compune cu segmentul fix", () => {
  const radacina = process.cwd();
  const gasite: string[] = [];
  for (const f of fisiere(join(radacina, "src"))) {
    const rel = relative(radacina, f).split(sep).join("/");
    if (EXCEPTII.some((e) => e.test(rel))) continue;
    for (const a of abateri(readFileSync(f, "utf8"))) gasite.push(`${rel}:${a.rand} ${a.ce}`);
  }
  assert.deepEqual(gasite, []);
});

test("detectorul prinde formele vechi, nu si comentariile", () => {
  assert.equal(abateri("const productHref = `${basePath}/product/${product.slug ?? product.id}`;").length, 1);
  assert.equal(abateri("url: `${base}/${SEGMENT_MAGAZIN}/${seg}`,").length, 1);
  assert.equal(abateri("return s ? `${basePath}/${SEGMENT_BRAND}/${s}` : null;").length, 1);
  assert.equal(abateri("  // redirect /product/${uuid}").length, 0);
  assert.equal(abateri("const href = hrefProdus(basePath, p.slug, prefixProdus);").length, 0);
});

test("editorul nu mai poate scrie prefixele: updatePageContent arunca cheia", () => {
  const s = readFileSync("src/lib/actions/store.actions.ts", "utf8");
  assert.match(s, /const \{ permalinks: _permalinksIgnorate, \.\.\.faraPermalinks \} = pageContent;/);
  assert.match(s, /\.\.\.faraPermalinks \};/);
});

test("rutele implicite redirectioneaza, iar captura-tot randeaza prefixul curent", () => {
  const baza = "src/app/(public)/[slug]";
  for (const [fisier, fel] of [
    ["product/[productSlug]/page.tsx", "produs"],
    ["magazin/page.tsx", "magazin"],
    ["magazin/[categorie]/page.tsx", "magazin"],
    ["brand/[brand]/page.tsx", "brand"],
  ] as const) {
    const s = readFileSync(`${baza}/${fisier}`, "utf8");
    assert.match(s, new RegExp(`redirectioneazaDacaPrefixulEAltul\\(slug, "${fel}"`), fisier);
  }
  const rest = readFileSync(`${baza}/[...rest]/page.tsx`, "utf8");
  assert.match(rest, /felulSegmentului\(rest\[0\]/);
  assert.match(rest, /permanentRedirect\(await adresaCurenta\(/);
  const pagina = readFileSync(`${baza}/[pageSlug]/page.tsx`, "utf8");
  assert.match(pagina, /if \(catalog\?\.curent\) return RandeazaMagazin/);
});
