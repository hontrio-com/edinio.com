import test from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { imaginiPeCulori } from "./mapping";

/* ══════════════════════════════════════════════════════════════════════════
   O SINGURA GALERIE PLECA LA TOATE CULORILE (27.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   `images` se socotea o data, din produs, si se punea IDENTIC pe fiecare articol trimis. La
   About You imaginile tin insa de calea de CULOARE: cumparatorul care alegea rosu vedea
   fotografiile produsului negru.

   ⚠ Comentariul din `validateListing` scria deja regula — „documentatia lor spune ca imaginile
   tin de fiecare cale de culoare" — dar codul nu se schimbase. Un adevar stiut si nefacut.
*/

const P = ["https://cdn/produs-1.jpg", "https://cdn/produs-2.jpg"];
const v = (color_id: number | null, combo_image?: string | null) => ({ color_id, combo_image });

test("⚠ mai multe culori: fiecare primeste NUMAI fotografiile ei", () => {
  const g = imaginiPeCulori(P, [
    v(11, "https://cdn/rosu.jpg"),
    v(11, "https://cdn/rosu-2.jpg"),
    v(22, "https://cdn/negru.jpg"),
  ], null);
  assert.deepEqual(g.get(11), ["https://cdn/rosu.jpg", "https://cdn/rosu-2.jpg"]);
  assert.deepEqual(g.get(22), ["https://cdn/negru.jpg"]);
  /* Miezul: pozele produsului NU se lipesc dedesubt. Ar fi fost acelasi defect, mutat mai jos. */
  for (const lista of g.values()) for (const p of P) assert.ok(!lista.includes(p), p);
});

test("⚠ o singura culoare: fotografiile se ADAUGA, nu se inlocuiesc", () => {
  /*
   * Un produs care difera doar prin marime are o singura cale de culoare, deci toate fotografiile
   * sunt ale ei. Aici „numai ale combinatiei" ar fi ARUNCAT galeria produsului \u2014 o pierdere, nu o
   * reparatie.
   */
  const g = imaginiPeCulori(P, [v(11, "https://cdn/detaliu.jpg"), v(11, null)], null);
  assert.deepEqual(g.get(11), [...P, "https://cdn/detaliu.jpg"]);
});

test("⚠ coperta ramane prima cand se amesteca", () => {
  /* Prima imagine e coperta articolului, iar comerciantul si-a ales-o deja in fisa produsului. */
  const g = imaginiPeCulori(P, [v(11, "https://cdn/detaliu.jpg")], null);
  assert.equal(g.get(11)?.[0], P[0]);
});

test("⚠ culoarea fara fotografii proprii cade pe cele ale produsului, nu ramane goala", () => {
  /*
   * About You cere cel putin o imagine pe articol. Un articol NELISTAT e mai rau decat unul cu
   * fotografia culorii principale \u2014 dar `validateListing` o spune, ca sa se poata repara.
   */
  const g = imaginiPeCulori(P, [v(11, "https://cdn/rosu.jpg"), v(22, null)], null);
  assert.deepEqual(g.get(11), ["https://cdn/rosu.jpg"]);
  assert.deepEqual(g.get(22), P);
});

test("⚠ culoarea listarii tine locul celei de pe varianta", () => {
  /* `buildAboutYouItems` face `v.color_id ?? listing.color_id`; galeria trebuie sa faca la fel,
     altfel articolul ar cere o cheie care nu exista in harta. */
  const g = imaginiPeCulori(P, [v(null, "https://cdn/a.jpg"), v(null, null)], 7);
  assert.deepEqual([...g.keys()], [7]);
  assert.deepEqual(g.get(7), [...P, "https://cdn/a.jpg"]);
});

test("⚠ o adresa care nu e http nu intra in galerie", () => {
  /* Schema lor cere URL. `blob:` si caile locale din editor treceau nevazute pana in raspunsul
     lotului, unde produsul apare respins fara sa spuna de ce. */
  const g = imaginiPeCulori(P, [v(11, "poza.jpg"), v(11, "blob:abc"), v(11, "   ")], null);
  assert.deepEqual(g.get(11), P);
});

test("⚠ aceeasi fotografie pusa pe doua marimi se trimite o data", () => {
  const g = imaginiPeCulori([], [v(11, "https://cdn/x.jpg"), v(11, "https://cdn/x.jpg")], null);
  assert.deepEqual(g.get(11), ["https://cdn/x.jpg"]);
});

