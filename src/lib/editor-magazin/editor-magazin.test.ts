import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { buildClassicDesign } from "@/lib/storefront/design/defaults";
import { comutaBaraDeAnunt, ID_BARA_ANUNT, removeSection, toggleSection, updateSection } from "@/lib/storefront/design/edit";
import { parseStoreDesign } from "@/lib/storefront/design/parse";
import { createBlock, type Block } from "@/lib/pages/blocks.types";
import type { DateEditorPagina } from "@/lib/pages/date-editor-pagina";
import { adaugaSablon } from "@/lib/storefront/design/sabloane-produs";
import { EDITOR_PARAM, EDITOR_VALUE, cheiaPaginiiProprii, despartireId, esteEditorDeDesign, idBloc, semneDeEditor } from "@/lib/storefront/design/preview-protocol";
import type { DesignContext, StoreDesign } from "@/lib/storefront/design/types";
import { FEREASTRA_LIPIRE_MS, MAX_ISTORIC, anuleaza, istoricGol, noteaza, reface } from "./istoric";
import { adresaEditoruluiPentruPagina, adresaPrevizualizarii, iesireaEditorului, idPaginaProprie, notaPaginii, PAGINI_EDITOR, paginaCeruta, paginaSectiunii, sectiunilePaginii, type MagazinPentruPagini } from "./pagini";
import { deSalvat, paginaModificata, reductorPagina, rezumatBloc, type StarePagina, type StarePaginiiDeschise } from "./pagina-proprie";
import { contextDesign, rederiva } from "./derivare";
import { CHEI_CONTINUT, CHEI_RETRASE, felBloc, felContinut, nodulCheii } from "./noduri";

/*
 * Logica editorului unic (etapa 2, 25.10.2026), fara React: anuleaza/refa,
 * paginile si adresele previzualizarii, bara de anunt adusa inapoi, re-derivarea
 * de dupa o salvare de continut si harta nodurilor.
 */

const ctx = (pageContent: Record<string, unknown> = {}): DesignContext =>
  ({ primaryColor: "#07c527", pageContent, features: {} });
const salvat = (d: StoreDesign, c = ctx()) => parseStoreDesign(JSON.parse(JSON.stringify(d)), c);

// ── Istoricul ────────────────────────────────────────────────────────────────

test("anuleaza aduce starea de dinainte, refa o duce inapoi", () => {
  let ist = istoricGol<string>();
  ist = noteaza(ist, "a", { acum: 1000 });
  ist = noteaza(ist, "b", { acum: 5000 });
  const unu = anuleaza(ist, "c");
  assert.ok(unu);
  assert.equal(unu.stare, "b");
  const doi = anuleaza(unu.istoric, unu.stare);
  assert.ok(doi);
  assert.equal(doi.stare, "a");
  assert.equal(anuleaza(doi.istoric, doi.stare), null, "nimic mai vechi");
  const inapoi = reface(doi.istoric, doi.stare);
  assert.ok(inapoi);
  assert.equal(inapoi.stare, "b");
});

test("⚠ tastarea in acelasi camp e UN singur pas, nu cate unul pe litera", () => {
  let ist = istoricGol<string>();
  // Titlul „Hai” scris litera cu litera: trei stari de dinainte, aceeasi cheie.
  ist = noteaza(ist, "", { cheie: "setari:hero:titlu", acum: 1000 });
  ist = noteaza(ist, "H", { cheie: "setari:hero:titlu", acum: 1200 });
  ist = noteaza(ist, "Ha", { cheie: "setari:hero:titlu", acum: 1400 });
  assert.equal(ist.trecut.length, 1, "un singur pas");
  assert.equal(anuleaza(ist, "Hai")?.stare, "", "anuleaza scoate tot cuvantul");
});

test("lipirea se rupe dupa o pauza sau la alt camp", () => {
  let ist = istoricGol<string>();
  ist = noteaza(ist, "1", { cheie: "x", acum: 0 });
  ist = noteaza(ist, "2", { cheie: "x", acum: FEREASTRA_LIPIRE_MS + 10 });
  ist = noteaza(ist, "3", { cheie: "y", acum: FEREASTRA_LIPIRE_MS + 20 });
  assert.equal(ist.trecut.length, 3);
});

test("o modificare noua sterge ce se putea reface", () => {
  let ist = istoricGol<string>();
  ist = noteaza(ist, "a", { acum: 0 });
  const inapoi = anuleaza(ist, "b")!;
  const nou = noteaza(inapoi.istoric, "a", { acum: 10_000 });
  assert.equal(reface(nou, "z"), null);
});

test("istoricul are un plafon si uita cele mai vechi stari", () => {
  let ist = istoricGol<number>();
  for (let i = 0; i < MAX_ISTORIC + 15; i++) ist = noteaza(ist, i, { acum: i * 10_000 });
  assert.equal(ist.trecut.length, MAX_ISTORIC);
  assert.equal(ist.trecut[0], 15, "s-au uitat primele cincisprezece");
});

// ── Paginile ─────────────────────────────────────────────────────────────────

const magazin = (over: Partial<MagazinPentruPagini> = {}): MagazinPentruPagini =>
  ({ slug: "floraria", produsSlug: "buchet", unSingurProdus: false, ...over });

