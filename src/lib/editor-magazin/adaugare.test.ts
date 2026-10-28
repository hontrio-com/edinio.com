import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Block } from "@/lib/pages/blocks.types";
import { adaugaContinut } from "@/lib/storefront/design/blocuri";
import { buildClassicDesign } from "@/lib/storefront/design/defaults";
import { addSection, mutaSectiuneaLa, schimbaBlocuriLaCale, schimbaBlocurile, updateSection } from "@/lib/storefront/design/edit";
import { parseStoreDesign } from "@/lib/storefront/design/parse";
import { plusulDeSub } from "@/lib/storefront/design/preview-protocol";
import { sectionMeta } from "@/lib/storefront/design/registry";
import type { DesignContext, StoreDesign } from "@/lib/storefront/design/types";
import { ceAdaugaPlusul, continutNou, puncteDeAdaugare, sectiuneNoua, tintaLangaBloc, type ContextAdaugare } from "./adaugare";
import type { CheiePagina } from "./pagini";

/**
 * „+” din previzualizare (etapa 10 din `docs/editor-magazin/PLAN.md`): unde apare si ce deschide.
 *
 * Rulare: `npm test`.
 */

const ctxDesign = (): DesignContext => ({ primaryColor: "#07c527", pageContent: {}, features: {} });
const citit = (d: unknown) => parseStoreDesign(JSON.parse(JSON.stringify(d)), ctxDesign());
const text = (id: string, html = "<p>Text</p>"): Block => ({ id, type: "text", html } as Block);
const titlu = (id: string, t: string): Block => ({ id, type: "heading", text: t, level: 2 } as Block);
const coloane = (id: string, ...col: Block[][]): Block => ({ id, type: "columns", items: col.map((blocks) => ({ blocks })) } as Block);
/** Fara „+”-urile subsolului (etapa 11), care sunt pe orice pagina. */
const faraSubsol = <T extends { id: string }>(l: T[]) => l.filter((p) => p.id !== "footer" && !p.id.startsWith("footer/"));

const ctx = (pagina: CheiePagina, extra: Partial<ContextAdaugare> = {}): ContextAdaugare => ({
  pagina,
  magazin: { slug: "m", produsSlug: "p", unSingurProdus: false, paginiProprii: [{ id: "pg", titlu: "Despre", slug: "despre", publicata: true }] },
  sablon: null,
  paginaAcasaProprie: false,
  blocuriPagina: null,
  ...extra,
});

/** Acasa cu un „Conținut liber” (un titlu, un text, coloane cu doua blocuri in prima coloana). */
function cuContinutAcasa(): { d: StoreDesign; cl: string } {
  let d = addSection(citit(buildClassicDesign(ctxDesign())), "continut_liber");
  const cl = d.home.find((s) => s.kind === "continut_liber")!.id;
  d = schimbaBlocuriLaCale(d, { sectiune: cl, bloc: null }, () => [
    titlu("h", "Despre noi"), text("t"), coloane("col", [text("c1"), text("c2")], [text("c3")]),
  ]);
  return { d: citit(d), cl };
}

// ── Pagina principala ────────────────────────────────────────────────────────

test("pe Acasa: „+” pe fiecare sectiune, „deasupra” doar pe prima aprinsa; si pe blocurile din „Conținut liber”", () => {
  const { d, cl } = cuContinutAcasa();
  const puncte = puncteDeAdaugare(d, ctx("acasa"));
  const ids = puncte.map((p) => p.id);
  for (const s of d.home) assert.ok(ids.includes(s.id), s.kind);
  const prima = d.home.find((s) => s.enabled)!;
  assert.deepEqual(puncte.filter((p) => p.sus && !p.id.includes("/")).map((p) => p.id), [prima.id], "o singura sectiune cu „deasupra”");
  // Antetul, subsolul si bara de anunt n-au „+”.
  for (const s of [d.chrome.header, d.chrome.footer]) assert.ok(!ids.includes(s.id), s.kind);
  // Blocurile continutului, si cele din coloane; primul din fiecare lista are si „deasupra”.
  const din = (id: string) => puncte.find((p) => p.id === `${cl}/${id}`);
  for (const id of ["h", "t", "col", "c1", "c2", "c3"]) assert.ok(din(id), id);
  assert.equal(din("h")!.sus, true);
  assert.equal(din("t")!.sus, undefined);
  assert.equal(din("c1")!.sus, true, "primul din coloana");
  assert.equal(din("c2")!.sus, undefined);
  assert.equal(din("c3")!.sus, true, "primul din a doua coloana");
});