test("⚠ nu pleaca mai mult de zece imagini", () => {
  const multe = Array.from({ length: 14 }, (_, i) => `https://cdn/p${i}.jpg`);
  const g = imaginiPeCulori(multe, [v(11, "https://cdn/c.jpg")], null);
  assert.equal(g.get(11)?.length, 10);
  /* Taiat DUPA amestec, nu inainte: taiata la sursa, imaginea combinatiei ar fi picat prima. */
  assert.equal(g.get(11)?.[0], multe[0]);
});

test("⚠ fara nicio culoare, harta e goala si nimeni nu primeste in tacere", () => {
  /*
   * Varianta fara culoare si listare fara culoare = `buildAboutYouItems` oprea deja cu „Lipseste
   * culoarea". Aici nu se inventeaza o cheie 0: ar fi fost o galerie pe care n-o cere nimeni.
   */
  assert.equal(imaginiPeCulori(P, [v(null, "https://cdn/a.jpg")], null).size, 0);
});

/* ──────────────────────────────────────────────────────────────────────────
   SI ACUM PRIN `buildAboutYouItems`, PE DRUMUL INTREG

   ⚠ Functia pura de mai sus poate fi corecta si nefolosita. De cinci ori in doua zile o proba
   verde a aparat chiar defectul pe care il masura; aici se cere ARTICOLUL trimis, nu harta.
   ────────────────────────────────────────────────────────────────────────── */

import {
  atasezaPreturileRon, buildAboutYouItems, validateListing,
  type AboutYouListingEnrichment, type AboutYouVariantData, type MappableProduct,
} from "./mapping";
import type { AboutYouConfig } from "./types";

const CFG: AboutYouConfig = {
  brand_id: 7, ship_countries: ["IT"], price_mode: "fx_from_ron", fx: { rate: 5 },
  category_map: { Tricouri: { category_id: 42, label: "x" } },
};
const LISTARE: AboutYouListingEnrichment = {
  brand_id: 7, category_id: 42, color_id: 3, attributes: [], material_composition: null,
  country_of_origin: "RO", hs_code: null,
};
const VAR = (sku: string, over: Partial<AboutYouVariantData> = {}): AboutYouVariantData => ({
  sku, ean: null, size_id: 1, second_size_id: null, color_id: null, quantity: 5,
  retail_price_eur: null, sale_price_eur: null, enabled: true, ...over,
});

/* Doua culori, fiecare cu poza ei, si produsul cu o galerie proprie. */
const DOUA_CULORI = (imaginiProdus: string[] = ["https://cdn/produs.jpg"]): MappableProduct => ({
  id: "p1", name: "Tricou", description: null, price: 100, compare_at_price: null,
  images: imaginiProdus, category: "Tricouri", sku: "TR", weight_grams: 300,
  track_inventory: false, stock_quantity: null,
  page_sections: {
    variants: {
      enabled: true,
      options: [{ name: "Culoare", values: ["Roșu", "Negru"] }],
      combinations: [
        { id: "a", title: "Roșu", price: "", compare_at_price: "", sku: "TR-R", stock_quantity: "", image: "https://cdn/rosu.jpg", enabled: true },
        { id: "b", title: "Negru", price: "", compare_at_price: "", sku: "TR-N", stock_quantity: "", image: "https://cdn/negru.jpg", enabled: true },
      ],
    },
  } as never,
});

test("⚠ articolele chiar pleaca cu galerii DIFERITE, nu doar harta", () => {
  const p = DOUA_CULORI();
  const variante = atasezaPreturileRon(p, [
    VAR("TR-R", { color_id: 11 }), VAR("TR-N", { color_id: 22 }),
  ]);
  /* Fara asta, `combo_image` n-ar ajunge niciodata pe varianta \u2014 exact cablajul de verificat. */
  assert.equal(variante[0].combo_image, "https://cdn/rosu.jpg");

  const r = buildAboutYouItems({ config: CFG, product: p, listing: LISTARE, variants: variante });
  assert.ok(!("error" in r), JSON.stringify(r));
  const [rosu, negru] = (r as { items: { sku: string; images: string[] }[] }).items;
  assert.deepEqual(rosu.images, ["https://cdn/rosu.jpg"]);
  assert.deepEqual(negru.images, ["https://cdn/negru.jpg"]);
});

test("⚠ produsul fara nicio imagine a lui, dar cu poze pe culori, NU se mai refuza", () => {
  /*
   * Verificarea veche cerea imagini pe PRODUS si ar fi refuzat tocmai produsul facut cum trebuie.
   * Se muta pe articol: `buildAboutYouItems` trece, si `validateListing` nu se plange.
   */
  const p = DOUA_CULORI([]);
  const variante = atasezaPreturileRon(p, [VAR("TR-R", { color_id: 11 }), VAR("TR-N", { color_id: 22 })]);
  const ctx = { config: CFG, product: p, listing: LISTARE, variants: variante };
  assert.ok(!("error" in buildAboutYouItems(ctx)));
  assert.deepEqual(validateListing(ctx, null).issues.filter((i) => i.includes("imagin")), []);
});

