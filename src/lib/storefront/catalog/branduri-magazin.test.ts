import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  dateStructurateBrand, descriereBrand, filtruJetonBrand, jetonBrand, metadataPaginiiBrand, potrivesteBrand, type BrandMagazin,
} from "./branduri-magazin";
import { caleBrand, legaturaBrand, segmentBrand } from "@/lib/storefront/brand-href";
import { jeton, perechileProdusului } from "./facets";
import { intrariMagazin } from "@/app/sitemap";
import { isReservedSlug } from "@/lib/pages/reserved-slugs";
import { DESIGN_VERSION } from "@/lib/storefront/design/types";

/*
 * Paginile de brand din magazin (`/brand/<segment>`): pagina de catalog filtrata pe
 * jetonul `brand`, cu logo si descriere. Probele apara regulile, nu cablarea:
 * jetonul e CHIAR cel al proiectorului, pagina fara produse nu se indexeaza si nu
 * intra in sitemap, iar legatura de pe produs apare numai unde exista catalog.
 */

const sursa = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").replace(/\r\n/g, "\n");

const brand = (nume: string, produse: number, extra: Partial<BrandMagazin> = {}): BrandMagazin =>
  ({ nume, produse, logo: null, descriere: null, segment: segmentBrand(nume), ...extra });

/* ─────────────── segmentul si jetonul ─────────────── */

test("⚠⚠ jetonul paginii e EXACT cel scris de proiector, si cu spatii duble in nume", () => {
  /* Altfel pagina ar filtra pe un jeton pe care nu-l poarta niciun produs: grila goala, fara eroare. */
  for (const nume of ["Portwest", "Port   west", "  Țesătoria Argeș "]) {
    const perechi = perechileProdusului({ id: "p", page_sections: { google: { brand: nume } } });
    const alProiectorului = perechi.filter((p) => p.cheie === "brand").map((p) => jeton(p.cheie, p.valoare));
    assert.deepEqual(alProiectorului, [jetonBrand(nume)], nume);
  }
});

test("⚠⚠ filtrul din browser e un literal de vector CU GHILIMELE (virgula nu rupe brandul)", () => {
  /* postgrest-js ar fi scris `cs.{brand\u0001Dolce, Gabbana}`: doua elemente, pagina goala. */
  assert.equal(filtruJetonBrand("Dolce, Gabbana"), `{"brand\u0001Dolce, Gabbana"}`);
  assert.equal(filtruJetonBrand('Say "Hi"'), `{"brand\u0001Say \\"Hi\\""}`);
  assert.equal(filtruJetonBrand("A\\B"), `{"brand\u0001A\\\\B"}`);
  assert.equal(filtruJetonBrand("Port   west"), `{"brand\u0001Port west"}`, "aceeasi forma ca jetonul");
});

test("segmentul e numele slugificat, ca la categorii (diacritice, majuscule)", () => {
  assert.equal(segmentBrand("Țesătoria Argeș"), "tesatoria-arges");
  assert.equal(segmentBrand("ARMAF"), "armaf");
  assert.equal(caleBrand("/casa-lumen", "Casa Lumen"), "/casa-lumen/brand/casa-lumen");
  assert.equal(caleBrand("", "Casa Lumen"), "/brand/casa-lumen", "pe domeniu propriu basePath e gol");
  assert.equal(caleBrand("/x", "!!!"), null);
});

test("potrivesteBrand: prima din lista castiga (lista vine ordonata dupa produse vizibile)", () => {
  const lista = [brand("Armaf", 3), brand("ARMAF", 1), brand("Portwest", 9)];
  assert.equal(potrivesteBrand(lista, "armaf")?.nume, "Armaf");
  assert.equal(potrivesteBrand(lista, "ARMAF")?.nume, "Armaf");
  assert.equal(potrivesteBrand(lista, "nu-exista"), null);
  assert.equal(potrivesteBrand(lista, ""), null);
});

test("⚠ legatura de pe produs apare NUMAI cand magazinul are pagina de catalog", () => {
  assert.equal(legaturaBrand("/m", "/m/magazin", "Portwest"), "/m/brand/portwest");
  assert.equal(legaturaBrand("", "/magazin", "Portwest"), "/brand/portwest");
  /* Catalogul pe prima pagina: pagina brandului ar trimite acolo, deci nu se pune legatura. */
  assert.equal(legaturaBrand("/m", "/m", "Portwest"), null);
  assert.equal(legaturaBrand("/m", undefined, "Portwest"), null);
  assert.equal(legaturaBrand("/m", "/m/magazin", "  "), null);
});

