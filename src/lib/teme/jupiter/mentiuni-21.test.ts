import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { buildClassicDesign, section } from "@/lib/storefront/design/defaults";
import { parseStoreDesign } from "@/lib/storefront/design/parse";
import { variantMeta } from "@/lib/storefront/design/registry";
import { coloaneVazute } from "@/lib/storefront/design/subsol";
import type { BlockInstance, DesignContext, StoreDesign } from "@/lib/storefront/design/types";
import { temaDupaCheie } from "../teme";
import { DATE_DEMO_JUPITER, MENIU_DEMO_JUPITER } from "./date-demo";
import { coloaneSubsolJupiter, designJupiter } from "./design";

/*
 * Etapa 21 din `docs/editor-magazin/PLAN.md`, mentiunile lui dupa demo-ul Jupiter: golul de langa cautare, „Despre noi”,
 * pozele prea mari de pe pagina de produs, subsolul „mult mai premium”, fara banda de newsletter.
 */

const ctx: DesignContext = { primaryColor: "#215196", pageContent: {}, features: {} };
const cuDespre: DesignContext = { ...ctx, pageContent: { show_about: true }, tagline: "Sloganul lui" };

/** Codul fara comentarii. */
function cod(cale: string): string {
  return readFileSync(cale, "utf8").replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}
const ANTET = "src/components/storefront/sections/chrome/HeaderHipermarket.tsx";
const SUBSOL = "src/components/storefront/sections/chrome/FooterHipermarket.tsx";
const PAGINA = "src/components/storefront/sections/product/ProductPageDetailed.tsx";

test("1. antetul: cautarea ia tot randul, iar telefonul sta langa ea, nu in bara de navigare", () => {
  const a = cod(ANTET);
  assert.match(a, /<div className="hidden lg:block flex-1 min-w-0">\s*<CautareJupiter dreptunghi=\{dreptunghi\} \/>/);
  assert.doesNotMatch(a, /max-w-\[56rem\]/, "cu latime fixa ramanea golul de langa cautare");

  const cautare = a.indexOf("<CautareJupiter dreptunghi={dreptunghi} />");
  const telefon = a.indexOf("Suport clienti");
  const cos = a.indexOf("<Cos mode={cartMode}");
  const navigare = a.indexOf("hidden lg:block sticky");
  assert.ok(cautare > 0 && telefon > cautare && cos > telefon && navigare > cos, "cautarea, telefonul, cosul, apoi bara de navigare");
  assert.equal(a.split("Suport clienti").length - 1, 1, "telefonul o singura data");
  assert.match(a, /const telefon = settings\.showHotline !== false && !!business\.phone;/);
  assert.match(a, /\{pluralRo\(count\)\}/, "cosul spune cate produse are");
});

test("1. demo-ul: bara de navigare are raioanele cu produse, ca sa nu ramana doar cu „Acasa”", () => {
  const tema = temaDupaCheie("jupiter")!;
  assert.equal(tema.setariDemo.menu, MENIU_DEMO_JUPITER, "meniul e al demo-ului, nu al temei: la aplicare, al lui ramane");
  const raioane = MENIU_DEMO_JUPITER.filter((m) => m.type === "category");
  assert.ok(raioane.length >= 4);

  const copiiDe = new Map(DATE_DEMO_JUPITER.categorii.map((c) => [c.nume, c.copii]));
  for (const m of raioane) {
    assert.equal(m.label, m.target);
    assert.ok(copiiDe.has(m.target!), `${m.target}: nu e raion`);
    const nume = [m.target!, ...copiiDe.get(m.target!)!];
    assert.ok(DATE_DEMO_JUPITER.produse.some((p) => nume.includes(p.categorie)), `${m.target}: raion gol in meniu`);
  }
  assert.deepEqual([...new Set(MENIU_DEMO_JUPITER.map((m) => m.id))].length, MENIU_DEMO_JUPITER.length, "id-uri unice");
});

test("2. „Despre noi” nu se vede pe tema, dar ramane in lista, stins, si se poate aprinde", () => {
  for (const d of [
    designJupiter(cuDespre, null),
    designJupiter(cuDespre, null, parseStoreDesign(buildClassicDesign(cuDespre), cuDespre)),
    designJupiter(cuDespre, DATE_DEMO_JUPITER),
  ]) {
    const despre = d.home.find((s) => s.kind === "about");
    assert.ok(despre, "sectiunea lui ramane in lista");
    assert.equal(despre.enabled, false);
    const citit = parseStoreDesign(JSON.parse(JSON.stringify(d)), cuDespre);
    assert.equal(citit.home.find((s) => s.kind === "about")?.enabled, false, "parserul n-o reaprinde din `show_about`");
  }
});

