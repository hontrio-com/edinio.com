import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Block } from "@/lib/pages/blocks.types";
import { adaugaContinut } from "@/lib/storefront/design/blocuri";
import { curataContinutulPentruEditor } from "@/lib/storefront/design/continut-pentru-editor";
import { buildClassicDesign } from "@/lib/storefront/design/defaults";
import { addSection, blocuriLaCale, schimbaBlocuriLaCale, schimbaBlocurile, updateSection } from "@/lib/storefront/design/edit";
import { parseStoreDesign } from "@/lib/storefront/design/parse";
import type { DesignContext, StoreDesign } from "@/lib/storefront/design/types";
import { alegereDinClic } from "./continut-liber";

/**
 * „Conținut liber” in editor (etapa 9.4 din `docs/editor-magazin/PLAN.md`): blocurile curatate la
 * incarcare, clicul din previzualizare, panourile, arborele, datele blocurilor.
 *
 * Rulare: `npm test`.
 */

const ctx = (): DesignContext => ({ primaryColor: "#07c527", pageContent: {}, features: {} });
const citit = (d: unknown) => parseStoreDesign(JSON.parse(JSON.stringify(d)), ctx());
const RAD = process.cwd();
const cod = (f: string) => readFileSync(path.join(RAD, f), "utf8").replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const RAU = "<p>Text</p><img src=x onerror=alert(1)>";
const text = (id: string): Block => ({ id, type: "text", html: RAU } as Block);

/** Un design cu cate un continut in fiecare loc, fiecare cu un text periculos. */
function cuTexte(): { d: StoreDesign; acasa: string; sub: string; sus: string } {
  let d = addSection(citit(buildClassicDesign(ctx())), "continut_liber");
  const acasa = d.home.find((s) => s.kind === "continut_liber")!.id;
  d = schimbaBlocuriLaCale(d, { sectiune: acasa, bloc: null }, () => [text("a"), { id: "col", type: "columns", items: [{ blocks: [text("c")] }] } as Block]);
  d = schimbaBlocurile(d, d.product.page.id, (l, s) => adaugaContinut(l, s, "continut_liber"));
  const sub = d.product.page.blocks!.find((b) => b.type === "continut_liber")!.id;
  d = schimbaBlocuriLaCale(d, { sectiune: d.product.page.id, bloc: sub }, () => [text("p")]);
  d = updateSection(d, d.shop.page.id, { variant: "sidebar" });
  d = schimbaBlocurile(d, d.shop.page.id, (l, s) => adaugaContinut(l, s, "continut_sus"));
  const sus = d.shop.page.blocks!.find((b) => b.type === "continut_sus")!.id;
  d = schimbaBlocuriLaCale(d, { sectiune: d.shop.page.id, bloc: sus }, () => [text("s")]);
  return { d: citit(d), acasa, sub, sus };
}

// ── Curatarea pentru editor ──────────────────────────────────────────────────

test("⚠⚠ in editor ajung blocurile curatate: in toate locurile, si in coloane", () => {
  const { d, acasa, sub, sus } = cuTexte();
  const sablon = { nume: "Tablouri", page: { ...structuredClone(d.product.page), id: "sablon_t" }, categorii: [], produse: [] };
  const cuSablon = citit({ ...d, product: { ...d.product, sabloane: [sablon] } });
  const curat = curataContinutulPentruEditor(cuSablon);
  const html = (b: Block[] | null) => JSON.stringify(b);
  for (const cale of [
    { sectiune: acasa, bloc: null },
    { sectiune: d.product.page.id, bloc: sub },
    { sectiune: "sablon_t", bloc: sub },
    { sectiune: d.shop.page.id, bloc: sus },
  ]) {
    const blocuri = blocuriLaCale(curat, cale);
    assert.ok(blocuri && blocuri.length > 0, JSON.stringify(cale));
    assert.doesNotMatch(html(blocuri), /onerror/, JSON.stringify(cale));
    assert.match(html(blocuri), /<p>Text<\/p>/, "textul ramane");
  }
  // Restul designului nu se atinge (comparatiile editorului raman aceleasi).
  assert.deepEqual(curat.chrome, cuSablon.chrome);
  assert.deepEqual(curat.home.filter((s) => s.kind !== "continut_liber"), cuSablon.home.filter((s) => s.kind !== "continut_liber"));
  assert.deepEqual(curataContinutulPentruEditor(curat), curat, "idempotenta");
});

