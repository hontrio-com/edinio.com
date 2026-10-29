import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { variantMeta, sectionMeta, SECTION_REGISTRY, type Field } from "@/lib/storefront/design/registry";
import { addableKinds } from "@/lib/storefront/design/edit";
import { cardurileHero } from "@/lib/storefront/design/hero-carduri";
import { placileDinSetari } from "@/lib/storefront/design/placi-promo";
import { produsePeRadacina } from "@/lib/storefront/categorii-numarate";
import { sectiuniAcasa } from "@/lib/storefront/design/commerce";
import type { DesignContext } from "@/lib/storefront/design/types";
import { DATE_DEMO_JUPITER } from "./date-demo";
import { designJupiter } from "./design";

/*
 * Etapa 16.3: pagina principala a temei Jupiter, dupa dedeman.ro: bannerul cu doua carduri, placile de categorii cu
 * numarul de produse, cardul de produs, randurile pe banda gri, placile de recomandare.
 */

const ctx: DesignContext = {
  primaryColor: "#07c527",
  pageContent: { product_sections: [
    { id: "r1", title: "Oferte de sezon", enabled: true, mode: "selected", productIds: ["a"] },
    { id: "r2", title: "Alegeri populare", enabled: true, mode: "selected", productIds: ["b"] },
  ] },
  features: {},
};

test("pagina principala Jupiter: bannerul cu carduri, categoriile pe placi, primul rand, recomandarile, al doilea rand", () => {
  const d = designJupiter(ctx, DATE_DEMO_JUPITER);
  const ordine = d.home.filter((s) => s.enabled).map((s) => `${s.kind}:${s.variant}`);
  const unde = (x: string) => ordine.indexOf(x);
  assert.equal(ordine[0], "hero:carduri");
  assert.equal(ordine[1], "category_nav:placi");
  const randuri = d.home.filter((s) => s.kind === "product_row" && s.enabled);
  assert.ok(randuri.length >= 2);
  const pozitie = (id: string) => d.home.findIndex((s) => s.id === id);
  const placi = d.home.find((s) => s.kind === "placi_promo")!;
  assert.ok(unde("placi_promo:rotunde") > 1);
  assert.ok(pozitie(placi.id) > pozitie(randuri[0].id), "recomandarile dupa primul rand care se vede");
  assert.ok(pozitie(placi.id) < pozitie(randuri[1].id), "si inaintea celui de-al doilea");
  for (const r of randuri) assert.equal(r.settings.banda, true, "randurile pe banda gri");
  assert.equal(d.commerce.productCard.variant, "jupiter");
  assert.equal(d.shop.page.settings.pastreazaGrilaAcasa, false, "catalogul pe pagina lui, nu si pe prima");
  assert.ok(!sectiuniAcasa(d).some((s) => s.kind === "product_grid"), "grila nu mai e pe prima pagina");
});

test("cu datele demo, cardurile si placile au continutul lor, cu linkuri spre catalog; fara ele, pornesc goale", () => {
  const cu = designJupiter(ctx, DATE_DEMO_JUPITER);
  const hero = cu.home.find((s) => s.kind === "hero")!;
  assert.equal(cardurileHero(hero.settings).length, 2);
  assert.match(cardurileHero(hero.settings)[0].link, /^\/magazin\?cat=/);
  const placi = cu.home.find((s) => s.kind === "placi_promo")!;
  assert.equal(placileDinSetari(placi.settings).length, 4);
  assert.equal(placi.settings.titlu, "Recomandari");

  const fara = designJupiter(ctx, null);
  assert.equal(cardurileHero(fara.home.find((s) => s.kind === "hero")!.settings).length, 0);
  assert.equal(placileDinSetari(fara.home.find((s) => s.kind === "placi_promo")!.settings).length, 0);
});

test("⚠ sectiunile magazinului pe care tema nu le foloseste raman, dupa ale ei, cu starea lor", () => {
  const cuDespre: DesignContext = { ...ctx, pageContent: { ...ctx.pageContent, show_about: true }, tagline: "x" };
  const d = designJupiter(cuDespre, null);
  const kinds = d.home.map((s) => s.kind);
  assert.ok(["about", "contact", "benefits", "reviews"].every((k) => kinds.includes(k as never)), "sectiunile lui sunt in lista");
  for (const k of ["about", "contact", "benefits", "reviews"]) {
    if (designJupiter(cuDespre, null).home.some((s) => s.kind === k)) assert.ok(kinds.indexOf(k as never) > kinds.indexOf("placi_promo"), k);
  }
});

