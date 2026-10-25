import test from "node:test";
import assert from "node:assert/strict";
import { buildClassicDesign } from "./defaults";
import { schimbaBlocurile, toateSectiunile, updateSection } from "./edit";
import { comutaBloc } from "./blocuri";
import { parseStoreDesign } from "./parse";
import {
  adaugaSablon,
  areSabloanePeCategorii,
  atribuieLaSablon,
  lantulCategoriei,
  MAX_SABLOANE,
  paginaSablonului,
  redenumesteSablon,
  sablonulProdusului,
  stergeSablon,
} from "./sabloane-produs";
import type { DesignContext, StoreDesign } from "./types";

/**
 * Sabloanele paginii de produs (etapa 4b din `docs/editor-magazin/PLAN.md`). Decizia lui: din
 * editor, pe categorii; produsele anume ca exceptii.
 *
 * Rulare: `npm test`.
 */

const ctx: DesignContext = { primaryColor: "#07c527", pageContent: {}, features: {} };
const citit = (d: unknown) => parseStoreDesign(JSON.parse(JSON.stringify(d)), ctx);
const baza = () => citit(buildClassicDesign(ctx));

const TABLOURI = "11111111-1111-4111-8111-111111111111";
const CANVAS = "22222222-2222-4222-8222-222222222222"; // subcategorie a Tablourilor
const TEXTILE = "33333333-3333-4333-8333-333333333333";
const PRODUS = "44444444-4444-4444-8444-444444444444";

/** Un design cu doua sabloane: „Tablouri” pe categoria Tablouri, „Special” pe un produs. */
function cuDouaSabloane(): { design: StoreDesign; tablouri: string; special: string } {
  const a = adaugaSablon(baza(), "Tablouri")!;
  const b = adaugaSablon(a.design, "Special")!;
  let design = atribuieLaSablon(b.design, a.id, "categorii", TABLOURI, true);
  design = atribuieLaSablon(design, b.id, "produse", PRODUS, true);
  return { design, tablouri: a.id, special: b.id };
}

test("⚠⚠ un design fara sabloane arata si se citeste exact ca inainte", () => {
  const d = baza();
  assert.equal("sabloane" in d.product, false, "fara cheie goala: amprenta designurilor vechi nu se schimba");
  assert.equal(sablonulProdusului(d.product, PRODUS, [TABLOURI]), d.product.page);
});

test("⚠⚠ ordinea: exceptia produsului, apoi categoria cea mai apropiata, apoi Implicit", () => {
  const { design, tablouri, special } = cuDouaSabloane();
  const p = design.product;
  assert.equal(sablonulProdusului(p, PRODUS, [TABLOURI]).id, special, "exceptia castiga in fata categoriei");
  assert.equal(sablonulProdusului(p, "alt-produs", [CANVAS, TABLOURI]).id, tablouri, "subcategoria ia sablonul parintelui");
  assert.equal(sablonulProdusului(p, "alt-produs", [TEXTILE]).id, p.page.id, "fara sablon: Implicit");
  assert.equal(sablonulProdusului(p, null, []).id, p.page.id);

  // Subcategoria cu sablon propriu il are pe al ei, nu pe al parintelui.
  const c = adaugaSablon(design, "Canvas")!;
  const cuCanvas = atribuieLaSablon(c.design, c.id, "categorii", CANVAS, true);
  assert.equal(sablonulProdusului(cuCanvas.product, "alt-produs", [CANVAS, TABLOURI]).id, c.id);
  assert.equal(areSabloanePeCategorii(cuCanvas.product), true);
  assert.equal(areSabloanePeCategorii(baza().product), false);
});

test("impunerea din editor: pagina unui sablon dupa id, altfel Implicit", () => {
  const { design, special } = cuDouaSabloane();
  assert.equal(paginaSablonului(design.product, special).id, special);
  assert.equal(paginaSablonului(design.product, "necunoscut").id, design.product.page.id);
  assert.equal(paginaSablonului(design.product, null).id, design.product.page.id);
});

test("lantul categoriei urca pana la radacina si nu se blocheaza intr-un ciclu", () => {
  const categorii = [
    { id: TABLOURI, parent_id: null },
    { id: CANVAS, parent_id: TABLOURI },
    { id: "c1", parent_id: "c2" },
    { id: "c2", parent_id: "c1" },
  ];
  assert.deepEqual(lantulCategoriei(categorii, CANVAS), [CANVAS, TABLOURI]);
  assert.deepEqual(lantulCategoriei(categorii, "c1"), ["c1", "c2"]);
  assert.deepEqual(lantulCategoriei(categorii, "lipsa"), ["lipsa"]);
  assert.deepEqual(lantulCategoriei(categorii, null), []);
});

test("⚠⚠ parserul pastreaza sabloanele, idempotent, cu id-uri unice in tot designul", () => {
  const { design } = cuDouaSabloane();
  const o = citit(design);
  const de2 = citit(o);
  assert.deepEqual(de2, o, "a doua citire nu schimba nimic (garda de concurenta compara forme citite)");
  assert.equal(o.product.sabloane?.length, 2);
  const iduri = toateSectiunile(o).map((s) => s.id);
  assert.equal(new Set(iduri).size, iduri.length);
  // Pagina sablonului are lista completa de blocuri, ca Implicit.
  assert.deepEqual(o.product.sabloane![0].page.blocks!.map((b) => b.type), o.product.page.blocks!.map((b) => b.type));
});

