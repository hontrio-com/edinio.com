import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { esteFontPagina } from "@/lib/pages/fonturi";
import { CONTAINER_REM, resolveStyle } from "@/lib/storefront/design/defaults";
import { magazinCuIdentitatea, pageContentCuIdentitatea } from "@/lib/teme/aplicare";
import { parseStoreDesign } from "@/lib/storefront/design/parse";
import { variantMeta, type Field } from "@/lib/storefront/design/registry";
import { ETICHETA_PLACA_IMPLICITA } from "@/lib/storefront/design/placi-promo";
import { coloaneVazute } from "@/lib/storefront/design/subsol";
import { schemaBlocurilor } from "@/lib/storefront/design/blocuri";
import { sanitizeSettings } from "@/lib/storefront/design/curatare";
import type { DesignContext } from "@/lib/storefront/design/types";
import { DATE_DEMO_JUPITER } from "./date-demo";
import { coloaneSubsolJupiter, designJupiter, IDENTITATE_JUPITER, STIL_JUPITER } from "./design";

/*
 * Etapa 16.2: stilul, antetul si subsolul temei Jupiter, dupa dedeman.ro („aproape 1 la 1”, cerut de el).
 */

const ctx: DesignContext = { primaryColor: "#07c527", pageContent: {}, features: {} };

test("identitatea si stilul Jupiter (etapa 23, aspect propriu): fonturile exista in lista, bleumarinul siglei, portocaliul, colturile rotunjite, pagina lata de 100rem", () => {
  assert.ok(esteFontPagina(IDENTITATE_JUPITER.fontText), "Inter");
  assert.ok(esteFontPagina(IDENTITATE_JUPITER.fontTitluri), "Plus Jakarta Sans");
  assert.deepEqual(IDENTITATE_JUPITER, { culoare: "#0B3D7A", fundal: "#FFFFFF", fontTitluri: "jakarta", fontText: "inter" });
  assert.equal(STIL_JUPITER.container, "xwide");
  assert.equal(STIL_JUPITER.radius, "md");
  assert.equal(STIL_JUPITER.buttonRadius, "full");
  assert.equal(CONTAINER_REM.xwide, 100);
  assert.equal(STIL_JUPITER.colors?.accent, "#F47B20");
});

test("⚠ 17.1: identitatea temei NU sta in design (ar castiga peste fila „Stil”); dupa aplicare, „Stil” schimba magazinul", () => {
  const d = designJupiter(ctx, null);
  assert.equal(d.style.colors?.primary, undefined);
  assert.equal(d.style.colors?.background, undefined);
  assert.equal(d.style.fontBody, undefined);
  assert.equal(d.style.fontHeading, undefined);
  // Identitatea scrisa in magazin, unde o citeste „Stil”: magazinul arata ca modelul.
  const pc = pageContentCuIdentitatea({ cheia_lui: 1 }, IDENTITATE_JUPITER);
  assert.equal(pc.cheia_lui, 1, "restul cheilor raman ale lui");
  const cuTema = resolveStyle(d.style, { ...ctx, primaryColor: magazinCuIdentitatea(IDENTITATE_JUPITER).primary_color, pageContent: pc });
  assert.deepEqual([cuTema.colors.primary, cuTema.colors.accent, cuTema.colors.background, cuTema.fontHeading, cuTema.fontBody],
    ["#0B3D7A", "#F47B20", "#FFFFFF", "jakarta", "inter"]);
  // Apoi omul alege altceva in „Stil”: magazinul il urmeaza.
  const dupaStil = resolveStyle(d.style, { ...ctx, primaryColor: "#8B1A1A", pageContent: { ...pc, store_bg_color: "#FAFAFA", font_text: "geist" } });
  assert.deepEqual([dupaStil.colors.primary, dupaStil.colors.background, dupaStil.fontBody], ["#8B1A1A", "#FAFAFA", "geist"]);
});

test("designul Jupiter: antetul si subsolul „hipermarket”, pagina Magazin cu filtre in stanga, stilul temei", () => {
  const d = designJupiter(ctx, null);
  assert.equal(d.chrome.header.variant, "hipermarket");
  assert.equal(d.chrome.footer.variant, "hipermarket");
  assert.equal(d.shop.page.variant, "sidebar");
  assert.equal(d.shop.page.enabled, true);
  assert.equal(d.style.colors?.accent, "#F47B20");
  assert.equal(d.style.container, "xwide");
  assert.equal(d.chrome.header.settings.showTopBar, true);
  assert.equal(d.chrome.header.settings.topText, undefined, "fara date demo, mesajul barii e al magazinului");
  assert.equal(designJupiter(ctx, DATE_DEMO_JUPITER).chrome.header.settings.topText, "Livrare in toata tara");
});

test("⚠ designul trece neatins prin parser: ce aplica tema e ce citeste magazinul (variantele si coloanele raman)", () => {
  const d = designJupiter(ctx, DATE_DEMO_JUPITER);
  const citit = parseStoreDesign(JSON.parse(JSON.stringify(d)), ctx);
  assert.equal(citit.chrome.header.variant, "hipermarket");
  assert.equal(citit.chrome.footer.variant, "hipermarket");
  assert.deepEqual(coloaneVazute(citit.chrome.footer).map((c) => c.id), ["identitate", "raioane", "comenzi", "informatii", "suport"]);
});

test("⚠ textele coloanelor subsolului incap in campurile lor (un titlu prea lung se taia la citire: „săptămâna”)", () => {
  const schema = schemaBlocurilor("footer", "hipermarket")!;
  for (const c of coloaneSubsolJupiter()) {
    const campuri = schema.tipuri[c.type]?.coloana?.campuri ?? [];
    assert.deepEqual(sanitizeSettings(campuri, c.settings), Object.fromEntries(
      Object.entries(c.settings).filter(([k]) => campuri.some((f) => f.key === k)),
    ), c.id);
  }
});

