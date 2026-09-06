import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildCatalogItems,
  lasateAfaraDinCatalog,
  motivulLipseiDinCatalog,
  type CatalogBusiness,
  type CatalogProduct,
} from "./catalog-feed";
import { MOTIVE_LASATE_AFARA } from "./lasate-afara";
import { slimPageSections } from "@/lib/storefront/catalog-slim";

/**
 * Comerciantul afla CE produse raman afara din catalogul Meta, si de ce.
 *
 * ═══ ⚠ DE CE E O PROBLEMA DE BANI, NU DE DATE ═══
 *
 * Feedul sare produse in tacere, iar panoul spunea doar „N produse active in magazin. Feed-ul se
 * actualizeaza automat" — deci comerciantul crede ca pleaca toate. Un produs lipsa dintr-un catalog
 * nu da nicio eroare nicaieri: nu apare in reclame, nu se vinde, si singurul semn e o cifra care nu
 * vine.
 *
 * ⚠ CE APARA PROBELE DE MAI JOS, IN ORDINEA IMPORTANTEI:
 *
 *  1. Lista aratata pe ecran si ce sare generatorul sunt ACELASI lucru, in amandoua directiile. O a
 *     doua lista de motive, scrisa pentru panou, s-ar fi departat la prima schimbare — si atunci
 *     ecranul ar fi mintit cu incredere, ceea ce e mai rau decat sa nu spuna nimic.
 *  2. Produsul VECHI personalizabil FARA pret ramane in feed si NU apare in lista. Sunt 29 in
 *     productie, in 4 magazine, si se vand corect azi.
 *  3. Cand un produs are amandoua problemele, i se spune cea care chiar il opreste.
 */

const RAD = process.cwd();

/** ⚠ Terminatiile se normalizeaza: repo-ul are si fisiere CRLF. */
function sursa(relativ: string): string {
  return readFileSync(path.join(RAD, relativ), "utf8").replace(/\r\n/g, "\n");
}

/**
 * Sursa FARA comentarii.
 *
 * ⚠ Masurat in runda trecuta ca fel de proba slaba: o proba care cauta o secventa citata chiar in
 * comentariul de deasupra ei trece si dupa ce codul a disparut. Comentariile fisierelor de mai jos
 * spun cu vorbele lor exact ce cauta probele, deci se taie inainte de cautare.
 */
