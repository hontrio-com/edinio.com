import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { adaugaColoana, duplicaColoana, MAX_COLOANE_SUBSOL, parseBlocuri, poateAdaugaColoana, schemaBlocurilor, setariColoana, stergeColoana, TIPURI_COLOANE_SUBSOL } from "./blocuri";
import { blocDinMagazin } from "./continut-publicat";
import { buildClassicDesign } from "./defaults";
import { completeazaBlocurileSectiunii, schimbaBlocurile, updateSection } from "./edit";
import { parseStoreDesign } from "./parse";
import { sectionMeta, variantMeta } from "./registry";
import { coloaneSubsol, coloaneVazute, culoriSubsol, etichetaColoanei, inapoiSusPornit, sablonColoane, subsolCereCategorii, textCopyright } from "./subsol";
import type { BlockInstance, DesignContext, SectionInstance, StoreDesign } from "./types";

/**
 * Subsolul pe coloane-bloc (etapa 11 din `docs/editor-magazin/PLAN.md`): coloanele implicite (magazinele de azi
 * arata la fel), citirea, operatiile, reglajele intregului subsol.
 *
 * Rulare: `npm test`.
 */

const ctx = (): DesignContext => ({ primaryColor: "#07c527", pageContent: {}, features: {} });
const citit = (d: unknown) => parseStoreDesign(JSON.parse(JSON.stringify(d)), ctx());
const SCHEMA = schemaBlocurilor("footer", "dark")!;
/** Un design salvat, cu subsolul dat (varianta si reglajele), fara coloane. */
function cuSubsol(variant: string, settings: Record<string, unknown> = {}, blocks?: unknown): StoreDesign {
  const d = buildClassicDesign(ctx());
  const subsol: Record<string, unknown> = { id: "footer", kind: "footer", variant, enabled: true, settings };
  if (blocks !== undefined) subsol.blocks = blocks;
  return citit({ ...d, chrome: { ...d.chrome, footer: subsol } });
}
const tipuri = (s: SectionInstance) => (s.blocks ?? []).map((b) => `${b.id}:${b.type}`);

// ── Coloanele de azi ─────────────────────────────────────────────────────────

test("⚠⚠ magazinul fara design salvat are subsolul de azi: identitate, „Magazin”, „Informatii”, „Contact”", () => {
  const d = parseStoreDesign({}, ctx());
  assert.deepEqual(tipuri(d.chrome.footer), ["identitate:identitate", "magazin:linkuri", "informatii:linkuri", "contact:contact"]);
  const [identitate, magazin, informatii, contact] = d.chrome.footer.blocks!;
  assert.deepEqual(identitate.settings, { arataLogo: true, arataSloganul: false, arataRetelele: true });
  assert.deepEqual(magazin.settings, { titlu: "Magazin", sursa: "categorii", toateProdusele: true, cate: 6 });
  assert.deepEqual(informatii.settings, { titlu: "Informatii", sursa: "pagini" });
  assert.deepEqual(contact.settings, { titlu: "Contact", telefon: true, whatsapp: true, email: true, oras: true });
  assert.ok(d.chrome.footer.blocks!.every((b) => b.enabled));
});

test("⚠⚠ designurile salvate fara coloane primesc coloanele designului lor; sloganul dupa `showTagline`", () => {
  for (const v of ["dark", "columns"]) {
    assert.deepEqual(tipuri(cuSubsol(v).chrome.footer), ["identitate:identitate", "magazin:linkuri", "informatii:linkuri", "contact:contact"], v);
  }
  const centrat = cuSubsol("centered").chrome.footer;
  assert.deepEqual(tipuri(centrat), ["identitate:identitate", "informatii:linkuri", "contact:contact", "retele:retele"]);
  assert.deepEqual(centrat.blocks![0].settings, { arataLogo: true, arataSloganul: false, arataRetelele: false }, "retelele vin dupa contact, ca pana acum");
  assert.deepEqual(centrat.blocks![1].settings, { sursa: "pagini" }, "fara titlu: paginile pe un rand");
  assert.equal(centrat.blocks![2].settings.oras, false, "centratul nu arata orasul");
  assert.equal(cuSubsol("dark", { showTagline: true }).chrome.footer.blocks![0].settings.arataSloganul, true);
  assert.equal(cuSubsol("centered", { showTagline: true }).chrome.footer.blocks![0].settings.arataSloganul, true);
});

