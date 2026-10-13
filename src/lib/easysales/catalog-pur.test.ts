import { test } from "node:test";
import assert from "node:assert/strict";
import {
  caileCategoriilor, categoriileDeTrimis, NUME_CATEGORIE_MAXIM, rezolvitorDeCategorii, type CategorieEdinio,
} from "./mapare-categorii";
import { caracteristicileArticolului, cheiaCaracteristicii } from "./mapare-caracteristici";
import {
  hotarareaProdusului, raportulDePregatire, setarileCatalogului, skuDuplicateleMagazinului,
  type ContextEligibilitate, type ProdusCatalog,
} from "./eligibilitate";
import { amprentaContinutului, corpulProdusului, preturileArticolului, type IntrareCorp } from "./mapare-produs";
import { parseVariants, type VariantCombo } from "@/lib/storefront/variants";
import { CATEGORIA_DE_REZERVA, CHEIE_CATEGORIE_DE_REZERVA } from "./constante";

/*
 * ═══ CATALOGUL, PE VALORI ═══
 *
 * Categoriile, caracteristicile, hotararea „pleaca sau nu" si corpul trimis, fara retea si fara baza.
 * Lucratorul (`catalog.ts`) se proba separat, pe DEMO, cu baza adevarata si cu serverul fals.
 */

/* ─── Categoriile ─────────────────────────────────────────────────────────── */

const CAT: CategorieEdinio[] = [
  { id: "a", name: "Femei", parent_id: null },
  { id: "b", name: "Rochii", parent_id: "a" },
  { id: "c", name: "De seară", parent_id: "b" },
  { id: "d", name: "Pantofi", parent_id: "a" },
  { id: "e", name: "Pantofi", parent_id: null },
];

test("categoriile pleaca cu calea intreaga, iar doua „Pantofi” din ramuri diferite raman deosebite", () => {
  const cai = caileCategoriilor(CAT);
  assert.equal(cai.get("a"), "Femei");
  assert.equal(cai.get("b"), "Femei > Rochii");
  assert.equal(cai.get("c"), "Femei > Rochii > De seară");
  assert.equal(cai.get("d"), "Femei > Pantofi");
  assert.equal(cai.get("e"), "Pantofi");
});

test("un ciclu sau un parinte lipsa nu blocheaza arborele", () => {
  const cai = caileCategoriilor([
    { id: "x", name: "X", parent_id: "y" }, { id: "y", name: "Y", parent_id: "x" },
    { id: "z", name: "Z", parent_id: "nu-exista" },
  ]);
  assert.equal(cai.get("x"), "Y > X");
  assert.equal(cai.get("y"), "X > Y");
  assert.equal(cai.get("z"), "Z");
});

test("o cale prea lunga se taie de la stanga, iar frunza ramane intreaga", () => {
  const lung = Array.from({ length: 30 }, (_, i) => ({ id: `n${i}`, name: `Categoria numarul ${i}`, parent_id: i ? `n${i - 1}` : null }));
  const cale = caileCategoriilor(lung).get("n29")!;
  assert.ok(cale.length <= NUME_CATEGORIE_MAXIM);
  assert.ok(cale.startsWith("..."));
  assert.ok(cale.endsWith("Categoria numarul 29"));
});

test("potrivirea dupa nume e unica sau nu e: ambigua, orfana si lipsa merg in rezerva", () => {
  const r = rezolvitorDeCategorii(CAT);
  assert.deepEqual(r("Rochii"), { fel: "gasita", cheie: "b" });
  assert.deepEqual(r("  Rochii "), { fel: "gasita", cheie: "b" });
  assert.deepEqual(r("Pantofi"), { fel: "rezerva", motiv: "ambigua" });
  assert.deepEqual(r("Genti"), { fel: "rezerva", motiv: "orfana" });
  assert.deepEqual(r(null), { fel: "rezerva", motiv: "lipsa" });
  assert.deepEqual(r("   "), { fel: "rezerva", motiv: "lipsa" });
});