function codul(relativ: string): string {
  return sursa(relativ)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

const BUSINESS: CatalogBusiness = {
  slug: "exemplu",
  custom_domain: null,
  store_name: "Exemplu",
  business_name: "Exemplu SRL",
};

/** Cel VECHI: gravura si o poza, fara niciun pret. Asa arata toate cele 29 din productie. */
const VECHI = {
  customization: {
    enabled: true,
    fields: [
      { id: "nume", type: "text", label: "Nume gravat", required: true, max_length: 20 },
      { id: "poza", type: "image", label: "Poza", required: false },
    ],
  },
};

/** Fototapetul: 89 in catalog, dar catalogul nu se incaseaza. Nimeni nu plateste 89. */
const FOTOTAPET = {
  customization: {
    enabled: true,
    fields: [
      { id: "dim", type: "dimensiuni", label: "Dimensiuni", required: true, unitate: "cm",
        latime: { min: 100, max: 500 }, inaltime: { min: 70, max: 350 } },
      { id: "mat", type: "butoane", label: "Material", required: true,
        optiuni: [
          { id: "std", eticheta: "Standard", impact: { fel: "pe_m2", suma: 69 } },
          { id: "prm", eticheta: "Premium", impact: { fel: "pe_m2", suma: 89 } },
        ] },
    ],
    pret: { fel: "suprafata", campDimensiuni: "dim", tarif: 69, campTarif: "mat",
      includePretulProdusului: false },
  },
};

const VARIANTE = {
  variants: {
    enabled: true,
    options: [{ id: "culoare", name: "Culoare", values: ["Alb", "Negru"] }],
    combinations: [
      { id: "alb", title: "Alb", price: "", compare_at_price: "", sku: "", stock_quantity: "", image: "", enabled: true },
      { id: "negru", title: "Negru", price: "129", compare_at_price: "", sku: "", stock_quantity: "", image: "", enabled: true },
    ],
  },
};

function produs(id: string, patch: Partial<CatalogProduct>): CatalogProduct {
  return {
    id,
    name: `Produsul ${id}`,
    slug: id,
    description: "Descriere",
    price: 89,
    compare_at_price: null,
    images: ["https://exemplu.ro/a.jpg"],
    category: null,
    track_inventory: false,
    stock_quantity: null,
    ...patch,
  };
}

/*
 * Corpusul, cu ce se asteapta de la fiecare. „afara" e ce face GENERATORUL, si tot el e adevarul cu
 * care se compara motivele.
 */
const CORPUS: { produs: CatalogProduct; afara: boolean; motiv: string | null }[] = [
  { produs: produs("simplu", {}), afara: false, motiv: null },
  { produs: produs("vechi", { page_sections: VECHI }), afara: false, motiv: null },
  { produs: produs("vechi-fara-poza", { page_sections: VECHI, images: [] }), afara: true, motiv: "fara-imagine" },
  { produs: produs("fototapet", { page_sections: FOTOTAPET }), afara: true, motiv: "pret-care-minte" },
  /* ⚠ Amandoua problemele: raspunsul e cel care chiar il opreste, nu cel mai usor de reparat. */
  { produs: produs("fototapet-fara-poza", { page_sections: FOTOTAPET, images: null }), afara: true, motiv: "pret-care-minte" },
  /* Tablou de poze GOALE: generatorul le filtreaza, deci produsul ar pleca fara imagine — si nu pleaca. */
  { produs: produs("poze-goale", { images: ["", ""] }), afara: true, motiv: "fara-imagine" },
  /*
   * ⚠ Un `null` in tablou devine sirul „null" si CHIAR pleaca asa in feed. Nu se repara aici:
   * motivul trebuie sa spuna ce face generatorul, nu ce ar fi frumos sa faca.
   */
  { produs: produs("poza-null", { images: [null, "https://exemplu.ro/b.jpg"] }), afara: false, motiv: null },
  /*
   * ⚠ SINGURA poza e un `null`, si produsul TOT pleaca — asta e ramura, cea de deasupra e doar o
   * variabila (mai are o poza buna dupa `null`, deci trece si daca `null`-ul ar fi aruncat).
   * Randul asta ingheata iesirea de AZI a rutei publice: cine „repara" `primaImagine` sa sara
   * peste ce nu e sir scoate tacut din feed produsele cu poze stricate, si aici afla.
   */
  { produs: produs("poza-doar-null", { images: [null] }), afara: false, motiv: null },
  { produs: produs("imagini-nu-tablou", { images: null }), afara: true, motiv: "fara-imagine" },
  { produs: produs("variante", { page_sections: VARIANTE }), afara: false, motiv: null },
  { produs: produs("variante-fara-poza", { page_sections: VARIANTE, images: [] }), afara: true, motiv: "fara-imagine" },
  /*
   * ⚠ Pretul ZERO pleaca azi in feed, ca „0.00 RON". Nu e o scapare a probei: lista de motive spune
   * ce face generatorul ASTAZI. Cine adauga in generator o poarta pe pretul lipsa fara sa-i dea si
   * un motiv, pica aici — exact despartirea impotriva careia e scris fisierul.
   */
  { produs: produs("pret-zero", { price: 0 }), afara: false, motiv: null },
  { produs: produs("slimuit", { page_sections: slimPageSections(FOTOTAPET) }), afara: true, motiv: "pret-care-minte" },
];

test("⚠ ce sare generatorul si ce arata panoul sunt acelasi lucru, in amandoua directiile", () => {
  for (const { produs: p, afara, motiv } of CORPUS) {
    const articole = buildCatalogItems(BUSINESS, p);
    const gasit = motivulLipseiDinCatalog(p);
    assert.equal(articole.length === 0, afara, `${p.id}: generatorul nu face ce zice corpusul`);
    /* Directia grea: un produs sarit de generator TREBUIE sa aiba motiv, si invers. */
    assert.equal(
      gasit !== null,
      articole.length === 0,
      `${p.id}: generatorul si motivul nu spun acelasi lucru`,
    );
    assert.equal(gasit, motiv, `${p.id}: alt motiv decat cel adevarat`);
  }
});

test("⚠ lista panoului e chiar multimea sarita de generator", () => {
  const { total, produse } = lasateAfaraDinCatalog(CORPUS.map((c) => c.produs), 100);
  const sarite = CORPUS
    .filter((c) => buildCatalogItems(BUSINESS, c.produs).length === 0)
    .map((c) => c.produs.id);

  assert.ok(sarite.length > 0, "corpusul nu mai are niciun produs sarit");
  assert.equal(total, sarite.length);
  assert.deepEqual(produse.map((p) => p.id), sarite, "lista aratata difera de ce sare generatorul");
  /* Numele merge mai departe: fara el, ecranul ar arata identificatori. */
  assert.deepEqual(
    produse.find((p) => p.id === "fototapet"),
    { id: "fototapet", name: "Produsul fototapet", motiv: "pret-care-minte" },
  );
});

test("⚠ produsul VECHI personalizabil FARA pret ramane in feed si NU apare in lista", () => {
  /*
   * ⚠ ASTA E PROBA CARE APARA PRODUCTIA. 29 de produse in 4 magazine, cu text, textarea si image,
   * fara niciun pret pe camp. Un panou care le-ar arata drept „lasate afara" ar trimite
   * comerciantul sa repare ceva ce nu e stricat.
   */
  const p = produs("vechi", { page_sections: VECHI });
  assert.equal(motivulLipseiDinCatalog(p), null);
  assert.equal(buildCatalogItems(BUSINESS, p).length, 1, "produsul vechi a disparut din feed");

  const { total, produse } = lasateAfaraDinCatalog([p], 10);
  assert.equal(total, 0);
  assert.deepEqual(produse, []);
});

test("⚠ totalul se numara pe TOATE, nu doar pe cele aratate", () => {
  /*
   * „2 produse" fiindca atatea incap pe ecran ar fi o minciuna linistitoare: comerciantul ar repara
   * doua si ar crede ca a terminat.
   */
  const multe = Array.from({ length: 7 }, (_, i) => produs(`fara-poza-${i}`, { images: [] }));
  const { total, produse } = lasateAfaraDinCatalog(multe, 3);
  assert.equal(total, 7);
  assert.equal(produse.length, 3);
  assert.deepEqual(produse.map((p) => p.id), ["fara-poza-0", "fara-poza-1", "fara-poza-2"]);
});

test("⚠ fiecare motiv are eticheta si explicatia lui, si sunt doua lucruri diferite", () => {
  for (const { produs: p, motiv } of CORPUS) {
    if (!motiv) continue;
    const text = MOTIVE_LASATE_AFARA[motiv as keyof typeof MOTIVE_LASATE_AFARA];
    assert.ok(text, `${p.id}: motiv fara text pentru comerciant`);
    /* Explicatia spune ce se intampla cu produsul, nu doar cum se numeste problema. */
    assert.ok(text.explicatie.length > text.eticheta.length, `${motiv}: explicatia nu explica nimic`);
  }
});

/* ══════════════════════════════════════════════════════════════════════════
   CAPATUL SI ECRANUL — apara ce nu se poate apara altfel (nu exista jsdom)
   ══════════════════════════════════════════════════════════════════════════ */

test("⚠ capatul citeste TOT catalogul, si aceleasi produse ca feedul", () => {
  const s = codul("src/lib/actions/facebook-feeds.actions.ts");
  const i = s.indexOf("export async function produseleLasateAfaraDinCatalog");
  assert.ok(i > 0, "capatul pentru panou a disparut");
  /* ⚠ Felia se opreste la urmatoarea functie: altfel proba ar putea trece pe codul vecinului. */
  const urmatoarea = s.indexOf("export async function", i + 30);
  const corp = s.slice(i, urmatoarea === -1 ? undefined : urmatoarea);

  /* Fiecare export dintr-un fisier `"use server"` e un endpoint: isi verifica singur omul. */
  assert.match(corp, /magazinulMeu\(\)/, "capatul nu mai verifica cine intreaba");
  assert.match(corp, /"Neautorizat"/);
  /*
   * ⚠ PostgREST taie tacut la 1000 de randuri. Cu o citire obisnuita, un magazin de 1200 de produse
   * ar fi primit un numar mai mic decat adevarul — adica exact tacerea pe care ecranul o repara.
   */
  assert.match(corp, /fetchAllRowsStrict\(/, "numarul poate fi taiat tacut la 1000 de randuri");
  /*
   * ⚠ Citirea foloseste clientul ADMIN, care trece peste RLS: filtrul pe magazin e SINGURA granita
   * dintre comercianti. Scos, capatul ar numara si ar NUMI produsele tuturor magazinelor, si
   * niciuna dintre celelalte probe n-ar simti nimic — masurat, ca mutant.
   */
  assert.match(corp, /\.eq\("business_id", biz\.id\)/, "capatul citeste si din alte magazine");
  /* Aceleasi produse ca ruta feedului: altfel numarul si feedul vorbesc despre doua magazine. */
  assert.match(corp, /\.eq\("is_active", true\)/);
  /* Motivele vin de la hotararea generatorului, nu dintr-o a doua lista scrisa pentru ecran. */
  assert.match(corp, /lasateAfaraDinCatalog\(/, "capatul si-a facut propria socoteala");
});

test("⚠ cand nu ramane nimic afara, ecranul nu spune nimic", () => {
  const s = codul("src/components/dashboard/FacebookCatalogClient.tsx");
  const i = s.indexOf("function LasateAfara");
  assert.ok(i > 0, "randul din panou a disparut");
  /*
   * ⚠ Felia se opreste la urmatoarea functie de nivel intai, ca la capat. `LasateAfara` e azi
   * ultima din fisier, deci pana la sfarsit ar fi acelasi text — dar prima componenta adaugata
   * dupa ea ar fi putut satisface singura probele de mai jos, si atunci ele n-ar mai fi aparat
   * nimic. Felia care se scurge in functia urmatoare e chiar felul de proba slaba masurat in runda
   * trecuta.
   */
  const urmatoarea = s.slice(i + 20).search(/\n(?:export )?function /);
  const corp = urmatoarea === -1 ? s.slice(i) : s.slice(i, i + 20 + urmatoarea);

  assert.match(corp, /produseleLasateAfaraDinCatalog\(\)/, "panoul nu mai intreaba nimic");
  /*
   * ⚠ O actiune de server nu intoarce mereu `{ error }`: cand cade reteaua sau adresa actiunii nu
   * mai exista dupa o livrare, promisiunea se RESPINGE. Fara `.catch`, starea ramanea `null` si
   * randul disparea de tot — tacerea care se citeste „pleaca toate".
   */
  assert.match(corp, /\.catch\(/, "cererea cazuta lasa panoul fara nicio linie");
  /*
   * ⚠ Un panou care striga si cand totul e in regula se invata pe dinafara si se sare cu ochii.
   * Zero produse afara = niciun rand.
   */
  assert.match(corp, /if \(raspuns\.total === 0\) return null;/, "panoul striga si cand n-are ce spune");
  /* O citire cazuta se SPUNE: tacerea de acolo s-ar citi ca „pleaca toate". */
  assert.match(corp, /if \("error" in raspuns\)/, "citirea cazuta arata la fel cu „nimic afara");
  /* Motivul se arata cu vorbele lui, nu cu cheia din cod. */
  assert.match(corp, /MOTIVE_LASATE_AFARA\[g\.motiv\]\.explicatie/);
});