test("⚠⚠ fiecare adresa de previzualizare porneste modul editor", () => {
  /*
   * O adresa fara semnele editorului ar randa magazinul PUBLICAT si n-ar asculta
   * mesajele: alegeai un design si in dreapta nu se schimba nimic.
   */
  const d = buildClassicDesign(ctx());
  for (const { cheie } of PAGINI_EDITOR) {
    const adresa = adresaPrevizualizarii(cheie, d, magazin());
    const sp = Object.fromEntries(new URL(adresa, "https://x.ro").searchParams);
    assert.ok(esteEditorDeDesign(semneDeEditor(sp), true), `${cheie}: ${adresa}`);
    assert.equal(sp[EDITOR_PARAM], EDITOR_VALUE);
  }
});

test("paginile care nu exista ca pagini cad pe pagina principala, cu nota", () => {
  const d = buildClassicDesign(ctx());
  // Implicitul tuturor: cos in sertar, comanda in fereastra, produse acasa.
  for (const cheie of ["magazin", "cos", "comanda"] as const) {
    assert.match(adresaPrevizualizarii(cheie, d, magazin()), /^\/floraria\?/, cheie);
    assert.ok(notaPaginii(cheie, d, magazin()), `${cheie}: lipseste nota`);
  }
});

test("cand designul pune cosul pe pagina, previzualizarea merge pe pagina cosului", () => {
  const d = updateSection(buildClassicDesign(ctx()), "cart_drawer", { variant: "page_split" });
  assert.match(adresaPrevizualizarii("cos", d, magazin()), /^\/floraria\/cos\?/);
  assert.equal(notaPaginii("cos", d, magazin()), null);
});

test("pagina de produs: produsul ales, cu prefixul magazinului", () => {
  const d = buildClassicDesign(ctx());
  assert.match(adresaPrevizualizarii("produs", d, magazin({ prefixProdus: "p" })), /^\/floraria\/p\/buchet\?/);
  assert.match(adresaPrevizualizarii("produs", d, magazin({ produsSlug: null })), /^\/floraria\?/);
  assert.ok(notaPaginii("produs", d, magazin({ produsSlug: null })));
});

test("magazinul cu un singur produs: pagina principala ESTE pagina de produs", () => {
  const d = buildClassicDesign(ctx());
  const m = magazin({ unSingurProdus: true });
  assert.deepEqual(sectiunilePaginii(d, "acasa", m).map((s) => s.kind), ["product_page"]);
  assert.match(adresaPrevizualizarii("produs", d, m), /^\/floraria\?/);
});

test("⚠⚠ cu sabloane, previzualizarea paginii de produs IMPUNE sablonul editat (4b)", () => {
  const d = salvat(buildClassicDesign(ctx()));
  // Fara sabloane adresa ramane cea de dinainte: nicio schimbare pentru magazinele de azi.
  assert.doesNotMatch(adresaPrevizualizarii("produs", d, magazin()), /sablon=/);

  const r = adaugaSablon(d, "Tablouri")!;
  const m = magazin();
  const implicit = new URL(adresaPrevizualizarii("produs", r.design, m), "https://x.ro");
  assert.equal(implicit.searchParams.get("sablon"), r.design.product.page.id, "Implicit e impus si el: altfel produsul si-ar arata sablonul lui");
  const ales = new URL(adresaPrevizualizarii("produs", r.design, m, { sablon: r.id, slug: "tablou-mare" }), "https://x.ro");
  assert.equal(ales.searchParams.get("sablon"), r.id);
  assert.match(ales.pathname, /^\/floraria\/[a-z-]+\/tablou-mare$/, "produsul care foloseste sablonul, cand s-a gasit unul");
  assert.ok(esteEditorDeDesign(semneDeEditor(Object.fromEntries(ales.searchParams)), true));
  // Pe celelalte pagini si in magazinul cu un singur produs nu se impune nimic.
  assert.doesNotMatch(adresaPrevizualizarii("acasa", r.design, m), /sablon=/);
  assert.doesNotMatch(adresaPrevizualizarii("produs", r.design, magazin({ unSingurProdus: true })), /sablon=/);
});

test("⚠ arborele paginii de produs arata sablonul editat, iar clicul pe orice sablon duce pe pagina de produs", () => {
  const d = salvat(buildClassicDesign(ctx()));
  const r = adaugaSablon(d, "Tablouri")!;
  const m = magazin();
  assert.deepEqual(sectiunilePaginii(r.design, "produs", m, r.id).map((s) => s.id), [r.id]);
  assert.deepEqual(sectiunilePaginii(r.design, "produs", m).map((s) => s.id), [r.design.product.page.id]);
  assert.equal(paginaSectiunii(r.design, r.id, "acasa", m), "produs");
  assert.equal(paginaSectiunii(r.design, r.id, "acasa", magazin({ unSingurProdus: true })), null, "fara sabloane la un singur produs");
});

// ── Paginile proprii (etapa 5) ───────────────────────────────────────────────

const PAGINA = "11111111-2222-4333-8444-555555555555";
const cuPagini = (over: Partial<MagazinPentruPagini> = {}) =>
  magazin({ paginiProprii: [{ id: PAGINA, titlu: "Despre noi", slug: "despre-noi", publicata: true }], ...over });