test("categoria de rezerva pleaca si ea, o singura data", () => {
  const toate = categoriileDeTrimis([...CAT, { id: "gol", name: "  ", parent_id: null }]);
  assert.equal(toate.filter((c) => c.cheie === CHEIE_CATEGORIE_DE_REZERVA).length, 1);
  assert.equal(toate.find((c) => c.cheie === CHEIE_CATEGORIE_DE_REZERVA)!.nume, CATEGORIA_DE_REZERVA);
  assert.ok(!toate.some((c) => c.cheie === "gol"), "categoria fara nume nu pleaca");
  assert.equal(toate.length, CAT.length + 1);
});

/* ─── Caracteristicile ────────────────────────────────────────────────────── */

const PS_VARIANTE = {
  variants: {
    enabled: true,
    options: [{ id: "o1", name: "Culoare", values: ["Alb", "Alb / Crem", "Negru"] }, { id: "o2", name: "Mărime", values: ["M", "XL"] }],
    combinations: [
      { id: "1", uid: "aaaaaaaaaaaaaaa1", title: "Alb / Crem / XL", price: "", compare_at_price: "", sku: "C-ALBC-XL", stock_quantity: "3", image: "", enabled: true },
      { id: "2", uid: "aaaaaaaaaaaaaaa2", title: "Negru / M", price: "120", compare_at_price: "150", sku: "C-NEG-M", stock_quantity: "0", image: "https://x/n.jpg", enabled: true },
    ],
  },
  specifications: [{ label: "MARIME", value: "S-XL" }, { label: "Material", value: "Bumbac" }, { label: "", value: "x" }],
  google: { gender: "female", color: "Alb", material: "Lână" },
};

test("valoarea combinatiei se desparte pe valorile declarate, nu pe separator", () => {
  const v = parseVariants(PS_VARIANTE)!;
  const { caracteristici, axeNedespartite } = caracteristicileArticolului(PS_VARIANTE, v, v.combinations[0]);
  assert.equal(axeNedespartite, false);
  const dupa = Object.fromEntries(caracteristici.map((c) => [c.cheie, c.valoare]));
  assert.equal(dupa.culoare, "Alb / Crem");
  assert.equal(dupa.marime, "XL", "axa bate specificatia „MARIME: S-XL”");
  assert.equal(dupa.material, "Bumbac", "specificatia bate atributul Google");
  assert.equal(dupa.gen, "Femei", "codul Google se traduce");
  assert.equal(caracteristici.filter((c) => c.cheie === "marime").length, 1);
});

test("cheia se normalizeaza: „Mărime ” si „MARIME” sunt aceeasi caracteristica", () => {
  assert.equal(cheiaCaracteristicii("Mărime "), cheiaCaracteristicii("MARIME"));
  assert.equal(cheiaCaracteristicii("Culoare  principală"), "culoare principala");
});

test("un titlu care nu se poate desparti lasa axele afara si spune asta", () => {
  const v = parseVariants(PS_VARIANTE)!;
  const strain = { ...v.combinations[0], title: "Verde / XXL" };
  const r = caracteristicileArticolului(PS_VARIANTE, v, strain);
  assert.equal(r.axeNedespartite, true);
  assert.ok(!r.caracteristici.some((c) => c.cheie === "culoare" && c.valoare.startsWith("Verde")));
});

test("o singura axa: valoarea e chiar titlul, oricate separatoare ar avea", () => {
  const ps = { variants: { enabled: true, options: [{ id: "o", name: "Model", values: ["A / B"] }], combinations: [] } };
  const v = parseVariants(ps)!;
  const r = caracteristicileArticolului(ps, v, { id: "1", title: "A / B", price: "", compare_at_price: "", sku: "", stock_quantity: "1", image: "", enabled: true });
  assert.deepEqual(r.caracteristici.map((c) => [c.nume, c.valoare]), [["Model", "A / B"]]);
});

/* ─── Eligibilitatea ──────────────────────────────────────────────────────── */

const SETARI = setarileCatalogului({});
const CTX: ContextEligibilitate = { setari: SETARI, skuDuplicate: new Set() };

function produs(p: Partial<ProdusCatalog> = {}): ProdusCatalog {
  return {
    id: "11111111-1111-4111-8111-111111111111", name: "Cana albă", slug: "cana-alba", description: "<p>O cană.</p>",
    price: 100, compare_at_price: null, sku: "CANA-1", images: ["https://x/a.jpg"], category: "Bucătărie",
    track_inventory: true, stock_quantity: 5, weight_grams: 250, page_sections: {}, is_active: true, is_bundle: false,
    ...p,
  };
}

