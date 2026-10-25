import test from "node:test";
import assert from "node:assert/strict";
import { blocurileZonei, comutaBloc, completeazaBlocuri, mutaBloc, parseBlocuri, schemaBlocurilor, type ContextBlocuri } from "./blocuri";
import { buildClassicDesign } from "./defaults";
import { schimbaBlocurile, updateSection } from "./edit";
import { parseStoreDesign } from "./parse";
import type { BlockInstance, DesignContext } from "./types";

/**
 * Blocurile paginii de produs (etapa 4 din `docs/editor-magazin/PLAN.md`):
 * ordinea, vizibilitatea si cele care nu se pot ascunde.
 *
 * Rulare: `npm test`.
 */

const CLASIC = schemaBlocurilor("product_page", "classic")!;
const DETALIAT = schemaBlocurilor("product_page", "detailed")!;
const gol: ContextBlocuri = { pageContent: {}, setari: {} };
const tipuri = (l: readonly BlockInstance[]) => l.map((b) => b.type);
const ctx = (pageContent: Record<string, unknown> = {}): DesignContext => ({ primaryColor: "#07c527", pageContent, features: {} });
const citit = (d: unknown, c = ctx()) => parseStoreDesign(JSON.parse(JSON.stringify(d)), c);

test("doar pagina de produs are blocuri, cate o schema pe varianta", () => {
  assert.ok(CLASIC && DETALIAT);
  assert.notEqual(CLASIC, DETALIAT);
  assert.equal(schemaBlocurilor("hero", "overlay"), null);
  assert.equal(schemaBlocurilor("footer", "dark"), null);
});

test("⚠⚠ lista implicita e asezarea de dinainte de blocuri, cu toate tipurile o data", () => {
  // Ordinea cheilor din schema e chiar ordinea din `zonaDeCumparare` si de sub
  // ea; o lista altfel asezata ar fi mutat bucati pe pagina tuturor magazinelor.
  const lista = completeazaBlocuri(undefined, CLASIC, gol);
  assert.deepEqual(tipuri(lista), Object.keys(CLASIC.tipuri));
  assert.equal(new Set(tipuri(lista)).size, lista.length);
  assert.deepEqual(tipuri(completeazaBlocuri(undefined, DETALIAT, gol)), Object.keys(DETALIAT.tipuri));
});

test("⚠⚠ blocurile de bani, lege si comanda nu se pot ascunde", () => {
  for (const schema of [CLASIC, DETALIAT]) {
    const obligatorii = Object.entries(schema.tipuri).filter(([, m]) => m.obligatoriu).map(([t]) => t);
    for (const t of ["titlu", "pret", "variante", "stoc", "personalizare", "cumparare", "oferte"]) {
      assert.ok(obligatorii.includes(t), `${t} trebuie sa fie obligatoriu`);
    }
    // Nici semnul ochiului salvat, nici ochiul apasat nu le stinge.
    const stinse = obligatorii.map((t) => ({ id: t, type: t, enabled: false, enabledOverride: false, settings: {} }));
    const lista = completeazaBlocuri(parseBlocuri(stinse, schema), schema, gol);
    for (const t of obligatorii) {
      const b = lista.find((x) => x.type === t)!;
      assert.equal(b.enabled, true, t);
      assert.equal(b.enabledOverride, undefined, t);
      assert.equal(comutaBloc(lista, schema, t), lista, `${t}: ochiul nu face nimic`);
    }
  }
});

test("vizibilitatea implicita vine din comutatoarele vechi, ca nicio pagina sa nu se schimbe", () => {
  const pornite = completeazaBlocuri(undefined, CLASIC, {
    pageContent: {
      show_quality_badge: true, show_social_proof: true, delivery_estimate: { enabled: true },
      benefits_section: { enabled: true }, how_it_works_section: { enabled: true }, faq_section: { enabled: true },
    },
    setari: {},
  });
  for (const t of ["insigna", "dovada", "beneficii", "cum_functioneaza", "intrebari", "incredere"]) {
    assert.equal(pornite.find((b) => b.type === t)?.enabled, true, t);
  }
  // Fara nimic aprins: cele cu comutator „pornit doar daca” sunt stinse, garantiile raman (implicit aprinse).
  const implicite = completeazaBlocuri(undefined, CLASIC, gol);
  for (const t of ["insigna", "dovada", "beneficii", "cum_functioneaza", "intrebari"]) {
    assert.equal(implicite.find((b) => b.type === t)?.enabled, false, t);
  }
  assert.equal(implicite.find((b) => b.type === "incredere")?.enabled, true);
  assert.equal(completeazaBlocuri(undefined, CLASIC, { pageContent: { trust_badges_enabled: false }, setari: {} })
    .find((b) => b.type === "incredere")?.enabled, false);
  // Detaliat: reglajele variantei.
  const detaliat = completeazaBlocuri(undefined, DETALIAT, { pageContent: {}, setari: { showDetails: false, showTiers: false } });
  assert.equal(detaliat.find((b) => b.type === "detalii")?.enabled, false);
  assert.equal(detaliat.find((b) => b.type === "trepte")?.enabled, false);
  assert.equal(detaliat.find((b) => b.type === "rezumat")?.enabled, true);
  assert.equal(detaliat.find((b) => b.type === "contact")?.enabled, true);
});