test("⚠⚠ pagina ceruta in adresa: una fixa, una proprie A MAGAZINULUI, altfel Acasa", () => {
  const m = cuPagini();
  assert.equal(paginaCeruta("produs", m), "produs");
  assert.equal(paginaCeruta(`pagina:${PAGINA}`, m), `pagina:${PAGINA}`);
  assert.equal(paginaCeruta("pagina:alt-magazin", m), "acasa", "o pagina straina nu se deschide");
  assert.equal(paginaCeruta(`pagina:${PAGINA}`, magazin()), "acasa", "fara lista, nicio pagina proprie");
  assert.equal(paginaCeruta(["produs"], m), "acasa");
  assert.equal(idPaginaProprie(`pagina:${PAGINA}`), PAGINA);
  assert.equal(idPaginaProprie("acasa"), null);
});

test("⚠ pagina proprie: previzualizarea la adresa ei, in modul editor, fara sectiuni de design", () => {
  const d = buildClassicDesign(ctx());
  const m = cuPagini();
  const adresa = adresaPrevizualizarii(`pagina:${PAGINA}`, d, m);
  assert.match(adresa, /^\/floraria\/despre-noi\?/);
  assert.ok(esteEditorDeDesign(semneDeEditor(Object.fromEntries(new URL(adresa, "https://x.ro").searchParams)), true));
  assert.match(adresaPrevizualizarii("pagina:straina", d, m), /^\/floraria\?/);
  assert.deepEqual(sectiunilePaginii(d, `pagina:${PAGINA}`, m), []);
  assert.equal(notaPaginii(`pagina:${PAGINA}`, d, m), null);
  assert.match(notaPaginii(`pagina:${PAGINA}`, d, cuPagini({ paginiProprii: [{ id: PAGINA, titlu: "x", slug: "x", publicata: false }] }))!, /nu e publicată/);
});

test("⚠⚠ clicul pe continutul sau pe un bloc al paginii proprii duce pe pagina ei", () => {
  const d = buildClassicDesign(ctx());
  const m = cuPagini();
  const sectiune = cheiaPaginiiProprii(PAGINA);
  assert.equal(sectiune, `pagina:${PAGINA}`);
  assert.equal(paginaSectiunii(d, sectiune, "acasa", m), sectiune);
  // Un bloc vine ca `<sectiune>/<bloc>`; editorul il desparte inainte sa caute pagina.
  const { sectiune: s, bloc } = despartireId(idBloc(sectiune, "b_abc_1"));
  assert.equal(s, sectiune);
  assert.equal(bloc, "b_abc_1");
  assert.equal(paginaSectiunii(d, "pagina:straina", "acasa", m), null);
  // Antetul ramane pe pagina aleasa, si cand ea e o pagina proprie.
  assert.equal(paginaSectiunii(d, d.chrome.header.id, sectiune, m), sectiune);
});

test("starea paginii: „nesalvat” se judeca pe tot randul; salvarea trimite tot, cu versiunea", () => {
  const s: StarePagina = { titlu: "Despre", slug: "despre", publicata: true, blocks: [], css: "", seo: {} };
  assert.equal(paginaModificata(s, s), false);
  assert.equal(paginaModificata(s, { ...s }), false, "o copie identica nu e o modificare");
  assert.equal(paginaModificata(s, { ...s, titlu: "Despre noi" }), true);
  assert.equal(paginaModificata(s, { ...s, seo: { title: "x" } }), true);
  assert.deepEqual(deSalvat(s, "2026-10-25T10:00:00Z"), {
    title: "Despre", slug: "despre", blocks: [], page_css: "", seo: {}, is_published: true, versiune: "2026-10-25T10:00:00Z",
  });
});

// ── Pagina proprie deschisa in editor (5.3): starea ei, fara React ───────────

const dePeServer = (over: Partial<DateEditorPagina["pagina"]> = {}) => ({
  pagina: { id: PAGINA, titlu: "Despre", slug: "despre", publicata: true, blocks: [], css: "", seo: {}, versiune: "v1", ...over },
}) as unknown as DateEditorPagina;
const nimicDeschis: StarePaginiiDeschise = { deschisa: null, lipsa: null };
const deschide = () => reductorPagina(nimicDeschis, { tip: "incarcata", id: PAGINA, date: dePeServer() });
const scrie = (s: StarePaginiiDeschise, fn: (p: StarePagina) => StarePagina, cheie: string | null, acum: number) =>
  reductorPagina(s, { tip: "aplica", fn, cheie, acum });
const deSalvatPeEcran = (s: StarePaginiiDeschise) => paginaModificata(s.deschisa!.salvata, s.deschisa!.curenta);

test("pagina deschisa porneste salvata, cu versiunea citita de la server", () => {
  const s = deschide();
  assert.equal(s.deschisa?.id, PAGINA);
  assert.equal(s.deschisa?.versiune, "v1");
  assert.equal(s.deschisa?.curenta.titlu, "Despre");
  assert.equal(deSalvatPeEcran(s), false);
  assert.equal(s.deschisa?.istoric.trecut.length, 0);
});

test("o modificare care nu schimba nimic nu intra in istoric", () => {
  const s = deschide();
  assert.equal(scrie(s, (p) => p, "titlu", 1000), s, "aceeasi stare, nu una noua");
});