test("setarile lipsa sunt hotararile recomandate din plan", () => {
  assert.deepEqual(SETARI, { skuGenerat: true, descriereDinNume: false, stocFix: null, arhivareLaStergere: true, combinatieScoasa: "stoc_zero", termenZile: null });
  const ciudate = setarileCatalogului({ catalog_stoc_fix: -3, catalog_termen_zile: 2.5, catalog_combinatie_scoasa: "altceva" as never });
  assert.equal(ciudate.stocFix, null);
  assert.equal(ciudate.termenZile, null);
  assert.equal(ciudate.combinatieScoasa, "stoc_zero");
  assert.equal(setarileCatalogului({ catalog_stoc_fix: 100, catalog_sku_generat: false }).stocFix, 100);
});

test("produsul simplu, cu tot ce trebuie, pleaca cu SKU-ul lui", () => {
  const h = hotarareaProdusului(produs(), CTX);
  assert.equal(h.exclus, false);
  assert.equal(h.segment, "simplu");
  assert.equal(h.articole.length, 1);
  assert.equal(h.articole[0].eligibil, true);
  assert.equal(h.articole[0].sku, "CANA-1");
  assert.equal(h.articole[0].fel, "simple");
  assert.equal(h.articole[0].identitate, "");
});

test("ce opreste produsul intreg: inactiv, pachet, personalizare, fara nume", () => {
  const coduri = (p: Partial<ProdusCatalog>) => hotarareaProdusului(produs(p), CTX).motive.filter((m) => m.nivel === "blocheaza").map((m) => m.cod);
  assert.deepEqual(coduri({ is_active: false }), ["inactiv"]);
  assert.deepEqual(coduri({ is_bundle: true }), ["pachet"]);
  assert.deepEqual(coduri({ name: "  " }), ["fara-nume"]);
  assert.deepEqual(coduri({
    page_sections: { customization: { enabled: true, fields: [{ id: "f1", type: "text", label: "Nume gravat", required: true, max_length: 20 }] } },
  }), ["personalizat"]);
  /* O personalizare goala (49 de produse in productie) nu e personalizare. */
  assert.deepEqual(coduri({ page_sections: { customization: { enabled: true, fields: [] } } }), []);
  for (const p of [{ is_active: false }, { is_bundle: true }]) {
    const h = hotarareaProdusului(produs(p), CTX);
    assert.equal(h.exclus, true);
    assert.ok(h.articole.every((a) => !a.eligibil));
  }
});

test("descrierea lipsa blocheaza (D10), iar setarea o ia din nume; un `<p></p>` nu e o descriere", () => {
  for (const d of [null, "", "<p></p>", "<p>&nbsp;</p>", "  "]) {
    const h = hotarareaProdusului(produs({ description: d }), CTX);
    assert.ok(h.motive.some((m) => m.cod === "fara-descriere" && m.nivel === "blocheaza"), `descrierea ${JSON.stringify(d)}`);
  }
  const cuSetare = hotarareaProdusului(produs({ description: null }), { ...CTX, setari: { ...SETARI, descriereDinNume: true } });
  assert.equal(cuSetare.exclus, false);
  assert.ok(cuSetare.motive.some((m) => m.cod === "descriere-din-nume" && m.nivel === "avertisment"));
});

test("stocul neurmarit blocheaza fara stoc fix (D9) si trece cu stoc fix", () => {
  assert.equal(hotarareaProdusului(produs({ track_inventory: false }), CTX).exclus, true);
  const fix = hotarareaProdusului(produs({ track_inventory: false }), { ...CTX, setari: { ...SETARI, stocFix: 100 } });
  assert.equal(fix.exclus, false);
  assert.ok(fix.motive.some((m) => m.cod === "stoc-fix"));
});