test("⚠ si pe o versiune BRUTA din istoric (fara id-uri, nefiltrata)", () => {
  const brut = {
    version: 1,
    home: [{ kind: "continut_liber", variant: "blocuri", settings: { blocuri: [{ type: "text", html: RAU }] } }],
    product: { page: { kind: "product_page", variant: "classic", blocks: [{ type: "continut_liber", settings: { blocuri: [{ type: "text", html: RAU }] } }] } },
  };
  const curat = curataContinutulPentruEditor(brut) as typeof brut;
  assert.doesNotMatch(JSON.stringify(curat), /onerror/);
  assert.equal(curat.version, 1, "restul brut ramane");
  assert.equal(curataContinutulPentruEditor(null), null);
});

test("ruta editorului si istoricul dau editorului designul curatat; baza garzii ramane cea din coloana", () => {
  const ruta = cod("src/app/(dashboard)/dashboard/editor/page.tsx");
  assert.match(ruta, /const publicatPentruEditor = curataContinutulPentruEditor\(publicat\);/);
  assert.match(ruta, /const initialPentruEditor = ciorna \? curataContinutulPentruEditor\(ciorna\) : publicatPentruEditor;/);
  assert.match(ruta, /designInitial=\{initialPentruEditor\}\s+designPublicat=\{publicatPentruEditor\}/);
  assert.match(ruta, /cioarnaInitiala=\{ciorna \? ciornaCuContinut\(ciorna, continutCiorna\) : null\}/);
  assert.match(cod("src/lib/actions/store-design.actions.ts"), /return \{ design: curataContinutulPentruEditor\(data\.design\), continut: data\.continut, la: data\.created_at \};/);
});

// ── Clicul din previzualizare ────────────────────────────────────────────────

test("⚠ clicul pe un bloc dintr-un continut deschide continutul, cu blocul ales", () => {
  const { d, acasa, sub, sus } = cuTexte();
  // Pagina principala: `<sectiune continut_liber>/<bloc>`.
  assert.deepEqual(alegereDinClic(d, acasa, "a"), { blocStructural: null, interior: { cheie: acasa, bloc: "a" } });
  // Sub produs si Pagina Magazin: `<pagina>/<continut>/<bloc>`.
  assert.deepEqual(alegereDinClic(d, d.product.page.id, `${sub}/p`), { blocStructural: sub, interior: { cheie: `${d.product.page.id}/${sub}`, bloc: "p" } });
  assert.deepEqual(alegereDinClic(d, d.shop.page.id, `${sus}/s`), { blocStructural: sus, interior: { cheie: `${d.shop.page.id}/${sus}`, bloc: "s" } });
  // Ca pana acum: containerul insusi, un bloc fix al paginii, o sectiune.
  assert.deepEqual(alegereDinClic(d, d.product.page.id, sub), { blocStructural: sub, interior: null });
  assert.deepEqual(alegereDinClic(d, d.product.page.id, "titlu"), { blocStructural: "titlu", interior: null });
  assert.deepEqual(alegereDinClic(d, acasa, null), { blocStructural: null, interior: null });
  assert.match(cod("src/components/editor-magazin/EditorMagazin.tsx"), /const \{ blocStructural, interior \} = alegereDinClic\(design, id, bloc\);\s*setSelectat\(id\);\s*setBlocSelectat\(blocStructural\);\s*setLiber\(interior \? \{ \.\.\.interior, tinta: null \} : null\);/);
});

// ── Editorul, pe sursa ───────────────────────────────────────────────────────

const EDITOR = "src/components/editor-magazin/EditorMagazin.tsx";

test("⚠⚠ blocul deschis si tinta unui bloc nou tin de containerul lor (alt continut nu le mosteneste)", () => {
  const e = cod(EDITOR);
  assert.match(e, /const liberAici = useMemo\(\(\) => \(liber && liber\.cheie === cheieLiber \? liber : null\), \[liber, cheieLiber\]\);/);
  assert.match(e, /if \(sectiuneSelectata\.kind === "continut_liber"\) return \{ sectiune: sectiuneSelectata\.id, bloc: null \};/);
  assert.match(e, /return blocDeschis && schema && esteContinut\(schema, blocDeschis\.type\) \? \{ sectiune: sectiuneSelectata\.id, bloc: blocDeschis\.id \} : null;/);
  // Orice alta selectie goleste starea.
  assert.ok((e.match(/setLiber\(null\);/g) ?? []).length >= 5, "selecteaza, selecteazaBloc, inapoiLaArbore, schimbaPagina, versiunea readusa");
});