test("⚠⚠ ochiul castiga in fata comutatorului vechi, in ambele directii", () => {
  const aprinsa = completeazaBlocuri(undefined, CLASIC, { pageContent: { faq_section: { enabled: true } }, setari: {} });
  const stinsa = completeazaBlocuri(comutaBloc(aprinsa, CLASIC, "intrebari"), CLASIC, { pageContent: { faq_section: { enabled: true } }, setari: {} });
  assert.equal(stinsa.find((b) => b.type === "intrebari")?.enabled, false, "stinsa de ochi, desi comutatorul e pornit");
  const din = completeazaBlocuri(undefined, CLASIC, gol);
  const pornita = completeazaBlocuri(comutaBloc(din, CLASIC, "intrebari"), CLASIC, gol);
  assert.equal(pornita.find((b) => b.type === "intrebari")?.enabled, true, "aprinsa de ochi, desi comutatorul lipseste");
});

test("ordinea salvata ramane; un tip lipsa intra langa vecinul lui din ordinea implicita", () => {
  const salvate = parseBlocuri([
    { type: "pret" }, { type: "titlu" }, { type: "cumparare" }, { type: "beneficii" }, { type: "intrebari" },
  ], CLASIC);
  const lista = completeazaBlocuri(salvate, CLASIC, gol);
  const t = tipuri(lista);
  assert.ok(t.indexOf("pret") < t.indexOf("titlu"), "ordinea aleasa de om ramane");
  assert.equal(t.indexOf("descriere_scurta"), t.indexOf("titlu") + 1, "descrierea scurta vine dupa titlu, vecinul ei");
  assert.equal(t.indexOf("insigna"), t.indexOf("titlu") - 1, "fara vecin in stanga, intra inaintea celui din dreapta");
  assert.deepEqual(completeazaBlocuri(lista, CLASIC, gol), lista, "a doua trecere nu mai schimba nimic");
});

test("tipurile necunoscute si dublurile ies la citire", () => {
  const lista = parseBlocuri([{ type: "pret" }, { type: "pret" }, { type: "nu_exista" }, "x", null, { type: "titlu" }], CLASIC);
  assert.deepEqual(tipuri(lista), ["pret", "titlu"]);
  assert.deepEqual(parseBlocuri("nu e lista", CLASIC), []);
});

test("blocurile se muta doar in zona lor", () => {
  const lista = completeazaBlocuri(undefined, CLASIC, gol);
  const jos = blocurileZonei(completeazaBlocuri(undefined, CLASIC, { pageContent: { faq_section: { enabled: true } }, setari: {} }), CLASIC, "jos");
  assert.equal(jos[0].type, "oferte");
  // Primul din „jos” nu urca in zona de cumparare, ultimul din cumparare nu coboara.
  assert.equal(mutaBloc(lista, CLASIC, "oferte", -1), lista);
  assert.equal(mutaBloc(lista, CLASIC, "dovada", 1), lista);
  const mutat = mutaBloc(lista, CLASIC, "pret", -1);
  assert.equal(tipuri(mutat).indexOf("pret"), tipuri(lista).indexOf("descriere_scurta"));
  assert.equal(mutaBloc(lista, CLASIC, "nu_exista", 1), lista);
});

test("⚠⚠ designul citit are pagina de produs cu toate blocurile, si o a doua citire da acelasi lucru", () => {
  const d = citit(buildClassicDesign(ctx()));
  assert.deepEqual(tipuri(d.product.page.blocks ?? []), Object.keys(CLASIC.tipuri));
  assert.deepEqual(citit(d), d, "garda de concurenta a ciornei compara forme parsate");
  // Un design salvat inainte de blocuri le primeste la citire, cu vizibilitatea de azi.
  const vechi = JSON.parse(JSON.stringify(buildClassicDesign(ctx()))) as Record<string, unknown>;
  delete (vechi.product as { page: { blocks?: unknown } }).page.blocks;
  const dinVechi = citit(vechi, ctx({ faq_section: { enabled: true } }));
  assert.equal(dinVechi.product.page.blocks?.find((b) => b.type === "intrebari")?.enabled, true);
});

test("operatiile pe design intorc acelasi obiect cand n-au ce face (istoricul nu noteaza pas gol)", () => {
  const d = citit(buildClassicDesign(ctx()));
  const id = d.product.page.id;
  assert.equal(schimbaBlocurile(d, id, (b, s) => comutaBloc(b, s, "pret")), d, "blocul obligatoriu");
  assert.equal(schimbaBlocurile(d, "hero", (b, s) => comutaBloc(b, s, "beneficii")), d, "sectiunea fara blocuri");
  const mutat = schimbaBlocurile(d, id, (b, s) => mutaBloc(b, s, "pret", -1));
  assert.notEqual(mutat, d);
  assert.equal(tipuri(d.product.page.blocks!).indexOf("pret"), tipuri(mutat.product.page.blocks!).indexOf("pret") + 1, "originalul ramane neatins");
});

test("la schimbarea variantei, ochiul si ordinea se pastreaza pe tipurile comune", () => {
  const d = citit(buildClassicDesign(ctx()));
  const cuOchi = schimbaBlocurile(d, d.product.page.id, (b, s) => comutaBloc(b, s, "beneficii"));
  const detaliat = citit(updateSection(cuOchi, d.product.page.id, { variant: "detailed" }));
  const lista = detaliat.product.page.blocks!;
  assert.deepEqual([...new Set(tipuri(lista))].sort(), Object.keys(DETALIAT.tipuri).sort());
  assert.equal(lista.find((b) => b.type === "beneficii")?.enabled, true, "ochiul de pe Clasic ramane");
  assert.ok(!lista.some((b) => b.type === "insigna"), "tipurile doar din Clasic ies");
});
