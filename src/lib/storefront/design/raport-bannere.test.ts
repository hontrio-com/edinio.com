import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CHEIE_MARIMI_BANNERE, marimeBanner, resolveHeroBanners } from "./hero-banners";
import { LIMITE_RAPORT, potrivireaPozei, raportDin, raportulLocului } from "./raport-bannere";

/*
 * 13.11.2026: la eSafe (tema Jupiter, hero „carduri”), bannerele de 1600 x 900 se taiau in locul de 2,14:1. Regula noua:
 * locul ia raportul primului banner, intre limitele designului, iar o poza cu alt raport se arata intreaga.
 * Cifrele din probe sunt cele din productie, de pe 13.11 (Biblioteca Media).
 */

const cod = (cale: string) => readFileSync(cale, "utf8").replace(/\r\n/g, "\n");

test("eSafe: 16:9 in hero-ul cu carduri -> locul devine 16:9, poza umple locul, nimic taiat", () => {
  const r = raportDin([1600, 900]);
  const loc = raportulLocului(r, LIMITE_RAPORT.carduri);
  assert.ok(loc && Math.abs(loc - 16 / 9) < 1e-9);
  assert.equal(potrivireaPozei(r, loc), "cover");
});

test("VetDepo (okxi): bannerele facute pe 2,14:1 raman exact cum erau", () => {
  const r = raportDin([1600, 748]);
  const loc = raportulLocului(r, LIMITE_RAPORT.carduri);
  assert.ok(loc && Math.abs(loc - 1600 / 748) < 1e-9);
  assert.equal(potrivireaPozei(r, loc), "cover");
});

test("limitele designului: prea inalt sau prea lat -> locul se opreste la limita, iar poza se arata intreaga", () => {
  // Un banner patrat in hero-ul cu carduri ar fi lungit pagina cat un ecran.
  assert.equal(raportulLocului(1, LIMITE_RAPORT.carduri), 4 / 3);
  assert.equal(potrivireaPozei(1, 4 / 3), "contain");
  // Mai lat de 2,25:1, bannerul ar fi fost mai scund decat cele doua carduri de alaturi.
  assert.equal(raportulLocului(5, LIMITE_RAPORT.carduri), 2.25);
  assert.equal(potrivireaPozei(5, 2.25), "contain");
  // Categorii: bara sta pe inaltimea bannerului, deci locul nu devine mai scund decat 16:9 (mokka: 2,43:1).
  assert.equal(raportulLocului(1600 / 659, LIMITE_RAPORT.categorii), 16 / 9);
  assert.equal(potrivireaPozei(1600 / 659, 16 / 9), "contain");
  // ... dar poate deveni mai inalt (3:2 ramane 3:2).
  assert.equal(raportulLocului(1.5, LIMITE_RAPORT.categorii), 1.5);
  // Caruselul clasic: alexshop, primul banner 3:2, al patrulea 2:1 -> locul 3:2, al patrulea intreg.
  const locAlex = raportulLocului(1536 / 1024, LIMITE_RAPORT.carusel);
  assert.equal(locAlex, 1.5);
  assert.equal(potrivireaPozei(1536 / 1024, locAlex), "cover");
  assert.equal(potrivireaPozei(2, locAlex), "contain");
});

test("toleranta: sub 2% diferenta poza umple locul; fara raport cunoscut, ca pana acum (`cover`, locul din clasa)", () => {
  assert.equal(potrivireaPozei(1600 / 893, 16 / 9), "cover"); // bricosmart, 0,8%
  assert.equal(potrivireaPozei(1.6, 16 / 9), "contain"); // 10%
  assert.equal(potrivireaPozei(null, 16 / 9), "cover");
  assert.equal(potrivireaPozei(1.5, null), "cover");
  assert.equal(raportulLocului(null, LIMITE_RAPORT.carduri), null);
  assert.equal(raportulLocului(Number.NaN, LIMITE_RAPORT.carduri), null);
  assert.equal(raportDin(null), null);
  assert.equal(raportDin([0, 900]), null);
});

test("marimile din `page_content` se aliniaza cu bannerele, dupa aceeasi filtrare ca linkurile", () => {
  const pc = {
    hero_banners: ["https://cdn.ro/a.webp", "", 7, "https://cdn.ro/b.webp", "https://cdn.ro/c.webp"],
    hero_banner_links: ["/a", "/gol", "/sapte", "/b", "/c"],
    [CHEIE_MARIMI_BANNERE]: {
      "https://cdn.ro/a.webp": [1600, 900],
      "https://cdn.ro/b.webp": [1600.5, 900], // nu e intreg
      "https://cdn.ro/nefolosit.webp": [10, 10],
    },
  };
  const r = resolveHeroBanners(pc);
  assert.deepEqual(r.banners, ["https://cdn.ro/a.webp", "https://cdn.ro/b.webp", "https://cdn.ro/c.webp"]);
  assert.deepEqual(r.links, ["/a", "/b", "/c"]);
  assert.deepEqual(r.marimi, [[1600, 900], null, null]);
});