test("2. celelalte sectiuni ale magazinului raman cu starea lor", () => {
  const baza = parseStoreDesign(buildClassicDesign(cuDespre), cuDespre);
  const dupa = designJupiter(cuDespre, null, baza);
  for (const k of ["contact", "reviews", "benefits", "gallery"] as const) {
    assert.equal(dupa.home.find((s) => s.kind === k)?.enabled, baza.home.find((s) => s.kind === k)?.enabled, k);
  }
});

function cuPagina(variant: string, sablon = false): StoreDesign {
  const d = parseStoreDesign(buildClassicDesign(ctx), ctx);
  const pagina = { ...d.product.page, variant, variantOverride: variant };
  return {
    ...d,
    product: {
      ...d.product,
      page: pagina,
      ...(sablon ? { sabloane: [
        { nume: "Detaliat", page: section("sablon_d", "product_page", "detailed"), categorii: ["Scule"], produse: [] },
        { nume: "Clasic", page: section("sablon_c", "product_page", "classic"), categorii: ["Mobila"], produse: [] },
      ] } : {}),
    },
  };
}

test("3. pagina de produs: tema tine galeria cat ecranul, oricare ar fi fost pagina magazinului", () => {
  for (const baza of [undefined, cuPagina("classic"), cuPagina("detailed")]) {
    const d = designJupiter(ctx, null, baza);
    assert.equal(d.product.page.variant, "detailed");
    assert.equal(d.product.page.settings.galleryHeight, "compact");
    const citit = parseStoreDesign(JSON.parse(JSON.stringify(d)), ctx);
    assert.equal(citit.product.page.settings.galleryHeight, "compact", "reglajul trece prin parser");
  }
});

test("3. sabloanele lui „Detaliat” primesc aceeasi galerie; pe celelalte reglajul n-are sens", () => {
  const s = designJupiter(ctx, null, cuPagina("detailed", true)).product.sabloane!;
  assert.equal(s.find((x) => x.nume === "Detaliat")?.page.settings.galleryHeight, "compact");
  assert.equal(s.find((x) => x.nume === "Clasic")?.page.settings.galleryHeight, undefined);
  assert.equal(designJupiter(ctx, null, cuPagina("detailed")).product.sabloane, undefined, "fara sabloane, nu apare lista");
});

test("3. ⚠ magazinele de azi nu se schimba: implicitul variantei ramane galeria patrata", () => {
  assert.equal(variantMeta("product_page", "detailed")?.defaults?.galleryHeight, "square");
  const p = cod(PAGINA);
  assert.match(p, /const galerieCompacta = setari\.galleryHeight === "compact";/);
  assert.match(p, /miniaturiInStanga=\{miniaturiInStanga\} compacta=\{galerieCompacta\} \/>/);
  assert.match(p, /\$\{compacta \? "bg-\[var\(--st-surface\)\] lg:aspect-auto lg:h-\[var\(--inaltime-galerie\)\]" : "bg-muted\/20"\}/, "fara `compacta`, panoul de dinainte, patrat si gri");
  // Coloanele 6/5 pe orice inaltime (proba temelor 2-30: galeria ajungea la 700-800 px pe temele late).
  assert.match(p, /lg:grid-cols-\[minmax\(0,6fr\)_minmax\(0,5fr\)\]/);
  assert.match(p, /const INALTIME_COMPACTA = "clamp\(24rem, calc\(100vh - 16rem\), 34rem\)";/);
});

test("4. subsolul temei n-are newsletter, iar coloana lui de identitate e prima", () => {
  const c = coloaneSubsolJupiter();
  assert.ok(!c.some((x) => x.type === "newsletter"));
  assert.equal(c[0].type, "identitate");
  assert.deepEqual(coloaneVazute(designJupiter(ctx, DATE_DEMO_JUPITER).chrome.footer).map((x) => x.id), ["identitate", "raioane", "comenzi", "informatii", "suport"]);
});