test("⚠ citirea e idempotenta (garda cioarnei se sprijina pe asta) si o lista golita anume ramane goala", () => {
  for (const d of [cuSubsol("dark"), cuSubsol("centered"), cuSubsol("columns", { inapoiSus: true, copyright: "Firma SRL" })]) {
    assert.deepEqual(citit(d), d);
  }
  // Designul clasic nu trece prin parser (`{}` il intoarce direct), iar titlul randului „Recomandate” nu ramane la
  // recitire, de dinainte de etapa 11; subsolul lui, da.
  const clasic = parseStoreDesign({}, ctx());
  assert.deepEqual(citit(clasic).chrome.footer, clasic.chrome.footer);
  const gol = cuSubsol("dark", {}, []);
  assert.deepEqual(gol.chrome.footer.blocks, [], "nu revin coloanele sterse");
  assert.deepEqual(citit(gol).chrome.footer.blocks, []);
});

test("schimbarea designului pastreaza coloanele omului; fara coloane, le ia pe ale designului nou", () => {
  const d = cuSubsol("dark");
  const cuText = schimbaBlocurile(d, "footer", (l, s) => adaugaColoana(l, s, "text"));
  const centrat = completeazaBlocurileSectiunii(updateSection(cuText, "footer", { variant: "centered" }), "footer", {});
  assert.deepEqual(centrat.chrome.footer.blocks!.map((b) => b.type), ["identitate", "linkuri", "linkuri", "contact", "text"]);
  assert.equal(coloaneSubsol({ variant: "centered", settings: {} }).at(-1)?.type, "retele", "o miniatura fara coloane: ale designului ei");
});

// ── Citirea coloanelor ───────────────────────────────────────────────────────

test("coloanele trec prin curatare: tipuri cunoscute, cele unice o data, cel mult 8, reglajele pe campurile lor", () => {
  const brut = [
    { id: "a", type: "identitate", settings: { arataLogo: "da", text: "Salut", extra: 1 } },
    { id: "b", type: "identitate" },
    { id: "c", type: "necunoscut" },
    { id: "d", type: "linkuri", settings: { titlu: "x".repeat(90), sursa: "alta", linkuri: [{ eticheta: "Contact", adresa: "/contact" }, { eticheta: "Rau", adresa: "javascript:alert(1)" }] } },
    { id: "e", type: "imagine", settings: { imagine: "data:image/png;base64,AA", latime: 9999 } },
    ...Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, type: "text", settings: { text: "t" } })),
  ];
  const l = parseBlocuri(brut, SCHEMA);
  assert.equal(l.length, MAX_COLOANE_SUBSOL);
  assert.deepEqual(l.slice(0, 3).map((b) => b.type), ["identitate", "linkuri", "imagine"], "a doua identitate si tipul necunoscut ies");
  assert.deepEqual(l[0].settings, { text: "Salut" }, "doar campurile cunoscute, cu tipul lor");
  assert.equal((l[1].settings.titlu as string).length, 60);
  assert.equal(l[1].settings.sursa, undefined, "o sursa necunoscuta nu ramane");
  assert.deepEqual(l[1].settings.linkuri, [{ eticheta: "Contact", adresa: "/contact" }, { eticheta: "Rau" }], "adresa `javascript:` iese");
  assert.deepEqual(l[2].settings, { latime: 320 }, "imaginea `data:` iese, latimea se taie la plafon");
  // Id-urile: stabile, unice.
  const dublu = parseBlocuri([{ id: "x", type: "text" }, { id: "x", type: "text" }, { type: "text" }], SCHEMA);
  assert.deepEqual(dublu.map((b) => b.id), ["x", "x_2", "text_2"]);
  assert.deepEqual(parseBlocuri(dublu, SCHEMA).map((b) => b.id), ["x", "x_2", "text_2"], "a doua citire, aceleasi id-uri");
});