test("coperta veche (fara bannere) isi primeste si ea marimea; fara harta, toate `null`", () => {
  const r = resolveHeroBanners({ [CHEIE_MARIMI_BANNERE]: { "https://cdn.ro/coperta.webp": [1200, 400] } }, "https://cdn.ro/coperta.webp");
  assert.deepEqual(r.marimi, [[1200, 400]]);
  assert.deepEqual(resolveHeroBanners({ hero_banners: ["https://cdn.ro/a.webp"] }).marimi, [null]);
});

test("harta se citeste doar pe cheile ei: un banner numit `constructor` nu ia nimic din prototip", () => {
  const r = resolveHeroBanners({ hero_banners: ["constructor", "toString"], [CHEIE_MARIMI_BANNERE]: {} });
  assert.deepEqual(r.marimi, [null, null]);
  assert.deepEqual(resolveHeroBanners({ hero_banners: ["x"], [CHEIE_MARIMI_BANNERE]: [[1, 1]] }).marimi, [null]);
  for (const rau of ["1600x900", [1600], [1600, 900, 1], [-1, 900], [1600, 0], [30000, 900], null, {}]) {
    assert.equal(marimeBanner(rau), null, JSON.stringify(rau));
  }
});

test("cablajul: cele trei carusele de bannere isi potrivesc locul, fiecare cu limitele lui", () => {
  const b = cod("src/components/storefront/sections/hero/HeroBanners.tsx");
  assert.match(b, /<BannerSlider banners=\{banners\} links=\{links\} alt=\{alt\} basePath=\{basePath\} marimi=\{marimi\} limiteRaport=\{LIMITE_RAPORT\.carusel\} \/>/);
  // Locul primeste raportul ca stil, iar poza se aseaza dupa regula, nu mereu `object-cover`.
  assert.match(b, /<div key=\{i\} className=\{slot\} style=\{raportLoc \? \{ aspectRatio: String\(raportLoc\) \} : undefined\}>/);
  assert.match(b, /className=\{`w-full h-full \$\{potrivireaPozei\(rapoarte\[i\], raportLoc\) === "contain" \? "object-contain" : "object-cover"\}`\}/);
  // Bannerele demo incadrate pe telefon raman pe locul lor.
  assert.match(b, /const adaptiv = !!limiteRaport && !incadrari\.some\(Boolean\);/);
  // Ce a dat serverul castiga peste ce se masoara in browser.
  assert.match(b, /raportDin\(marimi\?\.\[i\]\) \?\? masurate\[src\] \?\? null/);

  const c = cod("src/components/storefront/sections/hero/HeroCuCarduri.tsx");
  assert.match(c, /const \{ banners, links, marimi \} = resolveHeroBanners\(/);
  assert.match(c, /marimi=\{marimi\} limiteRaport=\{LIMITE_RAPORT\.carduri\} \/>/);
  const k = cod("src/components/storefront/sections/hero/HeroCategories.tsx");
  assert.match(k, /const \{ banners, links, marimi \} = resolveHeroBanners\(/);
  assert.match(k, /limiteRaport=\{LIMITE_RAPORT\.categorii\}/);
  const o = cod("src/components/storefront/sections/hero/HeroBannersOnly.tsx");
  assert.match(o, /<HeroBanners banners=\{banners\} links=\{links\} alt=\{nume\} basePath=\{basePath\} marimi=\{marimi\} \/>/);
});

test("pagina principala trimite browserului `page_content` cu marimile alaturi", () => {
  const p = cod("src/app/(public)/[slug]/page.tsx");
  // Fara cerere la magazinul „un singur produs”: pagina lui principala e produsul.
  assert.match(p, /const pcPentruRandare = parseStoreMode\(\(storeSettings\?\.page_content as Json\) \?\? null\)\.mode === "one_product"\s*\? Promise\.resolve\(null\)\s*: cuMarimileBannerelor\(\s*business\.id,/);
  assert.match(p, /\)\.catch\(\(\) => null\);/);
  assert.match(p, /storeSettings=\{setariDeRandat\}/);
  // Catalogul nu mai primeste varianta fara marimi; ramura „un singur produs” (`as never`) n-are hero, deci ramane cum era.
  assert.equal((p.match(/storeSettings=\{setariDeTrimis\}/g) ?? []).length, 0);
});

test("editorul recomanda marimea dupa designul hero-ului, nu „16:9” la orice design", () => {
  const a = cod("src/components/editor-magazin/continut/ContinutAcasa.tsx");
  assert.match(a, /if \(varianta === "carduri"\) \{\s*return "Se afișează întreg, la proporția primului banner\. Arată cel mai bine la 2,14:1/);
  assert.match(a, /<p className="text-\[10px\] text-muted-foreground">\{sfatMarimeBanner\(varianta\)\}<\/p>/);
  assert.match(cod("src/components/editor-magazin/continut/ContinutNod.tsx"), /<ContinutHero continut=\{continut\} varianta=\{sectiune\.variant\} \/>/);
});
