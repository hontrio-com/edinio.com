import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildClassicDesign } from "./defaults";
import { parseStoreDesign } from "./parse";
import { variantMeta } from "./registry";
import { claseGrila, COLOANE_RAND, coloaneEfective, coloaneRand, latimeCardCarusel } from "./coloane-rand";
import type { DesignContext } from "./types";

/*
 * „Produse pe rând” (13.11.2026, cerut de el: „sa poti selecta cate produse sa se vada pe rand”). Proba apara doua
 * lucruri: „Automat” e EXACT ce era (nimeni nu se schimba pana nu alege), iar alegerea ajunge de la editor la magazin.
 */

const cod = (cale: string) => readFileSync(cale, "utf8").replace(/\r\n/g, "\n");
const ctx: DesignContext = { primaryColor: "#07c527", pageContent: { show_featured_section: true }, features: {} };

test("„Automat” (cheia lipsa, „auto”, orice altceva) = clasele de dinainte, la grila si la carusel", () => {
  for (const v of [undefined, null, "auto", "", "1", "7", "3.5", 4.5, "x"]) assert.equal(coloaneRand(v), null, String(v));
  assert.equal(claseGrila(null, false), "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4");
  assert.equal(claseGrila(null, true), "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5");
  assert.equal(latimeCardCarusel(null, false), "w-[44%] sm:w-[30%] lg:w-[23%]");
  assert.equal(latimeCardCarusel(null, true), "w-[44%] sm:w-[30%] lg:w-[calc((100%-4rem)/5)]");
  assert.equal(coloaneEfective(null, false), 4);
  assert.equal(coloaneEfective(null, true), 5);
});

test("2-6 pe calculator: grila are exact atatea coloane (6 abia de la 1280 px), caruselul arata atatea carduri intregi", () => {
  for (const n of COLOANE_RAND) {
    assert.equal(coloaneRand(String(n)), n);
    assert.equal(coloaneRand(n), n);
    // Alegerea bate panoul gri.
    assert.equal(coloaneEfective(n, true), n);
    const g = claseGrila(n, false);
    assert.equal(g, claseGrila(n, true));
    assert.match(g, /^grid-cols-2\b/, "pe telefon raman 2");
    const ultima = n === 6 ? "xl:grid-cols-6" : n === 2 ? "grid-cols-2" : n === 3 ? "sm:grid-cols-3" : `lg:grid-cols-${n}`;
    assert.ok(g.endsWith(ultima), `${n}: ${g}`);
    // Intre carduri 1rem: N carduri = (100% - (N-1) rem) / N.
    assert.ok(latimeCardCarusel(n, false).includes(`w-[calc((100%-${n - 1}rem)/${n})]`), `${n}: ${latimeCardCarusel(n, false)}`);
    assert.ok(latimeCardCarusel(n, false).startsWith("w-[44%]"), "pe telefon ~2,2 carduri, ca sa se vada ca mai urmeaza");
  }
});

test("registrul: ambele variante ale randului au campul, cu „Automat” primul si toate valorile intelese", () => {
  for (const v of ["grid", "carousel"]) {
    const camp = variantMeta("product_row", v)?.fields.find((f) => f.key === "coloane");
    assert.ok(camp && camp.type === "select", v);
    if (camp.type !== "select") continue;
    // Primul e cel aratat cand cheia lipseste (`SectionSettings`): trebuie sa fie „Automat”.
    assert.equal(camp.options[0].value, "auto");
    assert.deepEqual(camp.options.slice(1).map((o) => coloaneRand(o.value)), [...COLOANE_RAND]);
  }
});

test("parserul pastreaza alegerea si arunca valorile necunoscute (designul publicat trece prin el la fiecare citire)", () => {
  const baza = buildClassicDesign(ctx);
  const cu = (coloane: unknown) => ({
    ...baza,
    home: baza.home.map((s) => (s.id === "featured" ? { ...s, settings: { ...s.settings, coloane } } : s)),
  });
  const ales = parseStoreDesign(cu("3"), ctx).home.find((s) => s.id === "featured");
  assert.equal(ales?.settings.coloane, "3");
  assert.equal(ales?.settings.mode, "featured", "legatura randului nu se pierde");
  const rau = parseStoreDesign(cu("9"), ctx).home.find((s) => s.id === "featured");
  assert.equal("coloane" in (rau?.settings ?? {}), false);
});

test("cablajul: dispecerul trimite alegerea ambelor randuri, iar randul o foloseste la grila si la carusel", () => {
  const r = cod("src/components/storefront/SectionRenderer.tsx");
  assert.match(r, /<FeaturedRowClassic prioritate=\{estePrima\} banda=\{section\.settings\.banda === true\} coloane=\{coloaneRand\(section\.settings\.coloane\)\} \/>/);
  assert.match(r, /banda=\{section\.settings\.banda === true\} coloane=\{coloaneRand\(section\.settings\.coloane\)\} \/>/);
  const p = cod("src/components/storefront/sections/products/ProductRowClassic.tsx");
  assert.equal((p.match(/className=\{`grid \$\{claseGrila\(coloane, (true|false)\)\} gap-3 sm:gap-4`\}/g) ?? []).length, 2);
  assert.match(p, /className=\{`snap-start shrink-0 \$\{latimeCardCarusel\(coloane, banda\)\}`\}/);
  // Nicio grila sau latime de card scrisa de mana ramasa in urma.
  assert.doesNotMatch(p, /"grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-[45]/);
  assert.doesNotMatch(p, /lg:w-\[23%\]/);
  assert.equal((p.match(/coloane=\{coloane\}/g) ?? []).length, 4, "ambele carusele si ambele randuri dau alegerea mai departe");
});