test("ochiul coloanei: ascunsa ramane in lista, dar nu se vede", () => {
  const d = cuSubsol("dark", {}, [{ id: "contact", type: "contact", enabled: false, enabledOverride: false, settings: { titlu: "Contact" } }]);
  assert.equal(d.chrome.footer.blocks![0].enabled, false);
  assert.deepEqual(coloaneVazute(d.chrome.footer), []);
});

// ── Operatiile ───────────────────────────────────────────────────────────────

test("adaugarea: la loc, cu reglajele implicite; cele unice nu se dubleaza; plafonul", () => {
  const l = cuSubsol("dark").chrome.footer.blocks!;
  const dupaMagazin = adaugaColoana(l, SCHEMA, "text", { dupa: "magazin" });
  assert.equal(dupaMagazin[2].type, "text");
  assert.deepEqual(dupaMagazin[2].settings, { titlu: "Despre noi", text: "Scrie aici cateva randuri despre magazinul tau." });
  assert.equal(adaugaColoana(l, SCHEMA, "text", { inainte: "identitate" })[0].type, "text");
  assert.equal(adaugaColoana(l, SCHEMA, "text").at(-1)?.type, "text", "fara loc, la capat");
  assert.equal(adaugaColoana(l, SCHEMA, "contact"), l, "Contact e deja pus");
  assert.equal(poateAdaugaColoana(l, SCHEMA, "contact"), false);
  assert.equal(poateAdaugaColoana(l, SCHEMA, "newsletter"), true);
  assert.equal(adaugaColoana(l, SCHEMA, "pret"), l, "tip necunoscut");
  let plin: readonly BlockInstance[] = l;
  for (let i = 0; i < 10; i++) plin = adaugaColoana(plin, SCHEMA, "text");
  assert.equal(plin.length, MAX_COLOANE_SUBSOL);
  // Reglajele implicite sunt copii, nu aceleasi obiecte.
  const doua = adaugaColoana(adaugaColoana([], SCHEMA, "linkuri"), SCHEMA, "linkuri");
  assert.notEqual(doua[0].settings, doua[1].settings);
  assert.notEqual(doua[0].settings.linkuri, doua[1].settings.linkuri);
});

test("duplicarea (nu la cele unice), stergerea, reglajele", () => {
  const l = cuSubsol("dark").chrome.footer.blocks!;
  const d = duplicaColoana(l, SCHEMA, "magazin");
  assert.equal(d.length, l.length + 1);
  assert.equal(d[2].type, "linkuri");
  assert.notEqual(d[2].id, "magazin");
  assert.deepEqual(d[2].settings, l[1].settings);
  assert.equal(duplicaColoana(l, SCHEMA, "contact"), l, "Contact e unic");
  assert.deepEqual(stergeColoana(l, SCHEMA, "magazin").map((b) => b.id), ["identitate", "informatii", "contact"]);
  assert.equal(stergeColoana(l, SCHEMA, "nu-exista"), l);
  const reglat = setariColoana(l, SCHEMA, "contact", { titlu: "Suna-ne", telefon: true });
  assert.deepEqual(reglat[3].settings, { titlu: "Suna-ne", telefon: true });
  assert.equal(setariColoana(l, SCHEMA, "nu-exista", {}), l);
});

test("toate tipurile de coloana au reglaje implicite curate (o coloana noua, citita, ramane la fel)", () => {
  for (const tip of TIPURI_COLOANE_SUBSOL) {
    const l = adaugaColoana([], SCHEMA, tip);
    assert.equal(l.length, 1, tip);
    assert.deepEqual(parseBlocuri(JSON.parse(JSON.stringify(l)), SCHEMA)[0].settings, l[0].settings, tip);
  }
});

// ── Reglajele intregului subsol si ce citeste magazinul ──────────────────────

test("reglajele subsolului in registru: aceleasi pe toate trei designurile; sloganul vechi retras", () => {
  for (const v of ["dark", "columns", "centered"]) {
    const campuri = variantMeta("footer", v)!.fields;
    assert.deepEqual(campuri.map((c) => c.key), ["showTagline", "inapoiSus", "copyright", "fundal", "culoareText"], v);
    assert.ok(campuri[0].retras, "„Arata sloganul” nu mai apare: il tine coloana „Logo și text”");
    assert.equal(variantMeta("footer", v)!.needsCategories, undefined, "categoriile le cere coloana, nu designul");
  }
  assert.equal(variantMeta("footer", "centered")!.defaults?.inapoiSus, true);
  assert.equal(sectionMeta("footer")!.removable, false);
});