test("cardurile bannerului: cel mult doua, cele fara titlu cad; placile: cel mult opt, cele goale cad", () => {
  assert.deepEqual(cardurileHero({ carduri: [{ titlu: " A " }, { text: "fara titlu" }, { titlu: "B" }, { titlu: "C" }] }).map((c) => c.titlu), ["A", "B"]);
  assert.deepEqual(cardurileHero(undefined), []);
  const multe = Array.from({ length: 10 }, (_, i) => ({ titlu: `P${i}` }));
  assert.equal(placileDinSetari({ placi: [{}, ...multe] }).length, 8);
  assert.deepEqual(placileDinSetari({ placi: [{ imagine: "x.jpg" }] }).map((p) => p.imagine), ["x.jpg"], "doar imagine e destul");
});

test("numarul de pe placile de categorii: produsele urca la raionul lor, numele necunoscute nu se numara", () => {
  const arbore = [
    { id: "s", name: "Scule", parent_id: null },
    { id: "se", name: "Scule electrice", parent_id: "s" },
    { id: "bo", name: "Bormasini", parent_id: "se" },
    { id: "g", name: "Grădină", parent_id: null },
    { id: "x", name: "Bucla", parent_id: "y" },
    { id: "y", name: "Bucla 2", parent_id: "x" },
  ];
  const n = produsePeRadacina(arbore, [
    { category: "Scule electrice" }, { category: "bormasini" }, { category: "Scule" }, { category: " grădină " },
    { category: "Altceva" }, { category: null }, { category: "Bucla" },
  ]);
  assert.equal(n.get("s"), 3, "trei niveluri, si fara deosebire de majuscule");
  assert.equal(n.get("g"), 1);
  assert.equal(n.size, 3, "bucla din arbore nu atarna la nesfarsit si nu se pierde in alte radacini");
});

test("variantele noi sunt in registry; placile de recomandare se pot adauga ca orice sectiune", () => {
  assert.ok(variantMeta("hero", "carduri")?.fields.some((f) => f.key === "carduri"));
  assert.equal(variantMeta("hero", "carduri")?.providesH1, true);
  assert.ok(variantMeta("category_nav", "placi")?.fields.some((f) => f.key === "arataNumarul"));
  assert.ok(variantMeta("product_card", "jupiter"));
  assert.ok(variantMeta("product_row", "grid")?.fields.some((f) => f.key === "banda"));
  assert.ok(variantMeta("product_row", "carousel")?.fields.some((f) => f.key === "banda"));
  assert.ok(!sectionMeta("placi_promo")?.inCatalog, "un singur design: fara galeria „Schimbă designul”");
  assert.ok(addableKinds(designJupiter(ctx, null)).includes("placi_promo"));
});