test("SKU: propriu, generat (D8), oprit cand generarea e stinsa, duplicat, inghetat", () => {
  const fara = hotarareaProdusului(produs({ sku: "  " }), CTX).articole[0];
  assert.equal(fara.eligibil, true);
  assert.equal(fara.sku, null, "null = se genereaza la alocare");
  assert.ok(fara.motive.some((m) => m.cod === "sku-generat"));
  const stins = hotarareaProdusului(produs({ sku: null }), { ...CTX, setari: { ...SETARI, skuGenerat: false } }).articole[0];
  assert.equal(stins.eligibil, false);
  assert.ok(stins.motive.some((m) => m.cod === "fara-sku"));
  const dublu = hotarareaProdusului(produs({ sku: "cana-1" }), { ...CTX, skuDuplicate: new Set(["cana-1"]) }).articole[0];
  assert.equal(dublu.eligibil, false);
  assert.ok(dublu.motive.some((m) => m.cod === "sku-duplicat"));
  /* Inghetat: a plecat deja cu SKU-ul asta, deci regula noua nu-l mai opreste. */
  const inghetat = hotarareaProdusului(produs({ sku: "cana-1" }), {
    ...CTX, skuDuplicate: new Set(["cana-1"]), skuInghetat: () => "CANA-1",
  }).articole[0];
  assert.equal(inghetat.eligibil, true);
  assert.equal(inghetat.sku, "CANA-1");
});

test("pretul 0 opreste articolul; pretul vechi se ia numai cand e peste pret", () => {
  assert.equal(hotarareaProdusului(produs({ price: 0 }), CTX).articole[0].eligibil, false);
  assert.equal(hotarareaProdusului(produs({ compare_at_price: 150 }), CTX).articole[0].pretVechi, 150);
  assert.equal(hotarareaProdusului(produs({ compare_at_price: 100 }), CTX).articole[0].pretVechi, null);
  assert.equal(hotarareaProdusului(produs({ compare_at_price: 80 }), CTX).articole[0].pretVechi, null);
});

test("EAN-ul invalid pleaca afara, cu avertisment; produsul pleaca", () => {
  const a = hotarareaProdusului(produs({ page_sections: { google: { gtin: "1234567890123" } } }), CTX).articole[0];
  assert.equal(a.ean, null);
  assert.equal(a.eligibil, true);
  assert.ok(a.motive.some((m) => m.cod === "ean-invalid"));
  const bun = hotarareaProdusului(produs({ page_sections: { google: { gtin: "5901234123457" } } }), CTX).articole[0];
  assert.equal(bun.ean, "5901234123457");
});

test("variantele: fiecare combinatie activa e un articol `complex`, cu identitatea `uid`-ului", () => {
  const h = hotarareaProdusului(produs({ sku: "CANA", page_sections: PS_VARIANTE }), CTX);
  assert.equal(h.segment, "variante");
  assert.deepEqual(h.articole.map((a) => [a.fel, a.identitate, a.sku, a.pret, a.pretVechi, a.eligibil]), [
    ["complex", "aaaaaaaaaaaaaaa1", "C-ALBC-XL", 100, null, true],
    ["complex", "aaaaaaaaaaaaaaa2", "C-NEG-M", 120, 150, true],
  ]);
});

function cuCombinatii(combinatii: Partial<VariantCombo>[], p: Partial<ProdusCatalog> = {}): ProdusCatalog {
  return produs({
    sku: "PARINTE",
    ...p,
    page_sections: {
      variants: {
        enabled: true,
        options: [{ id: "o", name: "Mărime", values: ["S", "M", "L"] }],
        combinations: combinatii.map((c, i) => ({ id: String(i), title: "S", price: "", compare_at_price: "", sku: `V${i}`, stock_quantity: "2", image: "", enabled: true, ...c })),
      },
    },
  });
}

test("SKU-ul parintelui pe combinatie si stocul comun opresc varianta, nu produsul", () => {
  const h = hotarareaProdusului(cuCombinatii([
    { title: "S", sku: "parinte" },
    { title: "M", stock_quantity: "" },
    { title: "L" },
  ]), CTX);
  const dupa = Object.fromEntries(h.articole.map((a) => [a.titlu, a]));
  assert.ok(dupa.S.motive.some((m) => m.cod === "sku-parinte"));
  assert.ok(dupa.M.motive.some((m) => m.cod === "stoc-comun"));
  assert.equal(dupa.L.eligibil, true);
  assert.equal(h.exclus, false);
  /* Fara evidenta, cu stoc fix: stocul comun nu mai e o problema. */
  const fix = hotarareaProdusului(cuCombinatii([{ title: "M", stock_quantity: "" }], { track_inventory: false }), { ...CTX, setari: { ...SETARI, stocFix: 10 } });
  assert.equal(fix.articole[0].eligibil, true);
});

