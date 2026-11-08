import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { buildClassicDesign } from "@/lib/storefront/design/defaults";
import { parseStoreDesign } from "@/lib/storefront/design/parse";
import { variantMeta } from "@/lib/storefront/design/registry";
import { DEMO_CONTINUT_LIBER } from "@/lib/storefront/design/demo-content";
import { citesteSetariMagazin, citesteSetariMagazinDinSectiune } from "@/lib/storefront/catalog/shop-settings";
import { produsePeCategorie } from "@/lib/storefront/categorii-numarate";
import type { DesignContext, StoreDesign } from "@/lib/storefront/design/types";
import { designJupiter } from "./design";

/*
 * Etapa 16.4: pagina Magazin (placile subcategoriilor, ca pagina de categorie de pe dedeman.ro) si pagina de produs
 * „Detaliat” pe toata latimea; plus regula pentru aplicare (etapa 17): tema pastreaza ce e al magazinului.
 */

const ctx: DesignContext = { primaryColor: "#07c527", pageContent: {}, features: {} };

test("numarul pe orice categorie: fiecare produs se numara la categoria lui si la toti stramosii", () => {
  const arbore = [
    { id: "s", name: "Scule", parent_id: null },
    { id: "se", name: "Scule electrice", parent_id: "s" },
    { id: "bo", name: "Bormasini", parent_id: "se" },
    { id: "x", name: "Bucla", parent_id: "y" },
    { id: "y", name: "Bucla 2", parent_id: "x" },
  ];
  const n = produsePeCategorie(arbore, [{ category: "Bormasini" }, { category: "scule electrice" }, { category: "Bucla" }, { category: "Nimic" }]);
  assert.equal(n.get("bo"), 1);
  assert.equal(n.get("se"), 2);
  assert.equal(n.get("s"), 2);
  assert.equal(n.get("x"), 1, "bucla din arbore se opreste, nu atarna");
  assert.equal(n.get("y"), 1);
});

test("placile subcategoriilor: reglaj al paginii cu filtre in stanga, stins din start, pornit de tema", () => {
  assert.ok(variantMeta("shop_page", "sidebar")?.fields.some((f) => f.key === "placiSubcategorii"));
  assert.equal(citesteSetariMagazinDinSectiune({ variant: "sidebar", settings: {} }).placiSubcategorii, false);
  assert.equal(citesteSetariMagazinDinSectiune({ variant: "sidebar", settings: { placiSubcategorii: true } }).placiSubcategorii, true);
  const d = designJupiter(ctx, null);
  assert.equal(citesteSetariMagazin(d).placiSubcategorii, true);
  assert.equal(d.product.page.variant, "detailed", "pagina de produs „Detaliat”, cu miniaturile in stanga");
});

/** Un magazin cu ce si-a facut el: continut liber sub produs, o sectiune de continut liber, coloanele lui. */
function magazinCuAleLui(): StoreDesign {
  const d = parseStoreDesign(buildClassicDesign(ctx), ctx);
  const sub = { id: "cl_sub_produs", type: "continut_liber", enabled: true, settings: { blocuri: DEMO_CONTINUT_LIBER.slice(0, 1) } };
  return parseStoreDesign({
    ...d,
    product: { ...d.product, page: { ...d.product.page, blocks: [...(d.product.page.blocks ?? []), sub] } },
    home: [...d.home, { id: "continut_al_lui", kind: "continut_liber", variant: "blocuri", enabled: true, settings: { blocuri: DEMO_CONTINUT_LIBER.slice(0, 1) } }],
    chrome: { ...d.chrome, footer: { ...d.chrome.footer, settings: { ...d.chrome.footer.settings, copyright: "SC Floraria SRL" }, blocks: [{ id: "doar_contact", type: "contact", enabled: true, settings: { titlu: "Contact" } }] } },
  }, ctx);
}

test("⚠ aplicata peste designul unui magazin, tema pastreaza ce e al lui (etapa 17)", () => {
  const alLui = magazinCuAleLui();
  assert.ok(alLui.product.page.blocks?.some((b) => b.id === "cl_sub_produs"), "pregatirea: blocul e acolo");
  const d = designJupiter(ctx, null, alLui);
  assert.ok(d.product.page.blocks?.some((b) => b.id === "cl_sub_produs" && b.type === "continut_liber"), "continutul liber de sub produs ramane pe „Detaliat”");
  assert.ok(d.home.some((s) => s.id === "continut_al_lui" && s.kind === "continut_liber"), "sectiunea lui de continut liber ramane");
  assert.deepEqual(d.chrome.footer.blocks?.map((b) => b.id), ["doar_contact"], "coloanele alese de el raman");
  assert.equal(d.chrome.footer.variant, "hipermarket");
  assert.equal(d.chrome.footer.settings.copyright, "SC Floraria SRL", "si reglajele lui care au sens pe varianta noua");
});

test("fara coloane alese de el (implicitele scrise de parser), subsolul primeste coloanele temei", () => {
  const d = designJupiter(ctx, null, parseStoreDesign(buildClassicDesign(ctx), ctx));
  assert.equal(d.chrome.footer.blocks?.[0]?.id, "identitate");
  assert.ok(d.chrome.footer.blocks?.some((b) => b.id === "raioane"));
});

/** Codul fara comentarii. */
function cod(cale: string): string {
  return readFileSync(cale, "utf8").replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

test("pagina Magazin: placile sub titlu, cu aceeasi placa de categorie ca pe prima pagina, nu o copie", () => {
  assert.match(cod("src/components/storefront/sections/shop/ShopPageSidebar.tsx"), /<AntetPagina titlu=\{titlu\} aratatTitlu=\{arataTitlu\} \/>\s*\{placiSubcategorii && <PlaciSubcategorii \/>\}/);
  assert.match(cod("src/components/storefront/sections/shop/ShopPageSection.tsx"), /placiSubcategorii=\{setariMagazin\.placiSubcategorii\}/);
  assert.match(cod("src/components/storefront/sections/shop/_shared/PlaciSubcategorii.tsx"), /import \{ PlacaCategorie \} from "@\/components\/storefront\/sections\/catalog\/CategoryNavPlaci";/);
  assert.match(cod("src/components/storefront/sections/catalog/CategoryNavPlaci.tsx"), /<PlacaCategorie href=\{hrefCategorie\(categoriiRoot, c\.name, categoriiPePagina === true\)\}/);
});

test("pagina de produs „Detaliat” urmeaza latimea din stil (72rem ramane implicitul)", () => {
  const p = cod("src/components/storefront/sections/product/ProductPageDetailed.tsx");
  assert.doesNotMatch(p, /max-w-6xl/);
  // Plafonata la 76rem: pe temele late (80-100rem) galeria iesea de 700-800 px.
  assert.equal((p.match(/max-w-\[min\(var\(--st-container,72rem\),76rem\)\] mx-auto/g) ?? []).length, 6);
});