test("„Înapoi sus”, copyright, categoriile cerute, latimile coloanelor", () => {
  assert.equal(inapoiSusPornit({ variant: "centered", settings: {} }), true, "ca pana acum");
  assert.equal(inapoiSusPornit({ variant: "dark", settings: {} }), false);
  assert.equal(inapoiSusPornit({ variant: "dark", settings: { inapoiSus: true } }), true);
  assert.equal(textCopyright({ variant: "dark", settings: {} }, "Floraria"), "Floraria");
  assert.equal(textCopyright({ variant: "dark", settings: { copyright: "  " } }, "Floraria"), "Floraria");
  assert.equal(textCopyright({ variant: "dark", settings: { copyright: "Floraria SRL" } }, "Floraria"), "Floraria SRL");
  assert.equal(subsolCereCategorii(cuSubsol("dark").chrome.footer), true, "„Magazin” arata categorii");
  assert.equal(subsolCereCategorii(cuSubsol("centered").chrome.footer), false, "ca pana acum");
  const centratCuCategorii = schimbaBlocurile(cuSubsol("centered"), "footer", (l) => [...l, { id: "c", type: "linkuri", enabled: true, settings: { sursa: "categorii" } }]);
  assert.equal(subsolCereCategorii(centratCuCategorii.chrome.footer), true);
  const ascunsa = schimbaBlocurile(cuSubsol("dark"), "footer", (l) => l.map((b) => (b.id === "magazin" ? { ...b, enabled: false } : b)));
  assert.equal(subsolCereCategorii(ascunsa.chrome.footer), false, "coloana ascunsa nu cere nimic");
  assert.equal(sablonColoane(cuSubsol("dark").chrome.footer.blocks!), "1.4fr 1fr 1fr 1.2fr", "exact grila de azi");
  assert.equal(etichetaColoanei({ type: "linkuri", settings: { titlu: "Magazin" } }), "Linkuri: Magazin");
  assert.equal(etichetaColoanei({ type: "retele", settings: {} }), "Rețele sociale");
});