/** Codul fara comentarii. */
function cod(cale: string): string {
  return readFileSync(cale, "utf8").replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

test("magazinul: cardul ales din design pentru toate suprafetele, iar cardul Jupiter spune ce spune si cel clasic", () => {
  const s = cod("src/components/storefront/sections/products/StoreProductCard.tsx");
  assert.match(s, /const Card = \(varianta \?\? design\?\.commerce\.productCard\.variant\) === "jupiter" \? ProductCardJupiter : ProductCard;/);
  const j = cod("src/components/storefront/product/ProductCardJupiter.tsx");
  assert.match(j, /\} = useDateCardProdus\(props\);/);
  assert.match(j, /isAdded \? "Adaugat!" : isVariable \? "Alege optiunile" : cerePersonalizare \? "Personalizeaza" : "Adauga in cos"/);
  const clasic = cod("src/components/storefront/product/ProductCard.tsx");
  assert.match(clasic, /export function useDateCardProdus\(/);
  for (const t of ["Adaugat!", "Alege optiunile", "Personalizeaza", "Adauga in cos"]) assert.ok(clasic.includes(t), `si clasicul spune „${t}”`);
  // „Categoria pe card” din fila Stil se aplica si aici (16.5: cardul Jupiter o ignora, comutatorul nu facea nimic).
  assert.match(j, /priority = false, showCategoryBadge = true \} = props;/);
  assert.match(j, /\{showCategoryBadge && \(\s*<p [^>]*>\{product\.category \?\? ""\}<\/p>/);
});

test("pagina principala urmeaza latimea din stil (72rem e implicitul tuturor magazinelor de azi)", () => {
  const r = cod("src/components/storefront/SectionRenderer.tsx");
  assert.doesNotMatch(r, /max-w-6xl/);
  assert.equal((r.match(/max-w-\[var\(--st-container,72rem\)\] mx-auto px-4/g) ?? []).length, 4);
  assert.match(r, /case "placi_promo":\s*return <PlaciPromo settings=\{section\.settings\} \/>;/);
  assert.match(r, /return section\.variant === "placi" \? <CategoryNavPlaci settings=\{section\.settings\} \/> : <CategoryNavClassic \/>;/);
  assert.match(r, /banda=\{section\.settings\.banda === true\}/);
});

test("⚠ banda gri se intinde pe tot ecranul fara `100vw` (pe Windows aducea derulare orizontala)", () => {
  const p = cod("src/components/storefront/sections/products/ProductRowClassic.tsx");
  assert.match(p, /boxShadow: `0 0 0 100vmax \$\{GRI_BANDA\}`, clipPath: "inset\(0 -100vmax\)"/);
  assert.doesNotMatch(p, /100vw|w-screen/);
});

test("miniaturile din galerii au continut de exemplu si pentru placi si pentru cardurile bannerului", () => {
  const p = cod("src/app/(public)/preview-sectiune/[slug]/page.tsx");
  assert.match(p, /kind === "placi_promo" \? \{ placi: DEMO_PLACI_PROMO \} : kind === "hero" && variantParam === "carduri" \? \{ carduri: DEMO_CARDURI_HERO \} : \{\}/);
});

test("⚠ fiecare tip de camp din registru are control in panou: cardurile si placile le completeaza omul, nu doar tema", () => {
  // Gasit la 16.5: `repeater` cadea pe `default: return null`, deci „Cardurile din dreapta” si „Plăcile” nu se vedeau.
  const tipuri = new Set<string>();
  const strange = (fs: readonly Field[]) => {
    for (const f of fs) {
      if (f.retras) continue;
      tipuri.add(f.type);
      if (f.type === "repeater") strange(f.fields);
    }
  };
  for (const k of Object.values(SECTION_REGISTRY)) for (const v of Object.values(k.variants)) strange(v.fields);
  assert.ok(tipuri.has("repeater") && tipuri.has("image") && tipuri.has("link"));
  const panou = cod("src/components/store-editor/SectionSettings.tsx");
  for (const t of tipuri) assert.match(panou, new RegExp(`case "${t}":`), `tipul „${t}” n-are control in panou`);
  assert.match(panou, /case "repeater":\s*return <ListaRepetor field=\{field\} value=\{value\} onChange=\{onChange\} eticheta=\{eticheta\} \/>;/);
  assert.match(panou, /\{lista\.length < max && \(/, "„Adaugă” dispare la maxim");
  assert.match(panou, /f\.type === "link" \? \(\s*<CampLink /, "linkul are sugestiile panoului");
});

test("16.6: cardul se alege din fila Stil, cu aceeasi galerie, iar miniatura lui trece prin cardul magazinului", () => {
  const e = cod("src/components/editor-magazin/EditorMagazin.tsx");
  assert.match(e, /<PanouStil continut=\{continut\} cardul=\{\{\s*sectiune: designViu\.commerce\.productCard,\s*numar: numarVariante\(designViu\.commerce\.productCard\),\s*onSchimba: \(\) => \{ setGalerieDesign\(designViu\.commerce\.productCard\.id\); setVedereMobil\("previzualizare"\); \},\s*\}\} \/>/);
  assert.match(cod("src/components/editor-magazin/continut/PanouStil.tsx"),
    /Cardul de produs<\/p>\s*\{cardul && <RandDesign sectiune=\{cardul\.sectiune\} numar=\{cardul\.numar\} onSchimba=\{cardul\.onSchimba\} \/>\}/);
  assert.match(cod("src/components/editor-magazin/PanouNod.tsx"), /<RandDesign sectiune=\{sectiune\} numar=\{variante\} onSchimba=\{\(\) => onSchimbaDesignul\(sectiune\.id\)\} \/>/);
  const f = cod("src/components/storefront/SectionPreviewFrame.tsx");
  assert.match(f, /if \(section\.kind === "product_card"\) \{[\s\S]*?<StoreProductCard key=\{p\.id\} product=\{p\} priority varianta=\{section\.variant\} \/>/);
  assert.match(cod("src/components/storefront/sections/products/StoreProductCard.tsx"),
    /const Card = \(varianta \?\? design\?\.commerce\.productCard\.variant\) === "jupiter" \? ProductCardJupiter : ProductCard;/);
});
