import test from "node:test";
import assert from "node:assert/strict";
import type { Block } from "@/lib/pages/blocks.types";
import { flattenBlocks } from "@/lib/pages/block-tree";
import {
  adaugaContinut, comutaBloc, duplicaContinut, MAX_CONTINUTURI_PE_SECTIUNE, mutaBloc, parseBlocuri, schemaBlocurilor, stergeContinut,
} from "./blocuri";
import { MAX_BLOCURI_CONTINUT, parseBlocuriLibere, TIPURI_CONTINUT_LIBER } from "./continut-liber";
import { buildClassicDesign } from "./defaults";
import {
  addableKinds, addSection, blocuriLaCale, completeazaBlocurileSectiunii, duplicateSection, schimbaBlocuriLaCale, schimbaBlocurile, updateSection,
} from "./edit";
import { parseStoreDesign } from "./parse";
import type { BlockInstance, DesignContext, StoreDesign } from "./types";

/**
 * „Conținut liber” (etapa 9 din `docs/editor-magazin/PLAN.md`): blocurile paginilor proprii pe pagina
 * principala, sub produs si pe Pagina Magazin, tinute in design.
 *
 * Rulare: `npm test`.
 */

const ctx = (pageContent: Record<string, unknown> = {}): DesignContext => ({ primaryColor: "#07c527", pageContent, features: {} });
const citit = (d: unknown, c = ctx()) => parseStoreDesign(JSON.parse(JSON.stringify(d)), c);
const CLASIC = schemaBlocurilor("product_page", "classic")!;
const MAGAZIN = schemaBlocurilor("shop_page", "sidebar")!;
const titlu = (id: string, text = "Povestea noastră"): Block => ({ id, type: "heading", text, level: 2 } as Block);
const text = (id: string): Block => ({ id, type: "text", html: "<p>Despre noi</p>" } as Block);
const ids = (bs: Block[]) => flattenBlocks(bs).map((b) => b.id);

// ── Forma blocurilor ─────────────────────────────────────────────────────────

test("se pot pune toate blocurile paginilor proprii, fara „Din pagina principală”", () => {
  assert.ok(!TIPURI_CONTINUT_LIBER.includes("acasa"));
  for (const t of ["hero", "heading", "text", "image", "columns", "faq", "products", "contact", "newsletter", "html"] as const) {
    assert.ok(TIPURI_CONTINUT_LIBER.includes(t), t);
  }
  const curat = parseBlocuriLibere([
    titlu("a"),
    { id: "b", type: "acasa", sectiune: "hero" },
    { id: "c", type: "nu_exista" },
    "text",
    null,
    [text("d")],
    text("e"),
  ]);
  assert.deepEqual(curat.map((b) => b.id), ["a", "e"]);
  assert.deepEqual(parseBlocuriLibere("nu e lista"), []);
});

test("coloanele: blocuri pe un singur nivel, ca in editorul de pagini", () => {
  const curat = parseBlocuriLibere([{
    id: "col", type: "columns", count: 2,
    items: [
      { blocks: [text("t1"), { id: "c2", type: "columns", items: [] }, { id: "h", type: "hero", title: "x" }, { id: "a", type: "acasa", sectiune: "hero" }] },
      { heading: "Coloana clasica", html: "<p>x</p>" },
    ],
  }]);
  const coloane = curat[0] as Extract<Block, { type: "columns" }>;
  assert.deepEqual(coloane.items?.[0].blocks?.map((b) => b.id), ["t1"], "fara coloane, erou sau „Din pagina principală” in coloana");
  assert.equal(coloane.items?.[1].heading, "Coloana clasica", "coloana clasica ramane");
});

test("⚠ plafonul numara si blocurile din coloane", () => {
  const multe = Array.from({ length: MAX_BLOCURI_CONTINUT + 5 }, (_, i) => text(`t${i}`));
  assert.equal(parseBlocuriLibere(multe).length, MAX_BLOCURI_CONTINUT);
  const cuColoane = [{ id: "col", type: "columns", items: [{ blocks: multe }] }, text("dupa")];
  assert.equal(flattenBlocks(parseBlocuriLibere(cuColoane)).length, MAX_BLOCURI_CONTINUT);
});