test("⚠ „deasupra” sare pe prima sectiune APRINSA: una stinsa nu se vede in previzualizare", () => {
  const d0 = citit(buildClassicDesign(ctxDesign()));
  const prima = d0.home.find((s) => s.enabled)!;
  const d = updateSection(d0, prima.id, { enabled: false, enabledOverride: false });
  const cuSus = faraSubsol(puncteDeAdaugare(d, ctx("acasa"))).filter((p) => p.sus).map((p) => p.id);
  assert.ok(!cuSus.includes(prima.id));
  assert.deepEqual(cuSus, [d.home.find((s) => s.enabled)!.id]);
});

test("pe Acasa: „+” de sub o sectiune deschide galeria cu locul ei; „deasupra” doar pe prima", () => {
  const { d } = cuContinutAcasa();
  const prima = d.home.find((s) => s.enabled)!;
  const aDoua = d.home.filter((s) => s.enabled)[1];
  const jos = ceAdaugaPlusul(d, ctx("acasa"), aDoua.id, "jos");
  assert.equal(jos?.fel, "sectiune");
  assert.deepEqual(jos?.fel === "sectiune" ? { loc: jos.loc, unde: jos.unde } : null, { loc: { dupa: aDoua.id }, unde: "jos" });
  assert.equal(jos?.fel === "sectiune" ? jos.eticheta : null, sectionMeta(aDoua.kind)?.label, "numele din previzualizare");
  const sus = ceAdaugaPlusul(d, ctx("acasa"), prima.id, "sus");
  assert.deepEqual(sus?.fel === "sectiune" ? sus.loc : null, { inainte: prima.id });
  assert.equal(ceAdaugaPlusul(d, ctx("acasa"), aDoua.id, "sus"), null, "„deasupra” nu e pe a doua");
  assert.equal(ceAdaugaPlusul(d, ctx("acasa"), d.chrome.footer.id, "jos"), null, "subsolul n-are „+” (etapa 11)");
  assert.equal(ceAdaugaPlusul(d, ctx("acasa"), "nu-exista", "jos"), null);
});

test("pe Acasa: „+” pe un bloc din „Conținut liber” = „Adaugă un bloc” langa el, si in coloana lui", () => {
  const { d, cl } = cuContinutAcasa();
  const subTitlu = ceAdaugaPlusul(d, ctx("acasa"), `${cl}/h`, "jos");
  assert.deepEqual(subTitlu, { fel: "bloc-liber", cale: { sectiune: cl, bloc: null }, tinta: { fel: "sus", index: 1, dupa: "Titlu: Despre noi" } });
  const deasupra = ceAdaugaPlusul(d, ctx("acasa"), `${cl}/h`, "sus");
  assert.deepEqual(deasupra?.fel === "bloc-liber" ? deasupra.tinta : null, { fel: "sus", index: 0, inainte: "Titlu: Despre noi" });
  const inColoana = ceAdaugaPlusul(d, ctx("acasa"), `${cl}/c1`, "jos");
  assert.deepEqual(inColoana?.fel === "bloc-liber" ? inColoana.tinta : null, { fel: "coloana", idColoane: "col", coloana: 0, index: 1, dupa: "Text: Text" });
});

test("⚠ cu o pagina proprie ca pagina principala, Acasa n-are „+”: in previzualizare e pagina aceea", () => {
  const { d } = cuContinutAcasa();
  assert.deepEqual(faraSubsol(puncteDeAdaugare(d, ctx("acasa", { paginaAcasaProprie: true }))), []);
  assert.ok(puncteDeAdaugare(d, ctx("acasa", { paginaAcasaProprie: true })).length > 0, "subsolul are „+” si acolo (etapa 11)");
});

