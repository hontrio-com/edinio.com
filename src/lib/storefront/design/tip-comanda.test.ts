import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import type { DesignContext, StoreDesign } from "./types";
import { buildClassicDesign } from "./defaults";
import { parseStoreDesign, resolveDesign } from "./parse";
import { checkoutOnPage } from "./commerce";
import {
  aplicaTipulComenzii, ETICHETA_TIP_COMANDA, tipComandaDinPageContent, tipulComenzii, tipulVariantei, varianteDeAles,
} from "./tip-comanda";
import { sectionMeta } from "./registry";
import { formularDeSalvat, formularDinPageContent } from "@/lib/dashboard/formular-comanda";
import { adresaPrevizualizarii, NOTA_COMANDA_IN_FEREASTRA, notaPaginii, type MagazinPentruPagini } from "@/lib/editor-magazin/pagini";
import { SETARI_EDITOR } from "@/lib/editor-magazin/setari";

/*
 * Etapa 15 (mentiunea 4 din 28.10, seara): tipul de checkout se alege in Setări > Comanda, nu din „Schimbă designul”.
 * Raspunsul lui: „În Setări > Comanda”.
 */

const ctx: DesignContext = { primaryColor: "#07c527", pageContent: {}, features: {} };
const cuTip = (tip: unknown): DesignContext => ({ ...ctx, pageContent: { checkout_config: { tip } } });

/** Designul clasic, cu finalizarea in varianta data. */
function cuComanda(variant: string): StoreDesign {
  const d = parseStoreDesign(buildClassicDesign(ctx), ctx);
  return { ...d, commerce: { ...d.commerce, checkout: { ...d.commerce.checkout, variant } } };
}

test("tipul salvat: doar „fereastra” si „pagina”; orice altceva e „nimic salvat”", () => {
  assert.equal(tipComandaDinPageContent({ checkout_config: { tip: "pagina" } }), "pagina");
  assert.equal(tipComandaDinPageContent({ checkout_config: { tip: "fereastra" } }), "fereastra");
  for (const pc of [{}, null, undefined, "x", { checkout_config: null }, { checkout_config: [] }, { checkout_config: { tip: "modal" } }, { checkout_config: { tip: 1 } }]) {
    assert.equal(tipComandaDinPageContent(pc), null, JSON.stringify(pc));
  }
});

test("variantele de azi: `classic` e fereastra, `page_two_col` e pagina; numele din panou", () => {
  assert.equal(tipulVariantei("classic"), "fereastra");
  assert.equal(tipulVariantei("page_two_col"), "pagina");
  assert.equal(tipulComenzii(cuComanda("page_two_col")), "pagina");
  assert.equal(tipulComenzii(cuComanda("classic")), "fereastra");
  assert.equal(ETICHETA_TIP_COMANDA.fereastra, "Formular de comandă, în fereastră");
  assert.equal(ETICHETA_TIP_COMANDA.pagina, "Standard, pagină de finalizare");
});

test("aplicarea: schimba varianta doar cand nu se potriveste, iar restul designului e acelasi obiect", () => {
  const fereastra = cuComanda("classic");
  assert.equal(aplicaTipulComenzii(fereastra, null), fereastra, "nimic salvat: designul neatins");
  assert.equal(aplicaTipulComenzii(fereastra, "fereastra"), fereastra, "acelasi tip: neatins");

  const pagina = aplicaTipulComenzii(fereastra, "pagina");
  assert.equal(pagina.commerce.checkout.variant, "page_two_col");
  assert.equal(checkoutOnPage(pagina), true);
  assert.equal(pagina.commerce.checkout.id, fereastra.commerce.checkout.id, "aceeasi sectiune, alta varianta");
  assert.equal(pagina.home, fereastra.home);
  assert.equal(pagina.chrome, fereastra.chrome);
  assert.equal(pagina.commerce.cartDrawer, fereastra.commerce.cartDrawer);

  const inapoi = aplicaTipulComenzii(pagina, "fereastra");
  assert.equal(inapoi.commerce.checkout.variant, "classic");
  assert.equal(checkoutOnPage(inapoi), false);
  assert.equal(fereastra.commerce.checkout.variant, "classic", "designul primit nu se modifica pe loc");
});