test("⚠⚠ modificarile continutului trec prin ciorna (Anuleaza, „Publică”), pe calea containerului", () => {
  const e = cod(EDITOR);
  assert.match(e, /schimba=\{\(fn, ch\) => ciorna\.aplica\(\(d: StoreDesign\) => schimbaBlocuriLaCale\(d, caleLiber, fn\), ch\)\}/);
  assert.match(e, /onSchimba=\{\(patch, cheie\) => ciorna\.aplica\(\s*\(d: StoreDesign\) => schimbaBlocuriLaCale\(d, caleLiber, \(bs\) => updateBlockInTree\(bs, blocLiberDeschis\.id, patch\)\),\s*cheie,\s*\)\}/);
  assert.match(e, /ciorna\.aplica\(\(d: StoreDesign\) => schimbaBlocuriLaCale\(d, caleLiber, \(bs\) => \(\s*t\.fel === "sus" \? insertAtTop\(bs, t\.index, nou\) : insertIntoColumn\(bs, t\.idColoane, t\.coloana, t\.index, nou\)\s*\)\)\);/);
});

test("paleta: la continut fara „Din pagina principală”; paginile proprii isi pastreaza nota", () => {
  const e = cod(EDITOR);
  assert.match(e, /<PanouAdaugaBloc tinta=\{liberAici\.tinta\} date=\{dateBlocuri\} inapoiLa="conținut" onBloc=\{adaugaBlocLiber\}/);
  assert.doesNotMatch(e.slice(e.indexOf("<PanouAdaugaBloc tinta={liberAici.tinta}"), e.indexOf("<PanouAdaugaBloc tinta={liberAici.tinta}") + 300), /onAcasa/);
  assert.match(e, /<PanouAdaugaBloc tinta=\{tintaBloc\} date=\{paginaDeschisa\.date\} estePaginaAcasa=\{paginaDeschisa\.date\.estePaginaAcasa\}/);
  assert.match(cod("src/components/pages/PaletaBlocuri.tsx"), /\{!inColoana && onAcasa && \(/);
});

test("⚠ arborele: textul `sr-only` al lacatului sta intr-un parinte `relative` (proba 9.5)", () => {
  // Absolut si fara parinte pozitionat, iesea din panoul derulant: documentul crestea cu ~280 px si
  // editorul pe tot ecranul se derula cu bara de sus cu tot.
  const a = cod("src/components/editor-magazin/ArboreSectiuni.tsx");
  const toate = a.match(/className="sr-only"/g) ?? [];
  const inParintePozitionat = a.match(/<span title=\{meta\.obligatoriu\} className="relative [^"]*">\s*<Lock [^>]*\/>\s*<span className="sr-only">/g) ?? [];
  assert.equal(toate.length, 1);
  assert.equal(inParintePozitionat.length, 1);
});

test("paleta continutului spune unde intra blocul: la sfarsitul continutului, nu al paginii (proba 9.5)", () => {
  const e = cod(EDITOR);
  const laContinut = e.slice(e.indexOf("<PanouAdaugaBloc tinta={liberAici.tinta}"), e.indexOf("<PanouAdaugaBloc tinta={liberAici.tinta}") + 300);
  assert.match(laContinut, /laSfarsit="La sfârșitul conținutului"/);
  const laPagina = e.slice(e.indexOf("<PanouAdaugaBloc tinta={tintaBloc}"), e.indexOf("<PanouAdaugaBloc tinta={tintaBloc}") + 300);
  assert.doesNotMatch(laPagina, /laSfarsit/);
  const p = cod("src/components/editor-magazin/PanouriPagina.tsx");
  assert.match(p, /laSfarsit = "La sfârșitul paginii"/);
  assert.match(p, /tinta\.dupa \? `sub „\$\{tinta\.dupa\}”` : tinta\.fel === "sus" \? laSfarsit : null/);
});

test("⚠ datele blocurilor: cerute o data, trimise in cadru la cerere si dupa fiecare „ready”", () => {
  const e = cod(EDITOR);
  assert.match(e, /if \(dateBlocuriAcum\.current \|\| cerDateBlocuri\.current\) return;/);
  assert.match(e, /dateBlocuriInEditor\(magazin\.id\)/);
  assert.match(e, /else if \(tip === "cereDateBlocuri"\) \{\s*if \(dateBlocuriAcum\.current\) trimiteDateBlocuri\(\);\s*else cereDateBlocuri\(\);\s*\}/);
  assert.match(e, /if \(tip === "ready"\) \{\s*trimiteDesignul\(\);\s*trimitePagina\(true\);\s*trimiteDateBlocuri\(\);\s*trimiteReluari\(\);/);
  // Pe server: doar proprietarul, din ciorna sau din designul publicat, cu aceeasi citire ca paginile proprii.
  const date = cod("src/lib/pages/date-editor-pagina.ts");
  assert.match(date, /export async function dateBlocuriMagazin\([\s\S]*?\.from\("businesses"\)\.select\(COLOANE_MAGAZIN\)\.eq\("id", businessId\)\.eq\("user_id", userId\)\.maybeSingle\(\);/);
  assert.match(date, /parseStoreDesign\(ss\?\.storefront_design_draft \?\? ss\?\.storefront_design, \{/);
  assert.equal((date.match(/incarcaDateBlocuri\(supabase, business, userId,/g) ?? []).length, 2, "o singura citire, pentru pagini si pentru continut");
  assert.match(date, /blocks: curataHtmlPentruEditor\(blocks\),/);
  const actiune = cod("src/lib/actions/editor-pagini.actions.ts");
  assert.match(actiune, /export async function dateBlocuriInEditor\(businessId: string\): Promise<DateBlocuri \| null> \{\s*if \(typeof businessId !== "string" \|\| !\/\^\[0-9a-zA-Z-\]\{1,64\}\$\/\.test\(businessId\)\) return null;/);
});

test("adaugarea: sectiunea noua si continutul nou dintr-o zona se deschid direct pe paleta", () => {
  const e = cod(EDITOR);
  assert.match(e, /setLiber\(nou\.kind === "continut_liber" \? \{ cheie: nou\.id, bloc: null, tinta: \{ fel: "sus", index: 0 \} \} : null\);/);
  assert.match(e, /const urmator = schimbaBlocurile\(design, idSectiune, \(l, sch\) => adaugaContinut\(l, sch, tip\)\);/);
  assert.match(e, /setLiber\(\{ cheie: `\$\{idSectiune\}\/\$\{nou\.id\}`, bloc: null, tinta: \{ fel: "sus", index: 0 \} \}\);/);
});

test("arborele: zonele cu continut apar si goale, cu „Adaugă conținut liber”; Pagina Magazin doar cand are pagina", () => {
  const a = cod("src/components/editor-magazin/ArboreSectiuni.tsx");
  assert.match(a, /const blocuri = sectiune\.blocks \?\? \[\];/);
  assert.match(a, /if \(aleZonei\.length === 0 && !tipContinut\) return null;/);
  assert.match(a, /onClick=\{\(\) => onAdaugaContinut\(sectiune\.id, tipContinut\)\}/);
  assert.match(a, /\{schemaBlocurilor\(s\.kind, s\.variant\) && \(s\.kind !== "shop_page" \|\| shopOnPage\(design\)\) && \(/);
});

test("galeria: fara „Conținut liber” cand pagina principala e o pagina proprie; miniatura are blocuri de exemplu", () => {
  assert.match(cod("src/components/editor-magazin/GalerieAdauga.tsx"), /\.filter\(\(k\) => !\(faraContinutLiber && k === "continut_liber"\)\)/);
  assert.match(cod(EDITOR), /faraContinutLiber=\{!!paginaAcasa\}/);
  const mini = cod("src/app/(public)/preview-sectiune/[slug]/page.tsx");
  assert.match(mini, /const sloturi = kind === "continut_liber"\s*\? sloturiContinutLiber\(\[\{ cale: \{ sectiune: `preview_\$\{kind\}`, bloc: null \}, blocuri: DEMO_CONTINUT_LIBER \}\]/);
  assert.match(mini, /const faraCiorna = faraDesignulBrut\(storeSettings\) \?\? \{\};/);
});

test("previzualizarea marcheaza fiecare bloc al continutului; golul se vede doar in editor", () => {
  const c = cod("src/components/storefront/ContinutLiber.tsx");
  assert.match(c, /\[BLOC_ATTR\]: idBloc\(cheie, b\.id\)/);
  assert.match(c, /if \(blocuri\.length === 0\) \{/);
  assert.match(c, /else if \(mesaj\[PREVIEW_MESSAGE\] === "reluari"\) stare = \{ \.\.\.stare, reluari: mesaj\.reluari \};/);
});