test("culorile: nimic ales = nimic schimbat; fundalul singur isi alege textul dupa contrast", () => {
  assert.equal(culoriSubsol({ variant: "dark", settings: {} }), undefined);
  assert.equal(culoriSubsol({ variant: "dark", settings: { fundal: "javascript:x" } }), undefined, "doar culori curate");
  const deschis = culoriSubsol({ variant: "columns", settings: { fundal: "#FFF7ED" } })!;
  assert.equal(deschis["--st-bg"], "#FFF7ED");
  assert.equal(deschis["--st-footer-bg"], "#FFF7ED");
  assert.equal(deschis["--st-text"], "#111827", "pe deschis, text inchis");
  const inchis = culoriSubsol({ variant: "columns", settings: { fundal: "#1E3A5F" } })!;
  assert.equal(inchis["--st-footer-text"], "#FFFFFF", "pe inchis, text alb");
  assert.match(inchis["--st-muted"], /color-mix\(in srgb, #FFFFFF 62%, transparent\)/);
  const doarText = culoriSubsol({ variant: "dark", settings: { culoareText: "#FDE68A" } })!;
  assert.equal(doarText["--st-footer-bg"], undefined, "fundalul ramane al designului");
  assert.equal(doarText["--st-footer-text"], "#FDE68A");
});

// ── Newsletterul din subsol (serverul) ───────────────────────────────────────

test("⚠⚠ newsletterul din subsol: serverul gaseste DOAR o coloana aprinsa „Newsletter” a subsolului dat", () => {
  const cuNewsletter = schimbaBlocurile(cuSubsol("dark"), "footer", (l, s) => adaugaColoana(l, s, "newsletter"));
  const id = cuNewsletter.chrome.footer.blocks!.find((b) => b.type === "newsletter")!.id;
  const gasit = blocDinMagazin(cuNewsletter, {}, { sectiune: "footer", bloc: null }, id);
  assert.deepEqual(gasit, { bloc: { id, type: "newsletter" }, loc: "Subsol" });
  // Alta coloana, alt id, coloana ascunsa, o cale sub subsol: nimic.
  assert.equal(blocDinMagazin(cuNewsletter, {}, { sectiune: "footer", bloc: null }, "contact"), null);
  assert.equal(blocDinMagazin(cuNewsletter, {}, { sectiune: "footer", bloc: null }, "nu-exista"), null);
  assert.equal(blocDinMagazin(cuNewsletter, {}, { sectiune: "footer", bloc: id }, id), null);
  const ascuns = schimbaBlocurile(cuNewsletter, "footer", (l) => l.map((b) => (b.id === id ? { ...b, enabled: false } : b)));
  assert.equal(blocDinMagazin(ascuns, {}, { sectiune: "footer", bloc: null }, id), null, "ascunsa nu primeste mesaje");
  // Subsolul de azi n-are newsletter.
  assert.equal(blocDinMagazin(cuSubsol("dark"), {}, { sectiune: "footer", bloc: null }, "identitate"), null);
});

// ── Legaturile din cod: randarea ─────────────────────────────────────────────

const RAD = process.cwd();
const cod = (f: string) => readFileSync(path.join(RAD, f), "utf8").replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("⚠⚠ fiecare design de subsol randeaza coloanele lui SI, mereu, partea legala si randul de copyright", () => {
  for (const f of ["src/components/storefront/sections/chrome/FooterColumns.tsx", "src/components/storefront/sections/chrome/FooterCentered.tsx"]) {
    const c = cod(f);
    assert.match(c, /const coloane = coloaneVazute\(sectiune\);/, f);
    assert.match(c, /<MarcajBloc key=\{c\.id\} idSectiune=\{sectiune\.id\} idBlocului=\{c\.id\} eticheta=\{etichetaColoanei\(c\)\}>/, f);
    // Partea legala nu sta sub nicio conditie (OUG 18/2026, ANPC, politicile).
    assert.match(c, /\n\s*<FooterLegal ton=(\{[^}]+\}|"[a-z]+") cuPagini=\{false\} \/>/, f);
    assert.match(c, /\n\s*<FooterCredit ton=(\{[^}]+\}|"[a-z]+") text=\{textCopyright\(sectiune, nume\)\} \/>/, f);
    assert.doesNotMatch(c, /\{[^}]*&&\s*<FooterLegal/, `${f}: partea legala nu se ascunde`);
    assert.match(c, /culoriSubsol\(sectiune\)/, f);
    assert.match(c, /inapoiSusPornit\(sectiune\) &&/, f);
  }
  const r = cod("src/components/storefront/SectionRenderer.tsx");
  assert.match(r, /return Varianta \? <Varianta sectiune=\{section\} \/> : <FooterDark sectiune=\{section\} \/>;/);
  // Miniatura designului activ arata coloanele omului.
  assert.match(cod("src/app/(public)/preview-sectiune/[slug]/page.tsx"), /kind === "footer" && sectiuneaReala\?\.variant === variantParam && sectiuneaReala\.blocks \? \{ blocks: sectiuneaReala\.blocks \}/);
});