test("la citire, magazinul urmeaza tipul salvat; fara tip, designul, ca inainte", () => {
  const peFereastra = buildClassicDesign(ctx);
  const pePagina = cuComanda("page_two_col");
  assert.equal(checkoutOnPage(resolveDesign(peFereastra, cuTip("pagina")).design), true);
  assert.equal(checkoutOnPage(resolveDesign(pePagina, cuTip("fereastra")).design), false);
  assert.equal(checkoutOnPage(resolveDesign(pePagina, ctx).design), true, "nimic salvat: cum spune designul");
  assert.equal(checkoutOnPage(resolveDesign(peFereastra, ctx).design), false);
  assert.equal(checkoutOnPage(resolveDesign(pePagina, cuTip("altceva")).design), true, "o valoare stricata nu schimba nimic");
});

test("⚠ tipul NU intra in design: parserul (deci ciorna, „Publică”, istoricul) pastreaza varianta salvata", () => {
  const pePagina = cuComanda("page_two_col");
  assert.equal(parseStoreDesign(pePagina, cuTip("fereastra")).commerce.checkout.variant, "page_two_col");
  assert.equal(parseStoreDesign(buildClassicDesign(ctx), cuTip("pagina")).commerce.checkout.variant, "classic");
});

test("galeria: la finalizarea comenzii doar design-urile tipului ales, deci azi fara „Schimbă designul”", () => {
  assert.deepEqual(varianteDeAles({ kind: "checkout", variant: "classic" }).map(([k]) => k), ["classic"]);
  assert.deepEqual(varianteDeAles({ kind: "checkout", variant: "page_two_col" }).map(([k]) => k), ["page_two_col"]);
  const hero = Object.keys(sectionMeta("hero")!.variants);
  assert.deepEqual(varianteDeAles({ kind: "hero", variant: hero[0] }).map(([k]) => k), hero, "celelalte sectiuni, toate");
});

test("formularul: tipul ramane la citire si la salvare, cel stricat cade, restul cheilor neatinse", () => {
  const citit = formularDinPageContent({ checkout_config: { tip: "pagina", hidden_fields: ["discount"], cheie_noua: 1 } });
  assert.equal(citit.tip, "pagina");
  assert.deepEqual(citit.hidden_fields, ["discount"]);
  assert.equal((citit as Record<string, unknown>).cheie_noua, 1);
  assert.equal(formularDeSalvat(citit).tip, "pagina");
  assert.equal("tip" in formularDinPageContent({ checkout_config: { tip: "modal" } }), false);
  assert.equal("tip" in formularDinPageContent({}), false);
});

test("editorul: pagina „Finalizarea comenzii” se previzualizeaza dupa designul cu tipul aplicat", () => {
  const m: MagazinPentruPagini = { slug: "floraria", produsSlug: null, unSingurProdus: false };
  const fereastra = cuComanda("classic");
  assert.match(adresaPrevizualizarii("comanda", aplicaTipulComenzii(fereastra, "pagina"), m), /^\/floraria\/checkout\?/);
  assert.match(adresaPrevizualizarii("comanda", aplicaTipulComenzii(cuComanda("page_two_col"), "fereastra"), m), /^\/floraria\?/);
  assert.equal(notaPaginii("comanda", fereastra, m), NOTA_COMANDA_IN_FEREASTRA);
  assert.equal(notaPaginii("comanda", aplicaTipulComenzii(fereastra, "pagina"), m), null);
  assert.doesNotMatch(NOTA_COMANDA_IN_FEREASTRA, /Alege un design/);
});

test("Setări: „Comanda” in locul „Formular de comandă”, pe aceeasi cheie (adresele vechi)", () => {
  const s = SETARI_EDITOR.find((x) => x.cheie === "formular")!;
  assert.equal(s.titlu, "Comanda");
  assert.match(s.descriere, /^Tipul de checkout/);
});