test("sectiunea noua intra la locul ales; fara loc, inaintea catalogului, ca pana acum", () => {
  // Pe designul clasic toate celelalte sunt deja puse (singletonuri); „Conținut liber” se poate repeta.
  const d = citit(buildClassicDesign(ctxDesign()));
  const a = d.home[0];
  const dupaA = addSection(d, "continut_liber", { dupa: a.id });
  assert.equal(dupaA.home[1].kind, "continut_liber");
  const inainteA = addSection(d, "continut_liber", { inainte: a.id });
  assert.equal(inainteA.home[0].kind, "continut_liber");
  const implicit = addSection(d, "continut_liber");
  const iCatalog = implicit.home.findIndex((s) => s.kind === "product_grid");
  assert.equal(implicit.home[iCatalog - 1].kind, "continut_liber");
  assert.deepEqual(addSection(d, "continut_liber", { dupa: "nu-exista" }).home.map((s) => s.kind), implicit.home.map((s) => s.kind), "loc negasit = implicit");
  assert.equal(addSection(d, "hero", { dupa: a.id }), d, "un singleton pus deja nu se dubleaza, nici cu loc");
});

test("„Secțiuni și blocuri”: blocul ales din galerie intra intr-un „Conținut liber” nou, la locul ales", () => {
  const d = citit(buildClassicDesign(ctxDesign()));
  const prima = d.home[0];
  const r = sectiuneNoua(d, "continut_liber", { dupa: prima.id }, titlu("nou", "Salut"));
  assert.ok(r);
  assert.equal(r.design.home[1].id, r.id);
  assert.equal(r.design.home[1].kind, "continut_liber");
  assert.deepEqual(r.design.home[1].settings.blocuri, [titlu("nou", "Salut")]);
  // Si dupa parsare (salvarea ciornei): blocul ramane.
  const parsat = citit(r.design).home.find((s) => s.id === r.id)!;
  assert.equal((parsat.settings.blocuri as Block[])[0].id, "nou");
  // Fara bloc, continutul ramane cum il face galeria; un singleton care exista nu se adauga.
  const gol = sectiuneNoua(d, "continut_liber", undefined);
  assert.ok(gol);
  assert.ok(!JSON.stringify(gol.design.home.find((s) => s.id === gol.id)!.settings).includes("nou"));
  assert.equal(sectiuneNoua(d, "hero", { dupa: prima.id }, titlu("x", "x")), null);
});

test("randul de produse adaugat din „+” vine la locul ales; ordinea randurilor intre ele urmeaza regula sagetilor", () => {
  const d = citit(buildClassicDesign(ctxDesign()));
  // Derivarea pune randul nou inaintea catalogului; „Recomandate” (`featured`) e tot un rand, mai sus.
  const rand = { id: "rand_nou", kind: "product_row" as const, variant: "classic", enabled: true, settings: {} };
  const iCatalog = d.home.findIndex((s) => s.kind === "product_grid");
  const cuRand: StoreDesign = { ...d, home: [...d.home.slice(0, iCatalog), rand, ...d.home.slice(iCatalog)] };
  // Sub catalog: tot dupa „Recomandate”, deci ordinea randurilor intre ele ramane.
  const subCatalog = mutaSectiuneaLa(cuRand, "rand_nou", { dupa: "catalog" });
  assert.equal(subCatalog.home[subCatalog.home.findIndex((s) => s.id === "catalog") + 1].id, "rand_nou");
  assert.equal(subCatalog.ordineAtinsa, undefined, "ordinea randurilor nu s-a schimbat: derivarea le aseaza mai departe");
  // Deasupra lui „Recomandate”: ordinea lor s-a schimbat, deci e a omului de acum (ca la sageti).
  const sus = mutaSectiuneaLa(cuRand, "rand_nou", { inainte: "featured" });
  assert.equal(sus.home[sus.home.findIndex((s) => s.id === "featured") - 1].id, "rand_nou");
  assert.equal(sus.ordineAtinsa, true);
  assert.equal(mutaSectiuneaLa(cuRand, "rand_nou", { dupa: "nu-exista" }), cuRand);
  assert.equal(mutaSectiuneaLa(cuRand, "nu-exista", { dupa: "catalog" }), cuRand);
});

// ── Pagina de produs ─────────────────────────────────────────────────────────

function cuContinutSubProdus(): { d: StoreDesign; cont: string } {
  let d = citit(buildClassicDesign(ctxDesign()));
  d = schimbaBlocurile(d, d.product.page.id, (l, s) => adaugaContinut(l, s, "continut_liber", { dupa: "descriere" }));
  const cont = d.product.page.blocks!.find((b) => b.type === "continut_liber")!.id;
  d = schimbaBlocuriLaCale(d, { sectiune: d.product.page.id, bloc: cont }, () => [text("p1"), text("p2")]);
  return { d: citit(d), cont };
}