test("⚠⚠ tastarea in titlu e un singur pas: Anuleaza intoarce pagina salvata, Refa o readuce", () => {
  let s = deschide();
  s = scrie(s, (p) => ({ ...p, titlu: "D" }), "titlu", 1000);
  s = scrie(s, (p) => ({ ...p, titlu: "De" }), "titlu", 1200);
  s = scrie(s, (p) => ({ ...p, titlu: "Des" }), "titlu", 1400);
  assert.equal(s.deschisa?.istoric.trecut.length, 1);
  assert.equal(deSalvatPeEcran(s), true);
  const inapoi = reductorPagina(s, { tip: "anuleaza" });
  assert.equal(inapoi.deschisa?.curenta.titlu, "Despre");
  assert.equal(deSalvatPeEcran(inapoi), false, "inapoi la ce e in baza: nimic de salvat");
  assert.equal(reductorPagina(inapoi, { tip: "reface" }).deschisa?.curenta.titlu, "Des");
  const neatinsa = deschide();
  assert.equal(reductorPagina(neatinsa, { tip: "anuleaza" }), neatinsa, "fara istoric, Anuleaza nu face nimic");
});

test("⚠⚠ salvarea: ce a plecat devine „salvat”, iar ce s-a scris cat era pe drum ramane de salvat", () => {
  let s = deschide();
  s = scrie(s, (p) => ({ ...p, titlu: "Despre noi" }), "titlu", 1000);
  const trimisa = s.deschisa!.curenta;
  s = scrie(s, (p) => ({ ...p, css: ".x{}" }), "css", 1500);
  s = reductorPagina(s, { tip: "salvata", id: PAGINA, trimisa, slug: "despre", versiune: "v2" });
  assert.equal(s.deschisa?.versiune, "v2", "urmatoarea salvare pleaca cu versiunea noua, altfel garda o respinge");
  assert.equal(s.deschisa?.salvata.titlu, "Despre noi");
  assert.equal(s.deschisa?.curenta.css, ".x{}", "scrisul de pe drum nu se pierde");
  assert.equal(deSalvatPeEcran(s), true, "si nu se socoteste salvat");
  assert.equal(s.deschisa?.istoric.trecut.length, 2, "istoricul ramane dupa salvare");
});

test("⚠ adresa curatata de server ajunge si pe ecran, daca omul n-a schimbat-o intre timp", () => {
  const s = scrie(deschide(), (p) => ({ ...p, slug: "Despre Noi" }), "slug", 1000);
  const trimisa = s.deschisa!.curenta;
  const salvata = reductorPagina(s, { tip: "salvata", id: PAGINA, trimisa, slug: "despre-noi", versiune: "v2" });
  assert.equal(salvata.deschisa?.salvata.slug, "despre-noi");
  assert.equal(salvata.deschisa?.curenta.slug, "despre-noi");
  assert.equal(deSalvatPeEcran(salvata), false);
  // A scris alta adresa cat era salvarea pe drum: ramane a lui, de salvat.
  const rescrisa = scrie(s, (p) => ({ ...p, slug: "contact" }), "slug", 5000);
  const dupa = reductorPagina(rescrisa, { tip: "salvata", id: PAGINA, trimisa, slug: "despre-noi", versiune: "v2" });
  assert.equal(dupa.deschisa?.curenta.slug, "contact");
  assert.equal(deSalvatPeEcran(dupa), true);
});

test("⚠⚠ pagina lasata se uita: la intoarcere se citeste din nou, fara modificarile renuntate", () => {
  const s = scrie(deschide(), (p) => ({ ...p, titlu: "Renuntat" }), "titlu", 1000);
  const inchisa = reductorPagina(s, { tip: "inchisa" });
  assert.deepEqual(inchisa, nimicDeschis);
  assert.equal(reductorPagina(inchisa, { tip: "inchisa" }), inchisa, "nimic deschis: aceeasi stare");
  const lipsa = reductorPagina(s, { tip: "lipsa", id: PAGINA });
  assert.deepEqual(lipsa, { deschisa: null, lipsa: PAGINA });
  assert.deepEqual(reductorPagina(lipsa, { tip: "inchisa" }), nimicDeschis, "si o pagina lipsa se cauta din nou");
  // Raspunsul salvarii altei pagini nu atinge pagina deschisa.
  const deschisa = deschide();
  const straina = reductorPagina(deschisa, { tip: "salvata", id: "alta", trimisa: deschisa.deschisa!.curenta, slug: "x", versiune: "v9" });
  assert.equal(straina, deschisa);
});

test("randul unui bloc in arbore se recunoaste dupa textul lui", () => {
  assert.equal(rezumatBloc({ ...createBlock("heading"), text: "Despre noi" } as Block), "Despre noi");
  assert.equal(rezumatBloc({ ...createBlock("text"), html: "<p>Livram&nbsp;in <strong>toata</strong>\n tara</p>" } as Block), "Livram in toata tara");
  const lung = rezumatBloc({ ...createBlock("heading"), text: "x".repeat(60) } as Block);
  assert.equal(lung?.length, 40);
  assert.ok(lung?.endsWith("…"));
  assert.equal(rezumatBloc({ ...createBlock("image"), alt: "", caption: "Atelierul" } as Block), "Atelierul");
  assert.equal(rezumatBloc({ ...createBlock("button"), label: "   " } as Block), null);
  assert.equal(rezumatBloc(createBlock("spacer")), null);
});