test("⚠ parserul taie ce nu e sablon si dublurile: o categorie sta la un singur sablon", () => {
  const { design } = cuDouaSabloane();
  const brut = JSON.parse(JSON.stringify(design));
  brut.product.sabloane[1].categorii = [TABLOURI, TEXTILE, "nu e id!", 5];
  brut.product.sabloane.push({ nume: "Fara pagina", categorii: [] }, { page: { kind: "hero" } }, "gunoi");
  brut.product.sabloane[0].nume = "   ";
  const o = citit(brut);
  assert.equal(o.product.sabloane!.length, 2, "cele fara pagina de produs ies");
  assert.deepEqual(o.product.sabloane![0].categorii, [TABLOURI]);
  assert.deepEqual(o.product.sabloane![1].categorii, [TEXTILE], "Tablouri ramane la primul; idul stricat iese");
  assert.equal(o.product.sabloane![0].nume, "Șablon 1", "numele gol primeste unul");

  const multe = JSON.parse(JSON.stringify(design));
  multe.product.sabloane = Array.from({ length: MAX_SABLOANE + 5 }, (_, i) => ({ ...design.product.sabloane![0], page: { ...design.product.sabloane![0].page, id: `s${i}` }, categorii: [] }));
  assert.equal(citit(multe).product.sabloane!.length, MAX_SABLOANE);
});

test("un sablon nou porneste de la Implicit si nu schimba nimic pana nu i se atribuie ceva", () => {
  const d = baza();
  const r = adaugaSablon(d, "  Tablouri  ")!;
  const s = r.design.product.sabloane![0];
  assert.equal(s.nume, "Tablouri");
  assert.notEqual(s.page.id, d.product.page.id);
  assert.equal(s.page.variant, d.product.page.variant);
  assert.deepEqual(s.page.blocks, d.product.page.blocks);
  assert.deepEqual(s.categorii, []);
  assert.equal(sablonulProdusului(r.design.product, PRODUS, [TABLOURI]).id, d.product.page.id);

  let plin = d;
  for (let i = 0; i < MAX_SABLOANE; i++) plin = adaugaSablon(plin, `S${i}`)!.design;
  assert.equal(adaugaSablon(plin, "inca unul"), null, "peste plafon nu se mai adauga");
});

test("⚠ bifata la alt sablon, categoria se muta; operatiile goale intorc acelasi obiect", () => {
  const { design, tablouri, special } = cuDouaSabloane();
  const mutat = atribuieLaSablon(design, special, "categorii", TABLOURI, true);
  assert.deepEqual(mutat.product.sabloane!.find((s) => s.page.id === tablouri)!.categorii, []);
  assert.deepEqual(mutat.product.sabloane!.find((s) => s.page.id === special)!.categorii, [TABLOURI]);

  assert.equal(atribuieLaSablon(design, tablouri, "categorii", TABLOURI, true), design, "deja bifata");
  assert.equal(atribuieLaSablon(design, tablouri, "categorii", "nu e id!", true), design);
  assert.equal(atribuieLaSablon(design, "necunoscut", "categorii", TEXTILE, true), design);
  assert.equal(redenumesteSablon(design, tablouri, "Tablouri"), design);
  assert.equal(stergeSablon(design, "necunoscut"), design);

  const debifat = atribuieLaSablon(design, tablouri, "categorii", TABLOURI, false);
  assert.equal(sablonulProdusului(debifat.product, "alt", [TABLOURI]).id, design.product.page.id);
  assert.equal(redenumesteSablon(design, tablouri, " Postere ").product.sabloane![0].nume, "Postere");
});

test("stergerea trece produsele inapoi pe Implicit si scoate cheia cand nu mai ramane niciun sablon", () => {
  const { design, tablouri, special } = cuDouaSabloane();
  const unul = stergeSablon(design, tablouri);
  assert.equal(sablonulProdusului(unul.product, "alt", [TABLOURI]).id, design.product.page.id);
  const niciunul = stergeSablon(unul, special);
  assert.equal("sabloane" in niciunul.product, false);
});

test("⚠⚠ varianta, reglajele si blocurile unui sablon se editeaza ca la orice sectiune, fara sa atinga Implicit", () => {
  const { design, tablouri } = cuDouaSabloane();
  const detaliat = updateSection(design, tablouri, { variant: "detailed" });
  assert.equal(detaliat.product.sabloane!.find((s) => s.page.id === tablouri)!.page.variant, "detailed");
  assert.equal(detaliat.product.page.variant, design.product.page.variant, "Implicit ramane cum era");

  const tipOptional = design.product.page.blocks!.find((b) => b.type === "descriere_scurta")!.id;
  const ascuns = schimbaBlocurile(design, tablouri, (b, s) => comutaBloc(b, s, tipOptional));
  assert.notEqual(ascuns, design);
  assert.equal(ascuns.product.sabloane![0].page.blocks!.find((b) => b.id === tipOptional)!.enabled, false);
  assert.equal(ascuns.product.page.blocks!.find((b) => b.id === tipOptional)!.enabled, true);
});