test("pe pagina de produs: „+” doar sub produs (bucatile aprinse, continuturile si blocurile lor), nu in zona de cumparare", () => {
  const { d, cont } = cuContinutSubProdus();
  const pid = d.product.page.id;
  const puncte = puncteDeAdaugare(d, ctx("produs"));
  const ids = puncte.map((p) => p.id);
  assert.ok(ids.includes(pid), "pagina insasi (jos)");
  assert.equal(puncte.find((p) => p.id === pid)!.sus, undefined, "deasupra produsului nu se adauga nimic");
  for (const fix of ["titlu", "pret", "cumparare", "variante"]) assert.ok(!ids.includes(`${pid}/${fix}`), fix);
  for (const jos of ["descriere", "specificatii", cont, `${cont}/p1`, `${cont}/p2`]) assert.ok(ids.includes(`${pid}/${jos}`), jos);
  // Stinse implicit (fara comutatoarele vechi): nu se vad, deci n-au „+”.
  assert.ok(!ids.includes(`${pid}/beneficii`));
  // Primul aprins din zona are si „deasupra”.
  const primulJos = d.product.page.blocks!.find((b) => b.enabled && ["oferte", "descriere"].includes(b.type))!;
  assert.equal(puncte.find((p) => p.id === `${pid}/${primulJos.id}`)!.sus, true);
  assert.equal(puncte.find((p) => p.id === `${pid}/specificatii`)!.sus, undefined);
});

test("pe pagina de produs: bucata fixa -> „Conținut liber” nou langa ea; continutul -> in el; blocul -> langa el", () => {
  const { d, cont } = cuContinutSubProdus();
  const pid = d.product.page.id;
  const subSpec = ceAdaugaPlusul(d, ctx("produs"), `${pid}/specificatii`, "jos");
  assert.deepEqual(subSpec, { fel: "continut-nou", sectiune: pid, tip: "continut_liber", loc: { dupa: "specificatii" }, locText: "sub „Specificațiile”" });
  const inCont = ceAdaugaPlusul(d, ctx("produs"), `${pid}/${cont}`, "jos");
  assert.deepEqual(inCont, { fel: "bloc-liber", cale: { sectiune: pid, bloc: cont }, tinta: { fel: "sus", index: 2 } });
  const langaBloc = ceAdaugaPlusul(d, ctx("produs"), `${pid}/${cont}/p1`, "jos");
  assert.deepEqual(langaBloc?.fel === "bloc-liber" ? langaBloc.tinta : null, { fel: "sus", index: 1, dupa: "Text: Text" });
  const pagina = ceAdaugaPlusul(d, ctx("produs"), pid, "jos");
  assert.deepEqual(pagina, { fel: "continut-nou", sectiune: pid, tip: "continut_liber", loc: {}, locText: "la sfârșitul zonei „Sub produs”" });
  assert.equal(ceAdaugaPlusul(d, ctx("produs"), `${pid}/pret`, "jos"), null, "pretul n-are „+”");
});

test("⚠ „Conținut liber” nou din „+”: chiar langa bucata aleasa, cu blocul in el; peste plafon, nimic", () => {
  const { d } = cuContinutSubProdus();
  const pid = d.product.page.id;
  const a = ceAdaugaPlusul(d, ctx("produs"), `${pid}/specificatii`, "jos");
  assert.ok(a?.fel === "continut-nou");
  const r = continutNou(d, a, titlu("b1", "Nou"));
  assert.ok(r);
  const blocuri = r.design.product.page.blocks!;
  const i = blocuri.findIndex((b) => b.id === "specificatii");
  assert.equal(blocuri[i + 1].id, r.id);
  assert.deepEqual(blocuri[i + 1].settings.blocuri, [titlu("b1", "Nou")]);
  const deasupra = ceAdaugaPlusul(d, ctx("produs"), `${pid}/${d.product.page.blocks!.find((b) => b.enabled && b.type === "oferte")!.id}`, "sus");
  assert.ok(deasupra?.fel === "continut-nou");
  const r2 = continutNou(d, deasupra, text("b2"))!;
  const lista2 = r2.design.product.page.blocks!;
  assert.equal(lista2[lista2.findIndex((b) => b.id === r2.id) + 1].id, "oferte");
  // Plafonul de 10 continuturi pe pagina.
  let plin = d;
  for (let k = 0; k < 12; k++) plin = schimbaBlocurile(plin, pid, (l, s) => adaugaContinut(l, s, "continut_liber"));
  assert.equal(continutNou(plin, a, text("x")), null);
});