test("acelasi EAN pe doua variante: niciuna nu-l trimite", () => {
  const h = hotarareaProdusului(cuCombinatii([{ title: "S", gtin: "5901234123457" }, { title: "M", gtin: "5901234123457" }, { title: "L", gtin: "4006381333931" }]), CTX);
  assert.deepEqual(h.articole.map((a) => a.ean), [null, null, "4006381333931"]);
  assert.ok(h.articole[0].motive.some((m) => m.cod === "ean-dublat"));
});

test("doua combinatii cu acelasi `uid`: a doua se opreste, cu numele amandurora", () => {
  const h = hotarareaProdusului(cuCombinatii([{ title: "S", uid: "bbbbbbbbbbbbbbb1" }, { title: "M", uid: "bbbbbbbbbbbbbbb1" }]), CTX);
  assert.equal(h.articole[0].eligibil, true);
  assert.equal(h.articole[1].eligibil, false);
  assert.match(h.articole[1].motive.find((m) => m.cod === "identitate-dubla")!.mesaj, /„S” și „M”/);
});

test("variante fara nicio combinatie activa: produsul nu pleaca", () => {
  const h = hotarareaProdusului(cuCombinatii([{ title: "S", enabled: false }]), CTX);
  assert.equal(h.exclus, true);
  assert.ok(h.motive.some((m) => m.cod === "fara-combinatii"));
});

test("SKU-urile duplicate se numara pe unitatile vandabile, fara majuscule", () => {
  const set = skuDuplicateleMagazinului([
    produs({ sku: "A-1" }),
    produs({ sku: "a-1 " }),
    produs({ sku: "B", is_active: false }),
    produs({ sku: "B" }),
    produs({ sku: "C", is_bundle: true }),
    produs({ sku: "C" }),
    cuCombinatii([{ title: "S", sku: "PARINTE" }, { title: "M", sku: "D" }], { sku: "PARINTE" }),
    produs({ sku: "d" }),
  ]);
  assert.deepEqual([...set].sort(), ["a-1", "d"]);
});

test("raportul de pregatire: pe segmente si pe motive, cu exemple, blocajele intai", () => {
  const r = raportulDePregatire([
    { h: hotarareaProdusului(produs(), CTX), nume: "Cana" },
    { h: hotarareaProdusului(produs({ description: null, id: "22222222-2222-4222-8222-222222222222" }), CTX), nume: "Fara descriere" },
    { h: hotarareaProdusului(cuCombinatii([{ title: "S" }, { title: "M", stock_quantity: "" }], { id: "33333333-3333-4333-8333-333333333333" }), CTX), nume: "Tricou" },
    { h: hotarareaProdusului(produs({ sku: null, id: "44444444-4444-4444-8444-444444444444" }), CTX), nume: "Fara SKU" },
  ]);
  assert.equal(r.produse, 4);
  assert.equal(r.produseCuVariante, 1);
  assert.deepEqual(r.articole, { simple: 3, variante: 2, gataSimple: 2, gataVariante: 1 });
  assert.equal(r.motive[0].nivel, "blocheaza");
  const dupa = Object.fromEntries(r.motive.map((m) => [m.cod, m]));
  assert.equal(dupa["fara-descriere"].produse, 1);
  assert.equal(dupa["stoc-comun"].articole, 1);
  assert.equal(dupa["sku-generat"].nivel, "avertisment");
  assert.equal(dupa["stoc-comun"].exemple[0].titlu, "M");
});

/* ─── Corpul trimis ───────────────────────────────────────────────────────── */