/** Codul fara comentarii. */
function cod(cale: string): string {
  return readFileSync(cale, "utf8").replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

test("panoul „Comanda”: cardurile tipului scriu `tip` in formular, iar salvarea trimite tot doar `checkout_config`", () => {
  const p = cod("src/components/editor-magazin/setari/PanouriSetari.tsx");
  assert.match(p, /<Grup titlu="Tipul de checkout">/);
  assert.match(p, /name="st-tip-comanda" value=\{valoare\} checked=\{config\.tip === valoare\}/);
  assert.match(p, /onChange=\{\(\) => setConfig\(\(c\) => \(\{ \.\.\.c, tip: valoare \}\)\)\}/);
  assert.match(p, /\{ETICHETA_TIP_COMANDA\[valoare\]\}/);
  const h = cod("src/components/editor-magazin/setari/useSetariMagazin.ts");
  assert.match(h, /\(\{ \.\.\.f, tip: f\.tip \?\? tipImplicit, custom_fields: f\.custom_fields \?\? \[\], extras: f\.extras \?\? \[\] \}\)/);
  assert.match(h, /const tipSalvat: TipComanda = salvat\.tip \?\? tipImplicit;/);
  assert.match(h, /updatePageContent\(businessId, \{ checkout_config: curat \}\)/);
  assert.match(cod("src/app/(dashboard)/dashboard/editor/page.tsx"), /tipComandaImplicit: tipulComenzii\(publicat\),/);
});

test("editorul: previzualizarea, adresa ei si nodurile merg dupa tipul SALVAT; ciorna ramane neatinsa", () => {
  const e = cod("src/components/editor-magazin/EditorMagazin.tsx");
  assert.match(e, /const tipComanda = setari\.formular\.tipSalvat;\s*const designViu = useMemo\(\(\) => aplicaTipulComenzii\(design, tipComanda\), \[design, tipComanda\]\);/);
  assert.match(e, /adresaPrevizualizarii\(pagina, designViu, /);
  assert.match(e, /const trimiteAcum = useRef\(\{ design: designViu, ctxStil \}\);/);
  assert.match(e, /useEffect\(\(\) => \{ trimiteAcum\.current = \{ design: designViu, ctxStil \}; \}, \[designViu, ctxStil\]\);/);
  assert.match(e, /\.\.\.sectiunilePaginii\(designViu, pagina, paginiAfisate, sablonActiv\),/);
  assert.match(e, /tipComanda=\{tipComanda\}/);
  assert.doesNotMatch(e, /ciorna\.aplica\([^)]*aplicaTipulComenzii/, "tipul nu se scrie in ciorna");
});

test("pagina „Finalizarea comenzii”: caseta tipului in arbore si in panou, cu trimiterea spre Setări > Comanda", () => {
  const a = cod("src/components/editor-magazin/ArboreSectiuni.tsx");
  // Gasit la proba 15.4: randul comenzii scria designul din ciorna sub caseta cu alt tip.
  assert.match(a, /const \{ aplica \} = ciorna;\s*const design = aplicaTipulComenzii\(ciorna\.design, tipComanda\);/);
  assert.match(a, /\{pagina === "comanda" \? \(\s*<div className="mb-2"><CasetaTipComanda tip=\{tipComanda\} \/><\/div>\s*\) : nota && \(/);
  const n = cod("src/components/editor-magazin/PanouNod.tsx");
  assert.match(n, /\{sectiune\.kind === "checkout" && <CasetaTipComanda tip=\{tipulVariantei\(sectiune\.variant\)\} \/>\}/);
  assert.match(n, /return meta\?\.inCatalog \? varianteDeAles\(s\)\.length : 0;/);
  assert.match(cod("src/components/editor-magazin/CasetaTipComanda.tsx"), /<TrimitereSetare setare="formular">Schimbă tipul în Setări<\/TrimitereSetare>/);
  assert.match(cod("src/components/store-editor/DesignGallery.tsx"), /const variante = varianteDeAles\(section\);/);
});

test("„Pagini”: tipul din Setări > Comanda, iar randul comenzii duce acolo", () => {
  const p = cod("src/app/(dashboard)/dashboard/pages/page.tsx");
  assert.match(p, /const design = aplicaTipulComenzii\(aplicaPaginaAcasa\(parseStoreDesign\(/);
  assert.match(p, /\}\), ss\?\.page_content\), tipComandaDinPageContent\(ss\?\.page_content\)\);/);
  const l = cod("src/components/pages/PagesListClient.tsx");
  assert.match(l, /alege: \{ href: adresaSetarii\("formular"\), eticheta: "Alege tipul" \},/);
});