test("pe un sablon de produs, „+” e pe pagina sablonului editat", () => {
  const { d } = cuContinutSubProdus();
  const sablon = { nume: "T", page: { ...structuredClone(d.product.page), id: "sablon_t" }, categorii: [], produse: [] };
  const cuSablon = citit({ ...d, product: { ...d.product, sabloane: [sablon] } });
  const ids = puncteDeAdaugare(cuSablon, ctx("produs", { sablon: "sablon_t" })).map((p) => p.id);
  assert.ok(ids.includes("sablon_t/specificatii"));
  assert.ok(!ids.includes(`${d.product.page.id}/specificatii`));
});

test("magazinul cu un singur produs: Acasa e pagina produsului, cu „+” sub produs", () => {
  const { d } = cuContinutSubProdus();
  const unul = ctx("acasa", { magazin: { slug: "m", produsSlug: "p", unSingurProdus: true } });
  const ids = puncteDeAdaugare(d, unul).map((p) => p.id);
  assert.ok(ids.includes(`${d.product.page.id}/descriere`));
  assert.ok(!ids.some((id) => d.home.some((s) => s.id === id)), "fara sectiunile paginii principale");
});

// ── Pagina Magazin ───────────────────────────────────────────────────────────

test("pe Pagina Magazin: marginea de sus = deasupra produselor, cea de jos = sub produse; fara pagina, nimic", () => {
  const d0 = citit(buildClassicDesign(ctxDesign()));
  assert.deepEqual(faraSubsol(puncteDeAdaugare(updateSection(d0, d0.shop.page.id, { enabled: false }), ctx("magazin"))), [], "produsele pe pagina principala");
  let d = updateSection(d0, d0.shop.page.id, { variant: "sidebar", enabled: true });
  const sid = d.shop.page.id;
  const puncte = faraSubsol(puncteDeAdaugare(d, ctx("magazin")));
  assert.deepEqual(puncte, [{ id: sid, sus: true }]);
  const sus = ceAdaugaPlusul(d, ctx("magazin"), sid, "sus");
  assert.deepEqual(sus, { fel: "continut-nou", sectiune: sid, tip: "continut_sus", loc: {}, locText: "la începutul zonei „Deasupra produselor”" });
  const jos = ceAdaugaPlusul(d, ctx("magazin"), sid, "jos");
  assert.deepEqual(jos, { fel: "continut-nou", sectiune: sid, tip: "continut_jos", loc: {}, locText: "la sfârșitul zonei „Sub produse”" });
  // Cu un continut deasupra, „+” de sus pune urmatorul inaintea lui.
  d = schimbaBlocurile(d, sid, (l, s) => adaugaContinut(l, s, "continut_sus"));
  const primul = d.shop.page.blocks![0].id;
  const iar = ceAdaugaPlusul(d, ctx("magazin"), sid, "sus");
  assert.deepEqual(iar?.fel === "continut-nou" ? iar.loc : null, { inainte: primul });
  const r = continutNou(d, iar as Extract<typeof iar, { fel: "continut-nou" }>, text("z"))!;
  assert.equal(r.design.shop.page.blocks![0].id, r.id, "noul e primul");
});

// ── Pagina proprie, cos, comanda ─────────────────────────────────────────────

test("pe o pagina proprie: „+” pe blocurile ei (si din coloane) -> „Adaugă un bloc” la tinta", () => {
  const blocuri = [titlu("h", "Salut"), coloane("col", [text("c1")], [])];
  const c = ctx("pagina:pg", { blocuriPagina: blocuri });
  assert.deepEqual(faraSubsol(puncteDeAdaugare(citit(buildClassicDesign(ctxDesign())), c)).map((p) => p.id), ["pagina:pg/h", "pagina:pg/col", "pagina:pg/c1"]);
  const d = citit(buildClassicDesign(ctxDesign()));
  assert.deepEqual(ceAdaugaPlusul(d, c, "pagina:pg/h", "jos"), { fel: "bloc-pagina", tinta: { fel: "sus", index: 1, dupa: "Titlu: Salut" } });
  assert.deepEqual(ceAdaugaPlusul(d, c, "pagina:pg/c1", "sus"), { fel: "bloc-pagina", tinta: { fel: "coloana", idColoane: "col", coloana: 0, index: 0, inainte: "Text: Text" } });
  assert.deepEqual(faraSubsol(puncteDeAdaugare(d, ctx("pagina:pg"))), [], "pagina inca neincarcata");
  assert.equal(ceAdaugaPlusul(d, c, "pagina:alta/h", "jos"), null, "alta pagina");
});