test("⚠ dar culoarea ramasa fara nicio fotografie e OPRITA, nu trimisa goala", () => {
  const p = DOUA_CULORI([]);
  /* Se scoate poza culorii negre: nu mai are nici a ei, nici a produsului. */
  (p.page_sections as never as { variants: { combinations: { image: string }[] } })
    .variants.combinations[1].image = "";
  const variante = atasezaPreturileRon(p, [VAR("TR-R", { color_id: 11 }), VAR("TR-N", { color_id: 22 })]);
  const ctx = { config: CFG, product: p, listing: LISTARE, variants: variante };
  const r = buildAboutYouItems(ctx);
  assert.ok("error" in r, JSON.stringify(r));
  assert.match((r as { error: string }).error, /TR-N/);
  assert.equal(validateListing(ctx, null).issues.filter((i) => i.includes("imagine")).length, 1);
});

test("⚠ si culoarea care imprumuta pozele produsului i se SPUNE comerciantului", () => {
  const p = DOUA_CULORI(["https://cdn/produs.jpg"]);
  (p.page_sections as never as { variants: { combinations: { image: string }[] } })
    .variants.combinations[1].image = "";
  const variante = atasezaPreturileRon(p, [VAR("TR-R", { color_id: 11 }), VAR("TR-N", { color_id: 22 })]);
  const ctx = { config: CFG, product: p, listing: LISTARE, variants: variante };
  /* Se listeaza \u2014 mai bine decat deloc \u2014 dar cu poza altei culori pe ea. */
  assert.ok(!("error" in buildAboutYouItems(ctx)));
  const av = validateListing(ctx, null).warnings.filter((w) => w.includes("fotografii proprii"));
  assert.equal(av.length, 1);
  assert.match(av[0], /22/);
});

test("⚠ domeniul de INCERCARI se rescrie inainte de plecare", () => {
  /*
   * `pub-*.r2.dev` e domeniul pe care Cloudflare il da unui bucket pentru incercari, si spune
   * raspicat sa nu fie folosit in productie. In Edinio au ramas 1466 de imagini pe el, pe 855 de
   * produse. About You isi aduce singur pozele de pe adresele pe care i le dam \u2014 ca Trendyol,
   * unde produsul pica cu „Eroare de conexiune la serverul de imagini".
   *
   * ⚠ Se rescrie LA IESIRE: adresele salvate raman neatinse, iar cele doua domenii servesc acelasi
   * obiect, cu aceeasi suma de control.
   */
  const g = imaginiPeCulori(
    ["https://pub-abc123.r2.dev/poze/a.jpg"],
    [{ color_id: 11, combo_image: "https://pub-abc123.r2.dev/poze/rosu.jpg" }],
    null,
  );
  assert.deepEqual(g.get(11), [
    "https://edinio-cdn.com/poze/a.jpg",
    "https://edinio-cdn.com/poze/rosu.jpg",
  ]);
  /* Si ce e deja pe domeniul bun nu se atinge. */
  const h = imaginiPeCulori(["https://edinio-cdn.com/x.jpg"], [{ color_id: 1, combo_image: null }], null);
  assert.deepEqual(h.get(1), ["https://edinio-cdn.com/x.jpg"]);
});

test("⚠ amandoi chematorii lui `validateListing` trec intai prin `atasezaPreturileRon`", () => {
  /*
   * `combo_image` nu vine din `aboutyou_variants`: il pune `atasezaPreturileRon`, din produs. Un
   * chemator care sare peste ar primi variante fara imagini de combinatie si ar da avertismentul
   * „culoarea X nu are fotografii proprii" tocmai produsului care le are pe toate.
   *
   * Cuplajul e adevarat azi in amandoua locurile; proba il tine asa.
   */
  const viu = (p: string) => readFileSync(p, "utf8")
    .replace(/^[ \t]*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const f of ["src/lib/aboutyou/sync.ts", "src/lib/actions/aboutyou.actions.ts"]) {
    const src = viu(f);
    const iAtas = src.indexOf("atasezaPreturileRon(");
    const iVal = src.indexOf("validateListing(");
    assert.notEqual(iVal, -1, f);
    assert.notEqual(iAtas, -1, `${f}: nu mai cheama atasezaPreturileRon`);
    assert.ok(iAtas < iVal, `${f}: verificarea se face inaintea atasarii`);
  }
});