test("fiecare pagina isi arata sectiunile ei", () => {
  const d = buildClassicDesign(ctx());
  const m = magazin();
  assert.equal(sectiunilePaginii(d, "acasa", m), d.home);
  assert.deepEqual(sectiunilePaginii(d, "produs", m).map((s) => s.kind), ["product_page"]);
  assert.deepEqual(sectiunilePaginii(d, "magazin", m).map((s) => s.kind), ["shop_page"]);
  assert.deepEqual(sectiunilePaginii(d, "cos", m).map((s) => s.kind), ["cart_drawer"]);
  assert.deepEqual(sectiunilePaginii(d, "comanda", m).map((s) => s.kind), ["checkout"]);
});

// ── Clicul din previzualizare (etapa 3) ─────────────────────────────────────

test("⚠⚠ clicul pe o sectiune de pe alta pagina muta editorul pe pagina ei", () => {
  /*
   * Pe „Coșul”, cu cos in sertar, previzualizarea arata prima pagina. Clicul pe
   * banner nu gasea niciun nod pe pagina cosului si nu facea nimic.
   */
  const d = buildClassicDesign(ctx());
  const m = magazin();
  assert.equal(paginaSectiunii(d, "hero", "cos", m), "acasa");
  assert.equal(paginaSectiunii(d, "catalog", "comanda", m), "acasa");
  assert.equal(paginaSectiunii(d, d.product.page.id, "acasa", m), "produs");
});

test("antetul si subsolul raman pe pagina aleasa: sunt pe toate", () => {
  const d = buildClassicDesign(ctx());
  for (const { cheie } of PAGINI_EDITOR) {
    assert.equal(paginaSectiunii(d, d.chrome.header.id, cheie, magazin()), cheie);
    assert.equal(paginaSectiunii(d, d.chrome.footer.id, cheie, magazin()), cheie);
  }
});

test("pagina aleasa are intaietate, iar o sectiune de nicaieri nu muta nimic", () => {
  const d = buildClassicDesign(ctx());
  // Magazinul cu un singur produs are pagina de produs si pe „Pagina principală”.
  const m = magazin({ unSingurProdus: true });
  assert.equal(paginaSectiunii(d, d.product.page.id, "acasa", m), "acasa");
  assert.equal(paginaSectiunii(d, d.product.page.id, "produs", m), "produs");
  assert.equal(paginaSectiunii(d, "nu_exista", "acasa", magazin()), null);
});

// ── Bara de anunt ────────────────────────────────────────────────────────────

test("⚠⚠ ochiul aduce bara de anunt cand designul n-o are deloc, si ea ramane dupa citire", () => {
  // Stearsa din lista: `null` + id in `sterse`. Comutatorul vechi n-o mai aduce.
  const c = ctx({ announcement_bar: { enabled: true } });
  const fara = removeSection(salvat(buildClassicDesign(c), c), ID_BARA_ANUNT);
  assert.equal(salvat(fara, c).chrome.announcement, null, "pornim fara bara");
  const cu = comutaBaraDeAnunt(fara);
  const citit = salvat(cu, c);
  assert.ok(citit.chrome.announcement, "bara exista dupa citire");
  assert.equal(citit.chrome.announcement.enabled, true);
  assert.ok(!(citit.sterse ?? []).includes(ID_BARA_ANUNT), "nu mai e in lista celor sterse");
});

test("cand bara exista, ochiul doar o stinge si o aprinde", () => {
  const c = ctx({ announcement_bar: { enabled: true } });
  const d = salvat(buildClassicDesign(c), c);
  assert.equal(d.chrome.announcement?.enabled, true, "pornim cu bara aprinsa");
  const stinsa = comutaBaraDeAnunt(d);
  assert.equal(salvat(stinsa, c).chrome.announcement?.enabled, false);
  assert.equal(salvat(comutaBaraDeAnunt(stinsa), c).chrome.announcement?.enabled, true);
});

// ── Re-derivarea ─────────────────────────────────────────────────────────────

test("⚠⚠ dupa o salvare de continut, randul nou apare in ciorna din ecran", () => {
  const d = salvat(buildClassicDesign(ctx()));
  const rand = { id: "rand-nou", title: "Noutati", enabled: true, mode: "selected", layout: "grid", productIds: [] };
  const dupa = rederiva(d, ctx({ product_sections: [rand] }));
  const i = dupa.home.findIndex((s) => s.id === "rand-nou");
  assert.ok(i >= 0, "randul nou e in lista");
  assert.ok(i < dupa.home.findIndex((s) => s.kind === "product_grid"), "inaintea catalogului");
});

test("⚠⚠ re-derivarea pastreaza alegerile omului: ochiul, varianta, stergerea", () => {
  const c = ctx({ reviews_section: { enabled: true, items: [] } });
  let d = salvat(buildClassicDesign(c), c);
  assert.equal(d.home.find((s) => s.id === "reviews")?.enabled, true, "pornim cu recenziile aprinse");
  d = toggleSection(d, "reviews"); // ochiul stinge recenziile
  d = updateSection(d, "hero", { variant: "overlay" }); // varianta aleasa din galerie
  d = removeSection(d, "usp"); // banda de incredere stearsa anume
  // Continutul se schimba: un banner nou ar deriva hero-ul „banners”.
  const dupa = rederiva(d, ctx({ reviews_section: { enabled: true, items: [] }, hero_banners: ["https://x.ro/b.jpg"] }));
  assert.equal(dupa.home.find((s) => s.id === "reviews")?.enabled, false, "ochiul ramane stins");
  assert.equal(dupa.home.find((s) => s.kind === "hero")?.variant, "overlay", "varianta aleasa ramane");
  assert.equal(dupa.home.some((s) => s.id === "usp"), false, "stergerea ramane");
});

