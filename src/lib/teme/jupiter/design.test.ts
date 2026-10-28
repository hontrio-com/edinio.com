import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { esteFontPagina } from "@/lib/pages/fonturi";
import { CONTAINER_REM } from "@/lib/storefront/design/defaults";
import { parseStoreDesign } from "@/lib/storefront/design/parse";
import { variantMeta } from "@/lib/storefront/design/registry";
import { coloaneVazute } from "@/lib/storefront/design/subsol";
import { schemaBlocurilor } from "@/lib/storefront/design/blocuri";
import { sanitizeSettings } from "@/lib/storefront/design/curatare";
import type { DesignContext } from "@/lib/storefront/design/types";
import { DATE_DEMO_JUPITER } from "./date-demo";
import { coloaneSubsolJupiter, designJupiter, STIL_JUPITER } from "./design";

/*
 * Etapa 16.2: stilul, antetul si subsolul temei Jupiter, dupa dedeman.ro („aproape 1 la 1”, cerut de el).
 */

const ctx: DesignContext = { primaryColor: "#07c527", pageContent: {}, features: {} };

test("stilul Jupiter: fonturile modelului exista in lista, pagina lata de 100rem (1600 px)", () => {
  assert.ok(esteFontPagina(STIL_JUPITER.fontBody), "Open Sans");
  assert.ok(esteFontPagina(STIL_JUPITER.fontHeading), "Sofia Sans");
  assert.equal(STIL_JUPITER.fontBody, "opensans");
  assert.equal(STIL_JUPITER.fontHeading, "sofiasans");
  assert.equal(STIL_JUPITER.container, "xwide");
  assert.equal(CONTAINER_REM.xwide, 100);
  assert.equal(STIL_JUPITER.colors?.primary, "#215196");
  assert.equal(STIL_JUPITER.colors?.accent, "#FF882D");
});

test("designul Jupiter: antetul si subsolul „hipermarket”, pagina Magazin cu filtre in stanga, stilul temei", () => {
  const d = designJupiter(ctx, null);
  assert.equal(d.chrome.header.variant, "hipermarket");
  assert.equal(d.chrome.footer.variant, "hipermarket");
  assert.equal(d.shop.page.variant, "sidebar");
  assert.equal(d.shop.page.enabled, true);
  assert.equal(d.style.fontBody, "opensans");
  assert.equal(d.style.container, "xwide");
  assert.equal(d.chrome.header.settings.showTopBar, true);
  assert.equal(d.chrome.header.settings.topText, undefined, "fara date demo, mesajul barii e al magazinului");
  assert.equal(designJupiter(ctx, DATE_DEMO_JUPITER).chrome.header.settings.topText, "Livrare în toată țara");
});

test("⚠ designul trece neatins prin parser: ce aplica tema e ce citeste magazinul (variantele si coloanele raman)", () => {
  const d = designJupiter(ctx, DATE_DEMO_JUPITER);
  const citit = parseStoreDesign(JSON.parse(JSON.stringify(d)), ctx);
  assert.equal(citit.chrome.header.variant, "hipermarket");
  assert.equal(citit.chrome.footer.variant, "hipermarket");
  assert.deepEqual(coloaneVazute(citit.chrome.footer).map((c) => c.id), ["newsletter", "raioane", "comenzi", "informatii", "suport"]);
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
  assert.match(f, /<FooterLegal ton="deschis" cuPagini=\{false\} \/>/, "partea legala, obligatorie");
  assert.match(f, /<FormularNewsletterSubsol coloana=\{newsletter\} idSubsol=\{sectiune\.id\} marunt="text-\[var\(--st-muted\)\]" inchis=\{false\} lipit \/>/);
});

test("antetul: bara de navigare lipita sus, meniul de categorii pe doua niveluri, cautarea cu rezultatele pe loc", () => {
  const a = cod("src/components/storefront/sections/chrome/HeaderHipermarket.tsx");
  assert.match(a, /className=\{`hidden lg:block sticky \$\{lipit\} z-40/);
  assert.match(a, /const \{ valoare, scrie, propsForm, propsZona, rezultate \} = useCautareHeader\(\{ categorie: "toate" \}\);/);
  assert.match(a, /if \(e\.key === "Escape"\) onInchide\(\);/);
  assert.match(a, /onClick=\{\(\) => setMeniuDeschis\(false\)\} \/>/, "un clic pe fundal inchide meniul");
  assert.match(a, /copii\.length > 0 \? \(\s*<button type="button" onClick=\{\(\) => setAles\(radacina\.key\)\}/);
});