test("variantele noi sunt in registry, cu reglajele lor", () => {
  const antet = variantMeta("header", "hipermarket")!;
  assert.ok(antet.fields.some((f) => f.key === "topText"));
  assert.equal(antet.defaults?.showTopBar, true);
  assert.equal(variantMeta("footer", "hipermarket")?.defaults?.inapoiSus, true);
  assert.ok(schemaBlocurilor("footer", "hipermarket"), "subsolul are coloanele-bloc, ca celelalte");
});

/** Codul fara comentarii. */
function cod(cale: string): string {
  return readFileSync(cale, "utf8").replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

test("magazinul randeaza variantele noi, iar subsolul foloseste coloanele subsolurilor existente, nu o copie", () => {
  const r = cod("src/components/storefront/SectionRenderer.tsx");
  assert.match(r, /hipermarket: HeaderHipermarket as VariantaSectiune,/);
  assert.match(r, /hipermarket: FooterHipermarket,/);
  const f = cod("src/components/storefront/sections/chrome/FooterHipermarket.tsx");
  assert.match(f, /import \{ ColoanaSubsol, type StilColoane \} from "\.\/FooterColumns";/);
  assert.match(f, /<ColoanaSubsol coloana=\{c\} idSubsol=\{sectiune\.id\} stil=\{STIL\} \/>/);
});

test("antetul: bara de navigare lipita sus, meniul de categorii pe doua niveluri, cautarea cu rezultatele pe loc", () => {
  const a = cod("src/components/storefront/sections/chrome/HeaderHipermarket.tsx");
  assert.match(a, /className=\{`hidden lg:block sticky \$\{lipit\} z-40/);
  assert.match(a, /const \{ valoare, scrie, propsForm, propsZona, rezultate \} = useCautareHeader\(\{ categorie: "toate" \}\);/);
  assert.match(a, /if \(e\.key === "Escape"\) onInchide\(\);/);
  assert.match(a, /onClick=\{\(\) => setMeniuDeschis\(false\)\} \/>/, "un clic pe fundal inchide meniul");
  assert.match(a, /copii\.length > 0 \? \(\s*<button type="button" onClick=\{\(\) => setAles\(radacina\.key\)\}/);
});

const DIACRITICE = /[ăâîșțşţĂÂÎȘȚŞŢ]/;

test("⚠ ce scrie tema in magazin e fara diacritice (regula lui, ca restul vitrinei: „Adauga in cos”, „Cauta”)", () => {
  for (const f of [
    "src/components/storefront/sections/chrome/HeaderHipermarket.tsx",
    "src/components/storefront/sections/chrome/FooterHipermarket.tsx",
    "src/components/storefront/product/ProductCardJupiter.tsx",
    "src/components/storefront/sections/hero/HeroCuCarduri.tsx",
    "src/components/storefront/sections/catalog/CategoryNavPlaci.tsx",
    "src/components/storefront/sections/shop/_shared/PlaciSubcategorii.tsx",
  ]) assert.doesNotMatch(cod(f), DIACRITICE, f);
  // Textele puse de tema in reglaje; datele demo (produse, categorii, carduri) sunt continut, ca al oricarui magazin.
  assert.doesNotMatch(JSON.stringify(coloaneSubsolJupiter()), DIACRITICE);
  assert.doesNotMatch(JSON.stringify(designJupiter(ctx, DATE_DEMO_JUPITER).chrome), DIACRITICE);
  assert.doesNotMatch(JSON.stringify(variantMeta("placi_promo", "rotunde")?.defaults), DIACRITICE);
  assert.doesNotMatch(ETICHETA_PLACA_IMPLICITA, DIACRITICE);
});

/** Etichetele unei variante si ale campurilor ei (si din repetoare). */
function etichete(kind: Parameters<typeof variantMeta>[0], variant: string): string[] {
  const m = variantMeta(kind, variant)!;
  const din = (fs: readonly Field[]): string[] => fs.flatMap((f) => [f.label, ...(f.type === "repeater" ? din(f.fields) : [])]);
  return [m.label, ...din(m.fields)];
}

test("⚠ etichetele variantelor noi, din panou, sunt cu diacritice (panoul ramane cu, regula lui)", () => {
  const faraDiacritice = /\b(Arata|arata|si|in|Placi|placi|doua|alaturate|numar|cate)\b/;
  const noi = [
    ...etichete("header", "hipermarket").slice(0, 1),
    ...variantMeta("header", "hipermarket")!.fields.filter((f) => ["showTopBar", "topText", "showHotline"].includes(f.key)).map((f) => f.label),
    // Reglajele subsolului sunt comune tuturor subsolurilor, mai vechi (trecerea de diacritice, REGISTRU D).
    ...etichete("footer", "hipermarket").slice(0, 1),
    ...etichete("hero", "carduri"),
    ...etichete("category_nav", "placi"),
    ...etichete("placi_promo", "rotunde"),
    ...etichete("product_card", "jupiter"),
    variantMeta("shop_page", "sidebar")!.fields.find((f) => f.key === "placiSubcategorii")!.label,
    variantMeta("product_row", "grid")!.fields.find((f) => f.key === "banda")!.label,
  ];
  assert.ok(noi.length >= 20, `etichete gasite: ${noi.length}`);
  for (const e of noi) assert.doesNotMatch(e, faraDiacritice, e);
});