function intrare(p: ProdusCatalog, i = 0, x: Partial<IntrareCorp> = {}): IntrareCorp {
  const h = hotarareaProdusului(p, CTX);
  const a = h.articole[i];
  return {
    produs: p, articol: a, productWebsiteId: 1_000_000_123, sku: a.sku ?? "EDN-GENERAT", parinteId: a.fel === "complex" ? 1_000_000_100 : null,
    magazin: { vat_enabled: true, vat_rate: 21, prices_include_vat: false }, baza: "https://magazin.ro", prefixProdus: "produs",
    categorii: [1_000_000_007], caracteristici: [{ id: 1_000_000_009, value: "Alb" }], imagini: ["https://x/a.jpg"], stoc: 0,
    preturi: preturileArticolului(a, { vat_enabled: true, vat_rate: 21, prices_include_vat: false }),
    termenZile: null, descriereDinNume: false, ...x,
  };
}

test("produsul simplu: pretul cu TVA, pretul vechi, cota, greutatea in kg, adresa", () => {
  const c = corpulProdusului(intrare(produs({ compare_at_price: 150 })));
  assert.deepEqual(
    { ...c, description: undefined },
    {
      product_website_id: 1_000_000_123, sku: "CANA-1", name: "Cana albă", type: "simple", description: undefined,
      sale_price: 121, full_price: 181.5, tax_rate: 21, stock: 0, images: ["https://x/a.jpg"], categories: [1_000_000_007],
      characteristics: [{ id: 1_000_000_009, value: "Alb" }], url: "https://magazin.ro/produs/cana-alba", weight: 0.25,
    },
  );
});

test("TVA-ul: preturi cu TVA nu se mai inmultesc; neplatitorul trimite cota 0", () => {
  const a = hotarareaProdusului(produs({ price: 19.99 }), CTX).articole[0];
  assert.deepEqual(preturileArticolului(a, { vat_enabled: true, vat_rate: 21, prices_include_vat: false }), { sale_price: 24.19, full_price: 24.19 });
  assert.deepEqual(preturileArticolului(a, { vat_enabled: true, vat_rate: 21, prices_include_vat: true }), { sale_price: 19.99, full_price: 19.99 });
  const neplatitor = corpulProdusului(intrare(produs(), 0, { magazin: { vat_enabled: false, vat_rate: 19, prices_include_vat: false } }));
  assert.equal(neplatitor.tax_rate, 0, "19 ramas implicit in setari nu pleaca la un neplatitor");
});

test("varianta: nume cu titlul, parintele, adresa care deschide combinatia, poza combinatiei intai", () => {
  const p = produs({ sku: "CANA", page_sections: PS_VARIANTE });
  const i = intrare(p, 1);
  const c = corpulProdusului({ ...i, imagini: ["https://x/n.jpg", "https://x/a.jpg"] });
  assert.equal(c.name, "Cana albă (Negru / M)");
  assert.equal(c.type, "complex");
  assert.equal(c.parent_id, 1_000_000_100);
  assert.equal(c.parent_name, "Cana albă");
  assert.equal(c.parent_url, "https://magazin.ro/produs/cana-alba");
  assert.equal(c.url, "https://magazin.ro/produs/cana-alba?varianta=aaaaaaaaaaaaaaa2");
  assert.equal(c.sale_price, 145.2);
  assert.equal(c.full_price, 181.5);
});

test("descrierea din nume se scapa de HTML; descrierea existenta pleaca neatinsa", () => {
  const p = produs({ name: "Cana <mare> & bună", description: null });
  assert.equal(corpulProdusului({ ...intrare(produs()), produs: p, descriereDinNume: true }).description, "<p>Cana &lt;mare&gt; &amp; bună</p>");
  assert.equal(corpulProdusului(intrare(produs())).description, "<p>O cană.</p>");
});

test("amprenta continutului nu se misca la pret sau la stoc, dar se misca la nume", () => {
  const baza = intrare(produs());
  const a0 = amprentaContinutului(corpulProdusului(baza));
  assert.equal(amprentaContinutului(corpulProdusului({ ...baza, stoc: 40, preturi: { sale_price: 999, full_price: 999 } })), a0);
  assert.notEqual(amprentaContinutului(corpulProdusului({ ...baza, produs: { ...baza.produs, name: "Alt nume" } })), a0);
  assert.notEqual(amprentaContinutului(corpulProdusului({ ...baza, baza: "https://alt-domeniu.ro" })), a0, "adresa face parte din continut");
  assert.match(a0, /^[0-9a-f]{32}$/);
});