test("⚠⚠ id-urile: unice in tot continutul, cele lipsa sau stricate STABILE de la o citire la alta", () => {
  const brut = [
    { type: "heading", text: "fara id" },
    { id: "rau id cu spatii", type: "text", html: "" },
    text("x"),
    text("x"),
    { id: "col", type: "columns", items: [{ blocks: [text("x"), { type: "text", html: "" }] }] },
  ];
  const o = parseBlocuriLibere(brut);
  const toate = ids(o);
  assert.equal(new Set(toate).size, toate.length, `id-uri dublate: ${toate.join(", ")}`);
  // Aceeasi intrare, aceleasi id-uri: un formular trimis de pe magazin isi gaseste blocul pe server.
  assert.deepEqual(ids(parseBlocuriLibere(brut)), toate);
  // Idempotenta: ce s-a curatat o data nu se mai schimba (salvarea scrie forma curatata).
  assert.deepEqual(parseBlocuriLibere(JSON.parse(JSON.stringify(o))), o);
});

// ── Pagina principala ────────────────────────────────────────────────────────

test("⚠⚠ un magazin care nu adauga nimic citeste acelasi design ca inainte", () => {
  const d = citit(buildClassicDesign(ctx()));
  assert.ok(!("blocks" in d.shop.page), "Pagina Magazin fara continut nu primeste `blocks: []`");
  assert.ok(!d.product.page.blocks?.some((b) => b.type === "continut_liber"), "sub produs nu apare nimic singur");
  assert.ok(!d.home.some((s) => s.kind === "continut_liber"));
  assert.deepEqual(citit(d), d, "a doua citire da acelasi lucru");
});

test("„Conținut liber” pe pagina principala: se adauga inaintea catalogului, de cate ori e nevoie", () => {
  const d = citit(buildClassicDesign(ctx()));
  assert.ok(addableKinds(d).includes("continut_liber"));
  const unu = addSection(d, "continut_liber");
  const doi = addSection(unu, "continut_liber");
  const continuturi = doi.home.filter((s) => s.kind === "continut_liber");
  assert.equal(continuturi.length, 2);
  assert.deepEqual(continuturi[0].settings, { blocuri: [] });
  const catalog = doi.home.findIndex((s) => s.kind === "product_grid");
  assert.ok(doi.home.findIndex((s) => s.kind === "continut_liber") < catalog, "inaintea catalogului");
  assert.ok(addableKinds(doi).includes("continut_liber"), "nu e singleton");
});

test("⚠⚠ blocurile sectiunii trec prin parser (citire si salvare), curatate, cu tot ce au in ele", () => {
  const d = addSection(citit(buildClassicDesign(ctx())), "continut_liber");
  const id = d.home.find((s) => s.kind === "continut_liber")!.id;
  const cu = schimbaBlocuriLaCale(d, { sectiune: id, bloc: null }, () => [
    titlu("t1"),
    { ...text("t2"), style: { padding: "lg", anim: "fade-up" } } as Block,
    { id: "a", type: "acasa", sectiune: "hero" } as Block,
  ]);
  const recitit = citit(cu);
  const blocuri = blocuriLaCale(recitit, { sectiune: id, bloc: null })!;
  assert.deepEqual(blocuri.map((b) => b.id), ["t1", "t2"]);
  assert.deepEqual((blocuri[1] as { style?: unknown }).style, { padding: "lg", anim: "fade-up" }, "reglajele blocului raman");
  assert.deepEqual(citit(recitit), recitit, "idempotent");
});

test("duplicarea sectiunii da blocuri cu id-uri NOI (si in coloane)", () => {
  const d = addSection(citit(buildClassicDesign(ctx())), "continut_liber");
  const id = d.home.find((s) => s.kind === "continut_liber")!.id;
  const cu = schimbaBlocuriLaCale(d, { sectiune: id, bloc: null }, () => [
    titlu("t1"),
    { id: "col", type: "columns", items: [{ blocks: [text("t2")] }] } as Block,
  ]);
  const dublat = duplicateSection(cu, id);
  const [a, b] = dublat.home.filter((s) => s.kind === "continut_liber");
  const ida = ids(blocuriLaCale(dublat, { sectiune: a.id, bloc: null })!);
  const idb = ids(blocuriLaCale(dublat, { sectiune: b.id, bloc: null })!);
  assert.equal(ida.length, 3);
  assert.equal(idb.length, 3);
  assert.ok(ida.every((x) => !idb.includes(x)), "niciun id comun");
});

test("operatiile pe blocuri intorc ACELASI design cand n-au ce face", () => {
  const d = addSection(citit(buildClassicDesign(ctx())), "continut_liber");
  const id = d.home.find((s) => s.kind === "continut_liber")!.id;
  assert.equal(schimbaBlocuriLaCale(d, { sectiune: id, bloc: null }, (bs) => bs), d, "operatia n-a schimbat nimic");
  assert.equal(schimbaBlocuriLaCale(d, { sectiune: "nu_exista", bloc: null }, () => [titlu("x")]), d, "sectiune lipsa");
  assert.equal(schimbaBlocuriLaCale(d, { sectiune: "hero", bloc: null }, () => [titlu("x")]), d, "alta sectiune decat un continut");
  assert.equal(blocuriLaCale(d, { sectiune: d.product.page.id, bloc: "titlu" }), null, "o bucata fixa nu e continut");
});