test("„brand”, „branduri” si „brands” sunt rezervate pentru paginile proprii", () => {
  for (const s of ["brand", "branduri", "brands", "Brand"]) assert.ok(isReservedSlug(s), s);
});

/* ─────────────── metadata ─────────────── */

const RADACINA = "https://casalumen.ro";
const meta = (b: BrandMagazin, sp: Record<string, string> = {}, noindexMagazin = false) =>
  metadataPaginiiBrand({ brand: b, displayName: "Casa Lumen", radacina: RADACINA, sp, noindexMagazin, imagineMagazin: "https://cdn.x/coperta.webp" });

test("metadata: titlu, canonical pe pagina brandului, imaginea e logo-ul", () => {
  const m = meta(brand("Țesătoria Argeș", 5, { logo: "https://cdn.x/logo.webp" }));
  assert.deepEqual(m.title, { absolute: "Țesătoria Argeș | Casa Lumen" });
  assert.equal(m.alternates?.canonical, `${RADACINA}/brand/tesatoria-arges`);
  assert.equal(m.robots, undefined, "brand cu produse: indexabil");
  assert.deepEqual((m.openGraph as { images: string[] }).images, ["https://cdn.x/logo.webp"]);
  /* Fara logo, imaginea magazinului. */
  assert.deepEqual((meta(brand("X", 2)).openGraph as { images: string[] }).images, ["https://cdn.x/coperta.webp"]);
});

test("⚠⚠ brandul fara produse vizibile NU se indexeaza (ca o categorie goala)", () => {
  assert.deepEqual(meta(brand("Gol", 0)).robots, { index: false, follow: true });
  assert.deepEqual(meta(brand("Plin", 4), {}, true).robots, { index: false, follow: true }, "magazinul ascuns din Google");
});

test("canonicalul pastreaza pagina, iar doua filtre in plus scot pagina din index", () => {
  assert.equal(meta(brand("P", 30), { page: "2" }).alternates?.canonical, `${RADACINA}/brand/p?page=2`);
  assert.deepEqual(meta(brand("P", 30), { q: "x", stoc: "1" }).robots, { index: false, follow: true });
});

test("descrierea: textul comerciantului (taiat la 160) sau una compusa", () => {
  assert.equal(descriereBrand(brand("A", 3, { descriere: "  Scurt  si  bun. " }), "M"), "Scurt si bun.");
  const lunga = descriereBrand(brand("A", 3, { descriere: "cuvant ".repeat(60) }), "M");
  assert.ok(lunga.length <= 160 && lunga.endsWith("..."), lunga);
  assert.equal(descriereBrand(brand("Armaf", 20), "Mokka"), "Produsele Armaf de la Mokka. 20 de produse disponibile.");
  assert.equal(descriereBrand(brand("Armaf", 0), "Mokka"), "Produsele Armaf de la Mokka.");
});

/* ─────────────── JSON-LD ─────────────── */

const ld = (b: BrandMagazin, a: { sp?: Record<string, string>; esteCiorna?: boolean; noindexMagazin?: boolean } = {}) =>
  dateStructurateBrand({
    brand: b, business: { store_name: "Casa Lumen", business_name: "Casa Lumen SRL" }, radacina: RADACINA,
    titluCatalog: "Magazin", sp: a.sp ?? {}, noindexMagazin: a.noindexMagazin ?? false, esteCiorna: a.esteCiorna ?? false,
  });

test("JSON-LD: CollectionPage despre un Brand, cu logo si firimituri pe trei trepte", () => {
  const s = ld(brand("Casa Lumen", 32, { logo: "https://cdn.x/l.webp" }));
  assert.ok(s);
  const g = JSON.parse(s) as { "@graph": Record<string, unknown>[] };
  const pagina = g["@graph"].find((n) => n["@type"] === "CollectionPage") as Record<string, unknown>;
  assert.equal((pagina.about as { "@type"?: string } | undefined)?.["@type"], "Brand");
  assert.equal((pagina.about as { name?: string }).name, "Casa Lumen");
  assert.match(s, /"logo":"https:\/\/cdn\.x\/l\.webp"/);
  const fir = g["@graph"].find((n) => n["@type"] === "BreadcrumbList") as { itemListElement: unknown[] };
  assert.equal(fir.itemListElement.length, 3);
});

test("⚠ JSON-LD nu se emite pe pagina care nu se indexeaza", () => {
  assert.equal(ld(brand("Gol", 0)), null);
  assert.equal(ld(brand("P", 3), { esteCiorna: true }), null);
  assert.equal(ld(brand("P", 3), { noindexMagazin: true }), null);
  assert.equal(ld(brand("P", 3), { sp: { q: "x", stoc: "1" } }), null);
});