test("re-derivarea fara schimbare de continut nu schimba nimic", () => {
  const d = salvat(buildClassicDesign(ctx()));
  assert.deepEqual(rederiva(d, ctx()), d);
});

test("contextul se construieste ca pe server", () => {
  assert.deepEqual(
    contextDesign({ primaryColor: null, pageContent: {}, features: null, coverUrl: null, tagline: "x" }),
    { primaryColor: "#07c527", pageContent: {}, features: {}, coverUrl: null, tagline: "x" },
  );
});

// ── Harta nodurilor ──────────────────────────────────────────────────────────

const RAD = process.cwd();
const sursa = (f: string) => readFileSync(path.join(RAD, f), "utf8").replace(/\r\n/g, "\n");

test("⚠⚠ nicio cheie a editorului vechi nu se pierde la mutare", () => {
  /*
   * `ContinutPagina` e forma pe care o edita editorul vechi, mutata neschimbata.
   * Fiecare cheie are fie un nod care o scrie, fie un motiv scris pentru care nu
   * mai are control. Una fara niciuna ar fi o setare care a disparut tacut.
   */
  const text = sursa("src/lib/editor-magazin/continut.ts");
  const corp = text.slice(text.indexOf("export interface ContinutPagina {"), text.indexOf("\n}\n", text.indexOf("export interface ContinutPagina {")));
  const chei = [...corp.matchAll(/^\s{2}(\w+)\?:/gm)].map((m) => m[1]);
  assert.ok(chei.length >= 40, `doar ${chei.length} chei gasite in ContinutPagina`);
  for (const cheie of chei) {
    assert.ok(nodulCheii(cheie) || CHEI_RETRASE[cheie], `„${cheie}” nu mai are niciun control si niciun motiv`);
  }
});

test("⚠ cheile retrase nu le mai scrie niciun nod, iar o cheie are un singur nod", () => {
  const vazute = new Map<string, string>();
  for (const [nod, chei] of Object.entries(CHEI_CONTINUT)) {
    for (const cheie of chei) {
      assert.ok(!CHEI_RETRASE[cheie], `${nod} scrie cheia retrasa „${cheie}”`);
      assert.ok(!vazute.has(cheie), `„${cheie}” e si a lui ${vazute.get(cheie)}, si a lui ${nod}`);
      vazute.set(cheie, nod);
    }
  }
});

test("fiecare sectiune a designului are un nod de continut", () => {
  const d = buildClassicDesign(ctx({ product_sections: [{ id: "r1", enabled: true }] }));
  const toate = [d.chrome.announcement!, d.chrome.header, ...d.home, d.chrome.footer,
    d.product.page, d.shop.page, d.commerce.productCard, d.commerce.cartDrawer, d.commerce.checkout];
  for (const s of toate) assert.ok(felContinut(s), `${s.kind} (${s.id}) n-are nod`);
  assert.equal(felContinut(d.home.find((s) => s.id === "featured")!), "recomandate");
  assert.equal(felContinut(d.home.find((s) => s.id === "r1")!), "rand");
});

test("⚠ blocurile cu continut au fiecare nodul lor, cu cheile lor; restul n-au nod", () => {
  // O salvare din „Beneficiile” nu are voie sa ia cu ea ce s-a scris intre timp
  // in „Întrebările frecvente”: de aceea un nod pe bloc, nu unul pe pagina.
  const cuNod = { beneficii: "benefits_section", cum_functioneaza: "how_it_works_section", intrebari: "faq_section", livrare: "delivery_estimate", cumparare: "button_effect" };
  for (const [tip, cheie] of Object.entries(cuNod)) {
    const nod = felBloc(tip);
    assert.ok(nod, tip);
    assert.deepEqual(CHEI_CONTINUT[nod], [cheie], tip);
  }
  for (const tip of ["titlu", "pret", "variante", "incredere", "dovada", "insigna", "oferte", "descriere"]) {
    assert.equal(felBloc(tip), null, tip);
  }
  // Comutatoarele de vizibilitate dublate de ochiul blocului au iesit din editor.
  for (const cheie of ["trust_badges_enabled", "show_social_proof", "show_quality_badge", "trust_badges"]) {
    assert.ok(CHEI_RETRASE[cheie], cheie);
  }
});

// ── Ce scrie fiecare nod ─────────────────────────────────────────────────────

const DOSAR_COMPONENTE = "src/components/editor-magazin";
const componente = (): string[] =>
  (readdirSync(path.join(RAD, DOSAR_COMPONENTE), { recursive: true, withFileTypes: false }) as string[])
    .map(String).filter((f) => /\.tsx?$/.test(f)).map((f) => path.join(DOSAR_COMPONENTE, f));