test("4. „Comenzi online” nu duce la cos (designul il tine in sertar), iar reducerile pleaca din radacina magazinului", () => {
  const linkuri = (r?: string) => (coloaneSubsolJupiter(r).find((x) => x.id === "comenzi")?.settings.linkuri ?? []) as { adresa: string }[];
  assert.deepEqual(linkuri().map((l) => l.adresa), ["/magazin", "/magazin?sale=1", "/retur"]);
  assert.deepEqual(linkuri("/produse").map((l) => l.adresa), ["/produse", "/produse?sale=1", "/retur"]);
});

test("4. ⚠ coloanele alese de el raman, cu tot cu un „Newsletter” pus de el, care se randeaza ca orice coloana", () => {
  const d = parseStoreDesign(buildClassicDesign(ctx), ctx);
  const aleLui: BlockInstance[] = [
    { id: "n", type: "newsletter", enabled: true, settings: { titlu: "Noutati", buton: "Vreau" } },
    { id: "c", type: "contact", enabled: true, settings: { titlu: "Contact" } },
  ];
  const baza = parseStoreDesign({ ...d, chrome: { ...d.chrome, footer: { ...d.chrome.footer, blocks: aleLui } } }, ctx);
  assert.deepEqual(designJupiter(ctx, null, baza).chrome.footer.blocks?.map((b) => b.id), ["n", "c"]);

  const f = cod(SUBSOL);
  assert.doesNotMatch(f, /ewsletter/, "nicio banda aparte");
  assert.match(f, /\{coloane\.map\(\(c\) => \(/);
  assert.match(cod("src/components/storefront/sections/chrome/FooterColumns.tsx"), /case "newsletter":/);
  assert.doesNotMatch(cod("src/components/storefront/sections/chrome/subsol-coloane.tsx"), /lipit/);
});

test("4. beneficiile sunt ale magazinului: insignele lui, cu comutator; partea legala ramane obligatorie", () => {
  const meta = variantMeta("footer", "hipermarket")!;
  assert.equal(meta.defaults?.beneficii, true);
  assert.ok(meta.fields.some((x) => x.key === "beneficii"));
  assert.doesNotMatch(meta.label, /newsletter/i);

  const f = cod(SUBSOL);
  assert.match(f, /const beneficii = sectiune\.settings\.beneficii !== false \? insigneDeAratat\(pageContent\.store_trust_badges\) : \[\];/);
  assert.match(f, /import \{ TRUST_ICONS \} from "\.\/UspStripIcons";/, "aceleasi iconite, nu o a doua lista");
  assert.match(f, /<FooterLegal ton=\{tonLegal\} cuPagini=\{false\} \/>/);
  assert.match(f, /<FooterCredit ton=\{tonLegal\} text=\{textCopyright\(sectiune, nume\)\} culoareEdinio="var\(--st-accent\)" \/>/);
});

test("4. pistele subsolului se fac din coloanele desenate: una goala nu lasa o gaura in dreapta", () => {
  const f = cod(SUBSOL);
  assert.match(f, /lg:grid-flow-col lg:auto-cols-fr/);
  assert.doesNotMatch(f, /sablonColoane/);
  // Celelalte subsoluri isi pastreaza culoarea cuvantului „Edinio”: doar acesta o cere altfel.
  const l = cod("src/components/storefront/sections/_shared/FooterLegal.tsx");
  assert.match(l, /const culoare = culoareEdinio \?\? \(contrastEdinio !== null && contrastEdinio < 4\.5 \? rezerva : color\);/);
  assert.match(l, /color=\{culoare\}/);
  assert.doesNotMatch(cod("src/components/storefront/sections/chrome/FooterColumns.tsx"), /culoareEdinio/);
});

test("4. culorile alese de el bat fundalul variantei, iar sigla sta pe placa doar cand exista", () => {
  const f = cod(SUBSOL);
  // Culorile alese de el (`culori`) vin ULTIMELE, deci bat si fundalul variantei, si accentul inlocuit pe fond.
  assert.match(f, /\.\.\.\(accentSters \? \{ "--st-accent": "#FFFFFF", "--st-accent-contrast": "#111827" \} : \{\}\),\s*\.\.\.culori,\s*\} as CSSProperties;/);
  assert.match(f, /const tonLegal = culori \? "deschis" : "inchis";/);
  assert.match(f, /placaSigla: true,/);
  // Fara sigla, numele magazinului e scris cu culoarea subsolului: pe o placa alba n-ar mai fi citit.
  assert.match(cod("src/components/storefront/sections/chrome/FooterColumns.tsx"), /stil\.placaSigla && business\.logo_url \? "w-fit max-w-full rounded-md bg-white px-4 py-3" : ""/);
});