test("cosul si comanda n-au „+”", () => {
  const d = citit(buildClassicDesign(ctxDesign()));
  assert.deepEqual(faraSubsol(puncteDeAdaugare(d, ctx("cos"))), []);
  assert.deepEqual(faraSubsol(puncteDeAdaugare(d, ctx("comanda"))), []);
});

test("tintaLangaBloc: in lista sau in coloana; `null` pentru un bloc strain", () => {
  const blocuri = [text("a"), coloane("col", [], [text("x"), text("y")])];
  assert.deepEqual(tintaLangaBloc(blocuri, "a", "sus"), { fel: "sus", index: 0, inainte: "Text: Text" });
  assert.deepEqual(tintaLangaBloc(blocuri, "y", "jos"), { fel: "coloana", idColoane: "col", coloana: 1, index: 2, dupa: "Text: Text" });
  assert.equal(tintaLangaBloc(blocuri, "z", "jos"), null);
});

// ── Subsolul (etapa 11) ──────────────────────────────────────────────────────

test("subsolul: „+” pe coloanele lui vazute, pe orice pagina -> „Adaugă coloană” langa cea aleasa", () => {
  const d = citit(buildClassicDesign(ctxDesign()));
  for (const pagina of ["acasa", "produs", "cos", "pagina:pg"] as CheiePagina[]) {
    const dinSubsol = puncteDeAdaugare(d, ctx(pagina)).filter((p) => !faraSubsol([p]).length);
    assert.deepEqual(dinSubsol, [{ id: "footer/identitate", sus: true }, { id: "footer/magazin" }, { id: "footer/informatii" }, { id: "footer/contact" }], pagina);
  }
  assert.deepEqual(ceAdaugaPlusul(d, ctx("acasa"), "footer/magazin", "jos"), { fel: "coloana-subsol", loc: { dupa: "magazin" }, locText: "după „Linkuri: Magazin”" });
  assert.deepEqual(ceAdaugaPlusul(d, ctx("acasa"), "footer/identitate", "sus"), { fel: "coloana-subsol", loc: { inainte: "identitate" }, locText: "înainte de „Logo și text”" });
  assert.equal(ceAdaugaPlusul(d, ctx("acasa"), "footer/magazin", "sus"), null, "„deasupra” doar pe prima");
  // Fara nicio coloana vazuta: subsolul insusi, ca sa se poata pune prima.
  const gol = schimbaBlocurile(d, "footer", () => []);
  assert.deepEqual(puncteDeAdaugare(gol, ctx("acasa")).filter((p) => p.id === "footer"), [{ id: "footer" }]);
  assert.deepEqual(ceAdaugaPlusul(gol, ctx("acasa"), "footer", "jos"), { fel: "coloana-subsol", loc: {}, locText: "la capătul subsolului" });
});

// ── Legaturile din cod: stratul, clicul, editorul ────────────────────────────

const RAD = process.cwd();
const cod = (f: string) => readFileSync(path.join(RAD, f), "utf8").replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("⚠⚠ clicul pe „+” pleaca la editor ca „adauga”, INAINTEA alegerii elementului de sub el", () => {
  // `useDesignPreview` opreste orice clic din previzualizare inainte de React: butonul nu-si primeste clicul altfel.
  const c = cod("src/components/storefront/useDesignPreview.ts");
  const laClic = c.slice(c.indexOf("function onClick"));
  const iPlus = laClic.indexOf("plusulDeSub(");
  const iSectiune = laClic.indexOf("sectiuneaDeSub(");
  assert.ok(iPlus > 0 && iSectiune > iPlus, "intai „+”, apoi sectiunea");
  assert.match(
    laClic.slice(laClic.indexOf("const plus"), iSectiune),
    /^const plus = plusulDeSub\(event\.target as Element \| null\);\s*if \(plus\) \{\s*window\.parent\.postMessage\(\{ \[PREVIEW_MESSAGE\]: "adauga", \.\.\.plus \}, window\.location\.origin\);\s*return;\s*\}/,
  );
});