// ── Sub produs ───────────────────────────────────────────────────────────────

const cuContinutSubProdus = (d: StoreDesign) => schimbaBlocurile(d, d.product.page.id, (l, s) => adaugaContinut(l, s, "continut_liber"));

test("sub produs: „Conținut liber” se adauga la capatul zonei „Sub produs”, se muta, se ascunde, se sterge", () => {
  const d = citit(buildClassicDesign(ctx()));
  const cu = cuContinutSubProdus(d);
  const lista = cu.product.page.blocks!;
  const continut = lista.find((b) => b.type === "continut_liber")!;
  assert.ok(continut.id.startsWith("cl_"), "id propriu, nu tipul");
  assert.deepEqual(continut.settings, { blocuri: [] });
  const jos = lista.filter((b) => CLASIC.tipuri[b.type]?.zona === "jos").map((b) => b.type);
  assert.equal(jos.at(-1), "continut_liber", "la capatul zonei");

  const mutat = mutaBloc(lista, CLASIC, continut.id, -1);
  assert.equal(mutat.findIndex((b) => b.id === continut.id), lista.findIndex((b) => b.id === continut.id) - 1);
  const ascuns = comutaBloc(lista, CLASIC, continut.id);
  assert.equal(ascuns.find((b) => b.id === continut.id)?.enabled, false);

  assert.equal(stergeContinut(lista, CLASIC, "titlu"), lista, "bucata fixa nu se sterge");
  assert.equal(stergeContinut(lista, CLASIC, continut.id).some((b) => b.id === continut.id), false);

  // „+” de sub un bloc din aceeasi zona: chiar sub el; sub un bloc din alta zona: la coada.
  const subDescriere = adaugaContinut(lista, CLASIC, "continut_liber", "descriere");
  const iDescriere = subDescriere.findIndex((b) => b.id === "descriere");
  assert.equal(subDescriere[iDescriere + 1].type, "continut_liber");
  const subTitlu = adaugaContinut(lista, CLASIC, "continut_liber", "titlu");
  assert.equal(subTitlu.length, lista.length + 1);
  assert.notEqual(subTitlu[subTitlu.findIndex((b) => b.id === "titlu") + 1].type, "continut_liber", "titlul e in zona de cumparare: continutul nu intra acolo");
  assert.ok(!lista.some((b) => b.id === subTitlu.at(-1)!.id), "cel nou e la coada");
});

test("⚠⚠ sub produs: continuturile trec prin parser, cu blocurile lor, si raman la schimbarea variantei", () => {
  const d = cuContinutSubProdus(cuContinutSubProdus(citit(buildClassicDesign(ctx()))));
  const [c1, c2] = d.product.page.blocks!.filter((b) => b.type === "continut_liber");
  const cu = schimbaBlocuriLaCale(d, { sectiune: d.product.page.id, bloc: c1.id }, () => [titlu("t1")]);
  const recitit = citit(cu);
  const dupa = recitit.product.page.blocks!.filter((b) => b.type === "continut_liber");
  assert.deepEqual(dupa.map((b) => b.id), [c1.id, c2.id], "doua, in ordinea lor, cu id-urile lor");
  assert.deepEqual(blocuriLaCale(recitit, { sectiune: d.product.page.id, bloc: c1.id })!.map((b) => b.id), ["t1"]);
  assert.deepEqual(citit(recitit), recitit, "idempotent");

  const detaliat = citit(updateSection(recitit, d.product.page.id, { variant: "detailed" }));
  assert.deepEqual(detaliat.product.page.blocks!.filter((b) => b.type === "continut_liber").map((b) => b.id), [c1.id, c2.id]);
});