/* ─────────────── sitemap ─────────────── */

const DESIGN_CU_CATALOG = { version: DESIGN_VERSION, chrome: {}, home: [], shop: { page: { id: "shop_page", kind: "shop_page", variant: "toolbar", settings: {} } } };
const DESIGN_FARA_CATALOG = { version: DESIGN_VERSION, chrome: {}, home: [], shop: { page: { id: "shop_page", kind: "shop_page", variant: "none", settings: {} } } };
const magazin = (design: unknown, pageContent: Record<string, unknown> = {}) => ({
  updated_at: "2026-09-01T10:00:00.000Z",
  store_settings: { page_content: pageContent, storefront_design: design, store_policies: {} },
});
const paginiBrand = (biz: ReturnType<typeof magazin>, branduri: { segment: string; produse: number }[] | null) =>
  intrariMagazin(RADACINA, biz, { categorii: [], categoriiCuProduse: null, produse: [], pagini: [], branduri })
    .map((e) => e.url).filter((u) => u.startsWith(`${RADACINA}/brand/`));

test("⚠⚠ sitemapul anunta numai brandurile cu produse vizibile, o singura data", () => {
  const b = [{ segment: "armaf", produse: 3 }, { segment: "armaf", produse: 1 }, { segment: "gol", produse: 0 }, { segment: "portwest", produse: 9 }];
  assert.deepEqual(paginiBrand(magazin(DESIGN_CU_CATALOG), b), [`${RADACINA}/brand/armaf`, `${RADACINA}/brand/portwest`]);
});

test("fara pagina de catalog, ascuns din Google, sau lista necitita: nicio pagina de brand", () => {
  const b = [{ segment: "armaf", produse: 3 }];
  assert.deepEqual(paginiBrand(magazin(DESIGN_FARA_CATALOG), b), []);
  assert.deepEqual(paginiBrand(magazin(DESIGN_CU_CATALOG, { seo: { noindex: true } }), b), []);
  assert.deepEqual(paginiBrand(magazin(DESIGN_CU_CATALOG), null), []);
});

/* ─────────────── cablajul paginii (unde nu se poate rula) ─────────────── */

test("⚠⚠ pagina de brand filtreaza pe jeton si pe server, si in browser", () => {
  const p = sursa("src/lib/storefront/catalog/pagina-magazin.tsx");
  assert.match(p, /\.\.\.\(brandPagina \? \[\[jetonBrand\(brandPagina\.nume\)\]\] : \[\]\)/, "grupul SI pentru catalog_pagina si cautare");
  assert.match(p, /if \(brandPagina\) q = q\.filter\("fatete", "cs", filtruJetonBrand\(brandPagina\.nume\)\)/, "calea din browser");
  /* Lista necitita nu e „nu exista": eroare, nu 404. */
  assert.match(p, /if \(!branduri\) throw new Error/);
  assert.match(p, /if \(!brandPagina\) notFound\(\)/);
  const r = sursa("src/app/(public)/[slug]/brand/[brand]/page.tsx");
  assert.match(r, /RandeazaMagazin\(\{ slug, sp, brandSlug: brand \}\)/);
  assert.match(r, /metadataBrand\(\{ slug, sp, brandSlug: brand \}\)/);
});

test("⚠ catalog_branduri numara ca catalog_pagina si e numai a serverului", () => {
  const m = sursa("migrations/2026-09-24-produse-branduri-zz-pagini.sql");
  const corp = m.slice(m.indexOf("function public.catalog_branduri"), m.indexOf("$$;", m.indexOf("function public.catalog_branduri")));
  for (const conditie of [/not coalesce\(p_fara_imagini, false\) or c\.are_imagine/, /not coalesce\(p_fara_stoc_ascuns, false\) or not c\.fara_stoc/, /c\.category is null or c\.category <> all \(ascunse\.a\)/]) {
    assert.match(corp, conditie);
  }
  assert.match(m, /revoke all on function public\.catalog_branduri\(uuid, boolean, boolean\) from public, anon, authenticated/);
  assert.doesNotMatch(m, /security\s+definer/i);
});

test("⚠ salvarea logo-ului verifica proprietarul inainte de scriere si cere https", () => {
  const a = sursa("src/lib/actions/branduri.actions.ts");
  const corp = a.slice(a.indexOf("export async function salveazaDetaliileBrandului")).split("\nexport ")[0];
  assert.ok(corp.indexOf("magazinulMeu") > 0 && corp.indexOf("magazinulMeu") < corp.indexOf('rpc("brand_salveaza_detalii"'));
  assert.match(corp, /\^https:/);
});