test("⚠ stratul de contur: „+” se apasa, mouse-ul pe el pastreaza elementul, si apare doar unde a spus editorul", () => {
  const c = cod("src/components/storefront/ConturEditor.tsx");
  assert.match(c, /pointerEvents: "auto"/, "butonul primeste clicuri, restul stratului nu");
  assert.match(c, /\{\.\.\.\{ \[MARGINE_ATTR\]: "sus" \}\}/);
  assert.match(c, /\{\.\.\.\{ \[MARGINE_ATTR\]: "jos" \}\}/);
  assert.match(c, /buton\.setAttribute\(ADAUGA_ATTR, id\)/);
  // Pe buton, elementul de sub mouse nu se schimba (butonul sta pe granita cu vecinul).
  const laMiscare = c.slice(c.indexOf("function laMiscare"));
  assert.ok(laMiscare.indexOf("plusuri.current?.contains(") < laMiscare.indexOf("sectiuneaDeSub("));
  assert.match(c, /puncte = new Map\(\(e\.data\.adaugare \?\? \[\]\)/, "lista vine din `evidentiere`");
  // In AFARA elementului, lipit de margine: centrat pe ea, pe un rand scund (subsolul centrat) acoperea mijlocul lui,
  // iar clicul dat ca sa-l aleaga nimerea „+”-ul (proba etapei 11).
  assert.match(c, /const varf = sus \? y - PLUS \+ PESTE_MARGINE : y - PESTE_MARGINE;/);
  assert.match(c, /const PESTE_MARGINE = 4;/);
  // In afara stratului `aria-hidden`: intre deschiderea lui si butoane, fiecare `<div` e deja inchis.
  const intre = c.slice(c.indexOf('<div ref={radacina} aria-hidden="true">'), c.indexOf("<div ref={plusuri}>"));
  assert.ok(intre.length > 0);
  assert.equal((intre.match(/<div\b/g) ?? []).length, (intre.match(/<\/div>/g) ?? []).length, "butoanele nu sunt in stratul ascuns");
});

test("⚠⚠ editorul trimite punctele cu evidentierea si nu crede mesajul din cadru: il cauta pe lista lui", () => {
  const c = cod("src/components/editor-magazin/EditorMagazin.tsx");
  assert.match(c, /evidentiereAcum\.current = \{ selectat: selectatVazut, peste: pesteVazut, adaugare: puncteAdaugare \}/);
  const ramura = c.slice(c.indexOf('if (tip === "adauga")'), c.indexOf('else if (tip === "ready")'));
  assert.match(ramura, /typeof id !== "string" \|\| \(unde !== "sus" && unde !== "jos"\)/);
  assert.match(ramura, /ceAdaugaPlusul\(design, ctxAdaugare, id, unde\)/);
  // Galeria are si blocurile (raspunsul lui: „Secțiuni și blocuri”), cu locul ales.
  assert.match(c, /<GalerieAdauga[^>]*loc=\{locAdaugare\?\.text\}[\s\S]*?onBloc=\{adaugaBlocDinGalerie\}/);
  // Randul de produse: adaugat si mutat sub ACEEASI cheie, deci un singur pas la Anulează.
  assert.match(c, /seteazaSiSalveaza\("rand", [\s\S]*?, cheie\);\n\s*if \(ok && loc\) ciorna\.aplica\(\(d: StoreDesign\) => mutaSectiuneaLa\(d, rand\.id, loc\), cheie\);/);
});

// ── Protocolul ───────────────────────────────────────────────────────────────

test("plusulDeSub citeste butonul „+” din atributele lui; altceva nu e un „+”", () => {
  const el = (attr: Record<string, string>) => ({ closest: () => ({ getAttribute: (n: string) => attr[n] ?? null }) });
  assert.deepEqual(plusulDeSub(el({ "data-st-adauga": "hero", "data-st-margine": "jos" })), { id: "hero", unde: "jos" });
  assert.equal(plusulDeSub(el({ "data-st-adauga": "hero", "data-st-margine": "stanga" })), null);
  assert.equal(plusulDeSub(el({ "data-st-margine": "jos" })), null);
  assert.equal(plusulDeSub({ closest: () => null }), null);
  assert.equal(plusulDeSub(null), null);
});