test("sub produs: id-urile continuturilor stricate sau dublate devin stabile si unice; plafonul", () => {
  const brut = [
    { id: "titlu", type: "continut_liber", settings: { blocuri: [] } },
    { id: "cl_a", type: "continut_liber", settings: { blocuri: [titlu("t")] } },
    { id: "cl_a", type: "continut_liber", settings: {} },
    { type: "continut_liber" },
  ];
  const o = parseBlocuri(brut, CLASIC);
  const iduri = o.map((b) => b.id);
  assert.equal(new Set(iduri).size, iduri.length);
  assert.ok(!iduri.includes("titlu"), "nu ia id-ul unei bucati fixe");
  assert.deepEqual(parseBlocuri(brut, CLASIC).map((b) => b.id), iduri, "aceleasi la a doua citire");
  const prea = Array.from({ length: MAX_CONTINUTURI_PE_SECTIUNE + 3 }, (_, i) => ({ id: `cl_${i}`, type: "continut_liber", settings: {} }));
  assert.equal(parseBlocuri(prea, CLASIC).length, MAX_CONTINUTURI_PE_SECTIUNE);
  let lista: readonly BlockInstance[] = parseBlocuri(prea, CLASIC);
  assert.equal(adaugaContinut(lista, CLASIC, "continut_liber"), lista, "peste plafon nu se mai adauga");
  lista = stergeContinut(lista, CLASIC, lista[0].id);
  assert.equal(duplicaContinut(lista, CLASIC, lista[0].id).length, MAX_CONTINUTURI_PE_SECTIUNE);
});

test("duplicarea unui continut de sub produs: imediat sub el, cu id-uri noi si pe blocuri", () => {
  const d = cuContinutSubProdus(citit(buildClassicDesign(ctx())));
  const c = d.product.page.blocks!.find((b) => b.type === "continut_liber")!;
  const cu = schimbaBlocuriLaCale(d, { sectiune: d.product.page.id, bloc: c.id }, () => [titlu("t1"), text("t2")]);
  const lista = cu.product.page.blocks!;
  const dublat = duplicaContinut(lista, CLASIC, c.id);
  const i = dublat.findIndex((b) => b.id === c.id);
  const copia = dublat[i + 1];
  assert.equal(copia.type, "continut_liber");
  assert.notEqual(copia.id, c.id);
  const din = (b: BlockInstance) => ids(b.settings.blocuri as Block[]);
  assert.equal(din(copia).length, 2);
  assert.ok(din(copia).every((x) => !["t1", "t2"].includes(x)));
  assert.equal(duplicaContinut(lista, CLASIC, "titlu"), lista, "o bucata fixa nu se duplica asa");
});

test("⚠ fiecare sablon de produs are continutul lui", () => {
  const d = citit(buildClassicDesign(ctx()));
  const sablon = { nume: "Tablouri", page: { ...structuredClone(d.product.page), id: "sablon_tablouri" }, categorii: [], produse: [] };
  const cuSablon = citit({ ...d, product: { ...d.product, sabloane: [sablon] } });
  const cu = schimbaBlocurile(cuSablon, "sablon_tablouri", (l, s) => adaugaContinut(l, s, "continut_liber"));
  const recitit = citit(cu);
  assert.equal(recitit.product.sabloane![0].page.blocks!.filter((b) => b.type === "continut_liber").length, 1);
  assert.ok(!recitit.product.page.blocks!.some((b) => b.type === "continut_liber"), "Implicit ramane fara");
});

// ── Pagina Magazin ───────────────────────────────────────────────────────────

test("⚠ Pagina Magazin: deasupra si sub produse, pastrate la schimbarea designului (si pe „none”)", () => {
  const d = citit(buildClassicDesign(ctx()));
  const id = d.shop.page.id;
  assert.ok(!("blocks" in d.shop.page));
  // Forma canonica: o lista goala salvata se citeste fara cheie (garda cioarnei compara forme citite).
  assert.ok(!("blocks" in citit({ ...d, shop: { page: { ...d.shop.page, blocks: [] } } }).shop.page));
  // ⚠ Fara cheia `blocks` (asa o lasa parserul cand e goala), primul continut tot se adauga.
  const unu = schimbaBlocurile(d, id, (l, s) => adaugaContinut(l, s, "continut_sus"));
  assert.notEqual(unu, d);
  const doi = schimbaBlocurile(unu, id, (l, s) => adaugaContinut(l, s, "continut_jos"));
  const recitit = citit(doi);
  assert.deepEqual(recitit.shop.page.blocks!.map((b) => MAGAZIN.tipuri[b.type].zona), ["sus", "jos"]);
  for (const variant of ["toolbar", "none", "sidebar"]) {
    const alt = citit(updateSection(recitit, id, { variant }));
    assert.equal(alt.shop.page.blocks?.length, 2, variant);
  }
  // In editor, dupa schimbarea variantei: fara continut, tot fara cheie (ca la citire).
  const golit = completeazaBlocurileSectiunii(updateSection(d, id, { variant: "toolbar" }), id, {});
  assert.ok(!("blocks" in golit.shop.page));
  assert.equal(completeazaBlocurileSectiunii(recitit, id, {}).shop.page.blocks?.length, 2);
});
