import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { temaDupaCheie } from "../teme";

/*
 * Etapa 22 din `docs/editor-magazin/PLAN.md`, mentiunile lui: faviconul demo-ului nu se vedea (sigla lata, in cei 16 px ai
 * tabului), iar „Adauga in cos” nu parea buton (sageata in loc de mana, hover aproape invizibil).
 */

const tema = temaDupaCheie("jupiter")!;
const FAVICON = String(tema.setariDemo.favicon_url);
const fisierFavicon = join("public", FAVICON);

/** Codul fara comentarii. */
function cod(cale: string): string {
  return readFileSync(cale, "utf8").replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

test("1. faviconul demo-ului e al lui: patrat, PNG (Safari nu arata WebP), transparent pentru taburile inchise", async () => {
  assert.equal(FAVICON, "/teme/jupiter/favicon.png");
  assert.notEqual(FAVICON, tema.siglaDemo, "sigla intreaga e de 4,7 ori mai lata decat inalta");
  const m = await sharp(fisierFavicon).metadata();
  assert.deepEqual([m.width, m.height, m.format, m.hasAlpha], [192, 192, "png", true]);
});

test("1. simbolul umple patratul: cu margini, la 16 px ramanea o bila de 9 px", async () => {
  const { data, info } = await sharp(fisierFavicon).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let stanga = info.width, dreapta = -1, sus = info.height, jos = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * info.channels + 3] <= 32) continue;
      stanga = Math.min(stanga, x); dreapta = Math.max(dreapta, x);
      sus = Math.min(sus, y); jos = Math.max(jos, y);
    }
  }
  assert.ok(dreapta - stanga + 1 >= 0.95 * info.width, `latimea simbolului: ${dreapta - stanga + 1} din ${info.width}`);
  assert.ok(jos - sus + 1 >= 0.9 * info.height, `inaltimea simbolului: ${jos - sus + 1} din ${info.height}`);
});

test("1. magazinul pune faviconul inaintea siglei, iar tema nu-l duce la comercianti", () => {
  assert.match(cod("src/app/(public)/[slug]/layout.tsx"), /\?\.favicon_url \|\| data\.logo_url;/);
  assert.doesNotMatch(cod("src/lib/actions/store-design.actions.ts"), /setariDemo/);
});

test("2. orice buton activ din magazin are mana, cele oprite nu, iar o clasa scrisa anume bate regula", () => {
  const css = readFileSync("src/app/stil-comun.css", "utf8").replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "");
  const baza = css.slice(css.indexOf("@layer base {"), css.indexOf("@layer utilities {"));
  assert.match(baza, /\[data-store-theme\] button:not\(:disabled\),\s*\[data-store-theme\] \[role="button"\]:not\(\[aria-disabled="true"\]\) \{\s*cursor: pointer;\s*\}/);
  assert.match(cod("src/components/storefront/StorefrontThemeScope.tsx"), /data-store-theme=""/, "radacina magazinului poarta semnul");
});

test("2. butonul de pe cardul Jupiter se schimba vizibil sub mouse, doar cand e activ", () => {
  const c = cod("src/components/storefront/product/ProductCardJupiter.tsx");
  assert.match(c, /enabled:hover:brightness-\[0\.88\] enabled:hover:shadow-\[0_3px_10px_rgba\(0,0,0,0\.22\)\] enabled:active:brightness-\[0\.8\]/);
  assert.match(c, /transition-\[filter,box-shadow\]/);
  assert.doesNotMatch(c, /hover:opacity-95/, "95% nu se vede");
  assert.match(c, /disabled:opacity-40 disabled:cursor-not-allowed/);
});