const faraComentarii = (f: string) => sursa(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("⚠⚠ editorul unic nu cheama `elibereazaComutatoare` (stearsa in etapa 6)", () => {
  /*
   * Decizia 3 din PLAN.md. Actiunea scoate semnul ochiului de pe sectiunile ale
   * caror chei s-au salvat. In doua ecrane impaca doua controale; aici ar fi
   * reaprins, la salvarea unui text, o sectiune stinsa anume din ochi.
   */
  assert.ok(componente().length >= 10, "nu gasesc componentele editorului");
  for (const f of componente()) assert.doesNotMatch(faraComentarii(f), /elibereazaComutatoare/, f);
});

test("⚠⚠ fiecare nod scrie doar cheile lui, si niciuna retrasa", () => {
  /*
   * Fiecare nod isi salveaza cheile atinse. O cheie scrisa prin alt nod ar pleca
   * in baza la salvarea lui, nu a celui pe care il vede omul; o cheie retrasa ar
   * readuce un al doilea control pentru ce comanda ochiul.
   */
  let verificate = 0;
  // Motorul de continut nu e un nod: dupa o salvare isi aliniaza copia din ecran
  // cu ce a ajuns in baza (`setPcBrut`), fara sa noteze chei.
  for (const f of componente().filter((x) => !x.endsWith("useContinutMagazin.ts"))) {
    const text = faraComentarii(f);
    const noduri = new Set<string>();
    for (const m of text.matchAll(/seteaza(?:SiSalveaza)?\((?:"(\w+)"|(NOD_STIL))/g)) noduri.add(m[1] ?? "stil");
    const chei = [...text.matchAll(/\.\.\.p, (\w+):/g)].map((m) => m[1]);
    if (chei.length === 0) continue;
    const permise = new Set([...noduri].flatMap((n) => CHEI_CONTINUT[n as keyof typeof CHEI_CONTINUT] ?? []));
    for (const cheie of chei) {
      assert.ok(!CHEI_RETRASE[cheie], `${f} scrie cheia retrasa „${cheie}”`);
      assert.ok(permise.has(cheie), `${f} scrie „${cheie}”, care nu e a niciunui nod din fisier (${[...noduri].join(", ")})`);
      verificate += 1;
    }
  }
  assert.ok(verificate >= 30, `doar ${verificate} scrieri gasite; s-a schimbat forma lor?`);
});

// ── Pagina proprie in editor (5.3), pe sursa ─────────────────────────────────

const EDITOR = "src/components/editor-magazin/EditorMagazin.tsx";
const HOOK_PAGINA = "src/components/editor-magazin/usePaginaProprie.ts";

test("⚠⚠ datele unei pagini proprii se dau doar proprietarului ei", () => {
  /*
   * `datePaginaInEditor` e o actiune de server: oricine o poate chema cu orice id. Pagina iese
   * doar daca magazinul ei e al celui logat; altfel `null`, ca pentru o pagina lipsa.
   */
  const actiune = faraComentarii("src/lib/actions/editor-pagini.actions.ts");
  assert.match(actiune, /^"use server";/);
  assert.match(actiune, /\/\^\[0-9a-zA-Z-\]\{1,64\}\$\/\.test\(pageId\)\) return null;/);
  assert.match(actiune, /if \(!user\) return null;\s*return dateEditorPagina\(supabase, pageId, user\.id\);/);
  const date = faraComentarii("src/lib/pages/date-editor-pagina.ts");
  assert.match(date, /^import "server-only";/);
  assert.match(date, /\.from\("businesses"\)[\s\S]*?\.eq\("id", page\.business_id\)\s*\.eq\("user_id", userId\)\s*\.maybeSingle\(\);\s*if \(!business\) return null;/);
});

test("⚠⚠ editorul deschide din adresa doar paginile proprii ale magazinului", () => {
  const s = faraComentarii("src/app/(dashboard)/dashboard/editor/page.tsx");
  assert.match(s, /\.from\("custom_pages"\)\.select\("id, title, slug, is_published"\)\s*\.eq\("business_id", magazin\.id\)/);
  assert.match(s, /paginaInitiala=\{paginaDinAdresa\(paginaCeruta, \{ paginiProprii \}\)\}/);
});

test("⚠⚠ munca nesalvata pe pagina nu se pierde fara intrebare", () => {
  const s = faraComentarii(EDITOR);
  // Pagina se schimba intr-un singur loc, care uita si pagina proprie de pe ecran.
  assert.equal(s.match(/\bsetPagina\(/g)?.length, 1, "pagina se schimba doar prin `schimbaPagina`");
  assert.match(s, /const schimbaPagina = useCallback\(\(p: CheiePagina\) => \{\s*setPagina\(p\);[\s\S]*?inchidePagina\(\);\s*\}, \[inchidePagina\]\);/);
  // Bara, arborele si clicul din previzualizare intreaba intai, daca pagina are modificari.
  assert.match(s, /const cerePagina = useCallback\(\(p: CheiePagina\) => \{\s*if \(p === pagina\) return;\s*if \(paginaDeschisa\.modificata\) \{\s*setSchimbareCeruta\(p\);\s*return;\s*\}\s*schimbaPagina\(p\);/);
  assert.match(s, /onPagina=\{cerePagina\}/);
  assert.match(s, /onDeschidePagina=\{\(id\) => cerePagina\(cheiaPaginiiProprii\(id\)\)\}/);
  assert.match(s, /if \(unde !== pagina\) \{\s*if \(paginaDeschisa\.modificata\) \{\s*setSchimbareCeruta\(unde\);\s*return;\s*\}\s*schimbaPagina\(unde\);/);
  // „Salvează și treci” trece doar dupa o salvare reusita.
  assert.match(s, /if \(!\(await salveazaPagina\(\)\)\) return;\s*setSchimbareCeruta\(null\);\s*if \(p\) schimbaPagina\(p\);/);
  // „Ieși” intreaba si pentru pagina; inchiderea ferestrei, prin hook.
  assert.match(s, /continutNesalvat=\{continut\.oriceNesalvat \|\| paginaDeschisa\.modificata\}/);
  assert.match(faraComentarii(HOOK_PAGINA), /if \(!modificata\) return;\s*const handler = \(e: BeforeUnloadEvent\) => e\.preventDefault\(\);\s*window\.addEventListener\("beforeunload", handler\);/);
});

test("⚠⚠ salvarea paginii pleaca cu versiunea si nu socoteste salvat ce n-a ajuns in baza", () => {
  const s = faraComentarii(HOOK_PAGINA);
  assert.match(s, /res = await updatePage\(d\.id, deSalvat\(trimisa, d\.versiune\)\);/);
  // Fara raspuns sau cu eroare: nimic nu se marcheaza salvat.
  assert.match(s, /\} catch \{\s*setSalvez\(false\);\s*toast\.error\([^;]*\);\s*return null;\s*\}/);
  assert.match(s, /if \("error" in res\) \{\s*toast\.error\([^;]*\);\s*return null;\s*\}\s*despacha\(\{ tip: "salvata", id: d\.id, trimisa, slug: res\.slug, versiune: res\.versiune \}\);/);
  assert.equal(s.match(/tip: "salvata"/g)?.length, 1);
});

// ── Ecranul vechi se retrage (5.4) ───────────────────────────────────────────

test("⚠⚠ adresa editorului pentru o pagina proprie o deschide chiar pe ea, iar „Ieși” duce inapoi in „Pagini”", () => {
  const adresa = new URL(adresaEditoruluiPentruPagina(PAGINA), "https://x.ro");
  assert.equal(adresa.pathname, "/dashboard/editor");
  assert.equal(paginaCeruta(adresa.searchParams.get("pagina"), cuPagini()), `pagina:${PAGINA}`);
  assert.equal(iesireaEditorului(adresa.searchParams.get("din")), "/dashboard/pages");
  // Orice altceva duce in panou: adresa nu poate trimite omul in alta parte.
  for (const din of [undefined, null, "", "https://rau.ro", "/dashboard/pages", ["pagini"]]) assert.equal(iesireaEditorului(din), "/dashboard");
});

test("⚠⚠ nimic nu mai deschide editorul de pagini vechi: ruta lui trimite in editorul unic", () => {
  assert.ok(!existsSync(path.join(RAD, "src/components/pages/PageBuilder.tsx")), "o a doua copie a editorului de pagini");
  assert.match(faraComentarii("src/app/(dashboard)/dashboard/pages/[pageId]/edit/page.tsx"), /redirect\(adresaEditoruluiPentruPagina\(pageId\)\);/);
  assert.match(faraComentarii("src/components/pages/PagesListClient.tsx"), /<Link href=\{adresaEditoruluiPentruPagina\(p\.id\)\}/);
  assert.match(faraComentarii("src/components/pages/PaginaNoua.tsx"), /router\.push\(adresaEditoruluiPentruPagina\(res\.pageId\)\);/);
  // Nicio legatura scrisa de mana spre ruta veche (sau spre `/dashboard/pages/<id>`, care nu exista).
  const legaturi: string[] = [];
  const cauta = (dosar: string) => {
    for (const intrare of readdirSync(path.join(RAD, dosar), { withFileTypes: true })) {
      const rel = `${dosar}/${intrare.name}`;
      if (intrare.isDirectory()) cauta(rel);
      else if (/\.tsx?$/.test(intrare.name) && !/\.test\.ts$/.test(intrare.name)) {
        // `/dashboard/pages/${id}...` = o pagina anume; formularele (`/dashboard/pages/forms/...`) nu se potrivesc.
        for (const m of faraComentarii(rel).matchAll(/["`]\/dashboard\/pages\/\$\{[^`"]*/g)) legaturi.push(`${rel}: ${m[0]}`);
      }
    }
  };
  cauta("src");
  assert.deepEqual(legaturi, []);
  // „Ieși” duce unde spune adresa, validata pe server.
  assert.match(faraComentarii("src/app/(dashboard)/dashboard/editor/page.tsx"), /iesire=\{iesireaEditorului\(sp\.din\)\}/);
  assert.match(faraComentarii("src/components/editor-magazin/BaraEditor.tsx"), /router\.push\(laIesire\);/);
});

test("⚠ un bloc nou se pune chiar sub blocul ales, si in coloane, nu doar la sfarsitul paginii", () => {
  // Editorul de pagini retras avea „+” intre oricare doua blocuri; fara el, un bloc de sus cerea zeci de sageti.
  const arbore = faraComentarii("src/components/editor-magazin/ArborePagina.tsx");
  assert.match(arbore, /onClick=\{\(\) => onAdauga\(sub\(i \+ 1, /);
  assert.match(arbore, /rand\(b, i, blocuri, \(index, dupa\) => \(\{ fel: "sus", index, dupa \}\)\)/);
  assert.match(arbore, /rand\(nb, ni, dinColoana, \(index, dupa\) => \(\{ fel: "coloana", idColoane: b\.id, coloana: ci, index, dupa \}\)\)/);
  const editor = faraComentarii("src/components/editor-magazin/EditorMagazin.tsx");
  assert.match(editor, /blocks: t\.fel === "sus" \? insertAtTop\(s\.blocks, t\.index, nou\) : insertIntoColumn\(s\.blocks, t\.idColoane, t\.coloana, t\.index, nou\)/);
});