test("newsletterul din subsol trimite prin `aboneazaNewsletter`, cu calea subsolului, acordul si capcana; in editor nu trimite", () => {
  const c = cod("src/components/storefront/sections/chrome/subsol-coloane.tsx");
  assert.match(c, /aboneazaNewsletter\(\{ businessId: business\.id, blockId: coloana\.id, cale: idSubsol, email, acord, honeypot: capcana \}\)/);
  assert.match(c, /if \(esteEditorDesign \|\| trimit\) return;/);
  assert.match(c, /if \(!acord\) \{ setEroare\(/);
  // Linkurile alese trec prin `resolveHref` (relative la magazin, scheme periculoase -> „#”).
  assert.match(c, /href: resolveHref\(adresa, basePath\)/);
});

// ── Legaturile din cod: editorul ─────────────────────────────────────────────

test("⚠ arborele: coloanele subsolului sub „Subsol”, cu sageti, ochi si „Adaugă coloană”", () => {
  const a = cod("src/components/editor-magazin/ArboreSectiuni.tsx");
  assert.match(a, /<ArboreBlocuri sectiune=\{design\.chrome\.footer\} aplica=\{aplica\} blocSelectat=\{selectat === design\.chrome\.footer\.id \? blocSelectat : null\}[\s\S]*?onAdaugaColoana=\{onAdaugaColoana\} \/>/);
  assert.match(a, /eticheta="Subsol" selectat=\{selectat === design\.chrome\.footer\.id && !blocSelectat\}/, "cu o coloana deschisa, randul subsolului nu pare selectat");
  assert.match(a, /\{cuColoane && onAdaugaColoana && \(/);
  assert.match(a, /if \(aleZonei\.length === 0 && !tipContinut && !cuColoane\) return null;/, "zona apare si goala, ca prima coloana sa se poata pune");
});

test("⚠⚠ editorul: panoul coloanei inaintea panoului de bloc, lista „Adaugă coloană”, cererea inchisa odata cu celelalte", () => {
  const e = cod("src/components/editor-magazin/EditorMagazin.tsx");
  const iColoana = e.indexOf('sectiuneSelectata && blocDeschis && sectiuneSelectata.kind === "footer" ? (');
  const iBloc = e.indexOf(") : sectiuneSelectata && blocDeschis ? (");
  assert.ok(iColoana > 0 && iBloc > iColoana, "o coloana nu ajunge in panoul blocurilor paginii de produs");
  assert.match(e, /<PanouAdaugaColoana subsol=\{design\.chrome\.footer\} date=\{dateBlocuri\} locText=\{coloanaNouaCeruta\.locText\}/);
  assert.match(e, /if \(a\.fel === "coloana-subsol"\) \{\s*setColoanaNouaCeruta\(a\);\s*return;\s*\}/, "„+” de pe o coloana deschide lista cu locul ei");
  assert.match(e, /adaugaColoana\(l, sch, tip, cerere\.loc\)/);
  // Oriunde se inchide cererea de continut nou, se inchide si cea de coloana: altfel lista ar fi ramas peste alt panou.
  const inchideri = e.split("setContinutNouCerut(null);").length - 1;
  const cuColoana = e.split(/setContinutNouCerut\(null\);\s*setColoanaNouaCeruta\(null\);/).length - 1;
  assert.ok(inchideri >= 10);
  assert.equal(cuColoana, inchideri - 1, "toate, in afara de deschiderea listei din arbore, care o pune imediat dupa");
});

test("panoul coloanei: reglajul peste ce e ACUM in ciorna, ochiul, stergerea; lista: unicele si newsletterul fara furnizor, oprite", () => {
  const p = cod("src/components/editor-magazin/PanouColoanaSubsol.tsx");
  assert.match(p, /setariColoana\(l, sch, coloana\.id, \{ \.\.\.\(l\.find\(\(b\) => b\.id === coloana\.id\)\?\.settings \?\? \{\}\), \[cheie\]: valoare \}\)/);
  assert.match(p, /`coloana:\$\{coloana\.id\}:\$\{cheie\}`/, "tastarea intr-un camp e un singur pas la Anulează");
  assert.match(p, /comutaBloc\(l, sch, coloana\.id\)/);
  assert.match(p, /opereaza\(\(l, sch\) => stergeColoana\(l, sch, coloana\.id\)\); onInapoi\(\);/);
  assert.match(p, /tip === "newsletter" && !newsletterPermis\(date\)/);
  assert.match(p, /!poateAdaugaColoana\(coloane, schema, tip\) \? "E deja în subsol\." : null/);
  // Culoarea care poate lipsi se poate readuce la „Implicită”.
  const st = cod("src/components/store-editor/SectionSettings.tsx");
  assert.match(st, /if \(!field\.allowEmpty\) \{/);
  assert.match(st, /<button type="button" onClick=\{\(\) => onChange\(undefined\)\}[\s\S]*?Implicită/);
});
