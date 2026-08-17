import assert from "node:assert/strict";
import { test } from "node:test";
import {
  atasezaPreturileRon, deriveVariantSlots, eanValid, regulaClustere, stocVarianta, validateListing,
  verificaSku,
  type AboutYouListingEnrichment, type AboutYouVariantData, type MappableProduct,
} from "./mapping";
import type { AboutYouConfig, AboutYouMaterialCluster } from "./types";

/**
 * Doua reguli care s-au dovedit usor de stricat, si scumpe cand se strica.
 *
 * STOCUL. `aboutyou_variants.quantity` e un instantaneu: se scrie o data, cand
 * comerciantul salveaza listarea, si nu se mai reimprospateaza niciodata. Daca
 * el bate stocul viu, impingerea de dupa fiecare comanda retrimite la nesfarsit
 * aceeasi valoare — se vand patru din zece si About You afla in continuare zece.
 * Adica supravanzare, pe comenzi pe care comerciantul nu le poate onora.
 *
 * PRETUL. Combinatiile din Edinio au pret propriu. Cat timp payload-ul lua
 * pretul de baza al produsului, un tricou cu marimea XXL la 170 de lei pleca la
 * pretul de 100 — iar editorul arata, in acelasi timp, 170. Ce vedea omul si ce
 * se trimitea erau doua lucruri diferite, fara nicio eroare intre ele.
 */
const produs = (over: Partial<MappableProduct> = {}): MappableProduct => ({
  id: "p1", name: "Tricou", description: null, price: 100, compare_at_price: null,
  images: ["https://x/1.jpg"], category: "Tricouri", sku: "TR-1", weight_grams: 300,
  track_inventory: false, stock_quantity: null, page_sections: null, ...over,
});

const combo = (over: Record<string, unknown> = {}) => ({
  id: "c1", title: "XXL", price: "170", compare_at_price: "", sku: "TR-1-XXL",
  stock_quantity: "", image: "", enabled: true, ...over,
});

const cuCombinatii = (combos: Record<string, unknown>[]) => ({
  variants: { enabled: true, options: [{ name: "Mărime", values: ["XXL"] }], combinations: combos },
});

const varianta = (sku: string, over: Partial<AboutYouVariantData> = {}): AboutYouVariantData => ({
  sku, ean: null, size_id: null, second_size_id: null, color_id: null, quantity: null,
  retail_price_eur: null, sale_price_eur: null, enabled: true, ...over,
});

test("stocul produsului urmarit e viu; al unuia neurmarit, nu", () => {
  assert.deepEqual(stocVarianta(produs({ track_inventory: true, stock_quantity: 6 }), null), { quantity: 6, viu: true });
  assert.deepEqual(stocVarianta(produs(), null), { quantity: 100, viu: false });
});

test("stocul viu bate numarul salvat in editor", () => {
  // Zece la salvare, patru vandute. Trebuie sa plece sase, nu zece.
  const p = produs({ track_inventory: true, stock_quantity: 6 });
  const [v] = atasezaPreturileRon(p, [varianta("TR-1", { quantity: 10 })]);
  assert.equal(v.quantity, 6);
});

test("fara sursa vie, numarul din editor ramane cel decisiv", () => {
  const [v] = atasezaPreturileRon(produs(), [varianta("TR-1", { quantity: 7 })]);
  assert.equal(v.quantity, 7);
});

test("stocul combinatiei bate si produsul, si editorul", () => {
  const p = produs({
    track_inventory: true, stock_quantity: 99,
    page_sections: cuCombinatii([combo({ stock_quantity: "2" })]),
  });
  const [v] = atasezaPreturileRon(p, [varianta("TR-1-XXL", { quantity: 50 })]);
  assert.equal(v.quantity, 2);
});

test("fiecare varianta pleaca cu pretul EI, nu cu al produsului", () => {
  const p = produs({ page_sections: cuCombinatii([combo()]) });
  const [v] = atasezaPreturileRon(p, [varianta("TR-1-XXL")]);
  assert.equal(v.ron_price, 170);
});

test("combinatiile fara axe nu schimba SKU-urile", () => {
  // `parseVariants` cere si `options`. Fara caderea pe citirea directa, produsul
  // ar fi ajuns pe varianta unica („TR-1") si ar fi aparut ca produs NOU pe
  // About You, lasandu-l pe cel vechi acolo, orfan.
  const p = produs({ page_sections: { variants: { enabled: true, combinations: [combo()] } } });
  assert.deepEqual(deriveVariantSlots(p).map((s) => s.sku), ["TR-1-XXL"]);
});

test("codul de bare al produsului se preia automat cand nu are variante", () => {
  const p = produs({ page_sections: { google: { gtin: "4006381333900" } } });
  assert.equal(deriveVariantSlots(p)[0].gtin, "4006381333900");
});

test("SKU-ul se verifica local, in limitele schemei (3..120)", () => {
  assert.equal(verificaSku("TR-1"), null);
  assert.ok(verificaSku("ab"));
  assert.ok(verificaSku("x".repeat(121)));
});

test("EAN-13 se verifica pe cifra de control", () => {
  assert.ok(eanValid("4006381333900"));
  assert.ok(!eanValid("4006381333901"));   // cifra de control gresita
  assert.ok(!eanValid("400638133390"));    // 12 cifre
  assert.ok(!eanValid("40063813339OO"));   // litere
});

/*
 * ── Compozitia materialului ──────────────────────────────────────────────────
 *
 * Editorul stia sa emita O SINGURA grupa, iar documentatia About You cere doua
 * la gentile captusite si trei la incaltaminte. Cele 14 produse ale primului
 * comerciant real sunt genti, deci nu se puteau lista corect deloc.
 *
 * Regulile sunt transcrise din `user-guide/product-material.md`. Atentie la
 * cuvantul „lined": la genti si jachete cerinta e CONDITIONATA de captuseala,
 * deci acolo doar avertizam; la incaltaminte formularea e neconditionata.
 */
const CONFIG: AboutYouConfig = {
  brand_id: 7, ship_countries: ["IT"], price_mode: "fx_from_ron", fx: { rate: 5 },
  category_map: { Tricouri: { category_id: 42, label: "x" } },
};

const listare = (over: Partial<AboutYouListingEnrichment> = {}): AboutYouListingEnrichment => ({
  brand_id: 7, category_id: 42, color_id: 3, attributes: [], material_composition: null,
  country_of_origin: "RO", hs_code: null, ...over,
});

const material = (clusters: AboutYouMaterialCluster[]) => ({ type: "non-textile" as const, clusters });

const EAN_A = "4006381333900";
const EAN_B = "5901234123457";
const EAN_C = "0012345678905";

const verifica = (
  listingOver: Partial<AboutYouListingEnrichment>,
  cerinta: Parameters<typeof validateListing>[1],
  variante: AboutYouVariantData[] = [varianta("TR-1", { ean: EAN_A })],
) => validateListing({
  config: CONFIG,
  product: produs(),
  listing: listare(listingOver),
  variants: variante,
}, cerinta);

test("regula de grupe se ia din calea categoriei", () => {
  const pantofi = regulaClustere("Fashion|Men|Shoes|Trainers");
  assert.equal(pantofi.minim, 3);
  assert.equal(pantofi.blocheaza, true, "documentatia o cere neconditionat la incaltaminte");
  const genti = regulaClustere("Fashion|Women|Accessories|Bags & suitcases|Handbag");
  assert.equal(genti.minim, 2);
  assert.equal(genti.blocheaza, false, "geanta poate fi necaptusita, deci nu blocam");
  const jachete = regulaClustere("Fashion|Women|Clothing|Jackets & coats|Parka");
  assert.equal(jachete.minim, 2);
  assert.equal(jachete.blocheaza, false);
  assert.equal(regulaClustere("Fashion|Women|Accessories|Belts").minim, 1);
});

test("taxonomia necitita BLOCHEAZA, nu trece drept „nu cere material”", () => {
  // Inainte, orice esec de citire lasa tipul pe `null`, adica exact valoarea
  // care inseamna „categoria nu cere compozitie" — si produsul pleca gol.
  const r = verifica({}, { tip: null, path: null, necunoscut: true });
  assert.ok(r.issues.some((i) => i.includes("Nu am putut verifica")));
});

test("categoria care chiar nu cere material nu produce nicio problema", () => {
  const r = verifica({}, { tip: null, path: "Fashion|Women|Accessories|Belts" });
  assert.deepEqual(r.issues, []);
  assert.deepEqual(r.warnings, []);
});

test("geanta cu o singura grupa: avertisment, nu blocaj", () => {
  const cale = "Fashion|Women|Accessories|Bags & suitcases|Handbag";
  const r = verifica(
    { material_composition: material([{ cluster_id: 11, components: [{ material_id: 1 }] }]) },
    { tip: "non-textile", path: cale },
  );
  assert.deepEqual(r.issues, []);
  assert.equal(r.warnings.length, 1);
});

test("incaltamintea cu doua grupe in loc de trei se blocheaza", () => {
  const r = verifica(
    { material_composition: material([
      { cluster_id: 11, components: [{ material_id: 1 }] },
      { cluster_id: 12, components: [{ material_id: 2 }] },
    ]) },
    { tip: "non-textile", path: "Fashion|Men|Shoes|Boots" },
  );
  assert.ok(r.issues.some((i) => i.includes("trei grupe")));
});

test("procentele se socotesc PE FIECARE grupa, nu pe tot produsul", () => {
  // Exemplul oficial trimite Lining 100% si Material 100%, adica 200% la un loc.
  // O suma pe tot produsul ar fi respins fix exemplul lor.
  const r = verifica(
    { material_composition: { type: "textile", clusters: [
      { cluster_id: 11, components: [{ material_id: 1, fraction: 100 }] },
      { cluster_id: 12, components: [{ material_id: 2, fraction: 70 }, { material_id: 3, fraction: 30 }] },
    ] } },
    { tip: "textile", path: "Fashion|Women|Clothing|Dresses" },
  );
  assert.deepEqual(r.issues, []);
});

test("aceeasi grupa de doua ori, grupa goala si peste trei grupe sunt blocate", () => {
  const dubla = verifica(
    { material_composition: material([
      { cluster_id: 11, components: [{ material_id: 1 }] },
      { cluster_id: 11, components: [{ material_id: 2 }] },
    ]) },
    { tip: "non-textile", path: "Fashion|Women|Accessories|Belts" },
  );
  assert.ok(dubla.issues.some((i) => i.includes("de două ori")));

  const goala = verifica(
    { material_composition: material([{ cluster_id: 11, components: [] }]) },
    { tip: "non-textile", path: "Fashion|Women|Accessories|Belts" },
  );
  assert.ok(goala.issues.some((i) => i.includes("niciun material")));

  // Peste trei grupe e AVERTISMENT, nu blocaj: schema OpenAPI nu are `maxItems`
  // pe material_composition_*, plafonul e doar al sablonului lor Excel. Nu oprim
  // ce About You accepta.
  const prea = verifica(
    { material_composition: material([
      { cluster_id: 11, components: [{ material_id: 1 }] },
      { cluster_id: 12, components: [{ material_id: 2 }] },
      { cluster_id: 13, components: [{ material_id: 3 }] },
      { cluster_id: 14, components: [{ material_id: 4 }] },
    ]) },
    { tip: "non-textile", path: "Fashion|Men|Shoes|Boots" },
  );
  assert.deepEqual(prea.issues, []);
  assert.ok(prea.warnings.some((w) => w.includes("cel mult 3 grupe")));

  const preaMulteMateriale = verifica(
    { material_composition: material([{ cluster_id: 11, components: [
      { material_id: 1 }, { material_id: 2 }, { material_id: 3 }, { material_id: 4 },
    ] }]) },
    { tip: "non-textile", path: "Fashion|Women|Accessories|Belts" },
  );
  assert.deepEqual(preaMulteMateriale.issues, []);
  assert.ok(preaMulteMateriale.warnings.some((w) => w.includes("3 materiale")));
});

/*
 * ── Deriva dintre produs si `aboutyou_variants` ──────────────────────────────
 *
 * Clasa de defecte care lipsea complet din teste, si care a produs trei dintre
 * cele mai scumpe: randurile din `aboutyou_variants` nu se puneau niciodata de
 * acord cu variantele reale ale produsului.
 */
test("varianta disparuta de pe produs nu mai pleaca si NU mosteneste pretul produsului", () => {
  // Combinatia XXL a fost stearsa din fisa produsului, dar randul din
  // `aboutyou_variants` a rămas. Inainte se completa cu pretul de BAZA si cu
  // instantaneul vechi de stoc, deci XXL de 170 de lei se relista la 100, dintr-un
  // stoc inexistent — pierdere directa la fiecare comanda.
  const p = produs({ page_sections: cuCombinatii([combo({ id: "c2", title: "M", sku: "TR-1-M", price: "120" })]) });
  const [ramasa, fantoma] = atasezaPreturileRon(p, [
    varianta("TR-1-M"),
    varianta("TR-1-XXL", { quantity: 9 }),
  ]);
  assert.equal(ramasa.enabled, true);
  assert.equal(ramasa.ron_price, 120, "varianta ramasa pleaca cu pretul EI");
  assert.equal(fantoma.enabled, false, "varianta care nu mai exista pe produs nu are voie sa plece");
  assert.equal(fantoma.ron_price, null);
  assert.equal(fantoma.ron_compare_at, null);
});

test("variantele noi ale produsului se vad in sloturi, ca reconcilierea sa le poata insera", () => {
  const p = produs({ page_sections: cuCombinatii([
    combo({ id: "c1", title: "M", sku: "TR-1-M" }),
    combo({ id: "c2", title: "L", sku: "TR-1-L" }),
  ]) });
  assert.deepEqual(deriveVariantSlots(p).map((s) => s.sku), ["TR-1-M", "TR-1-L"]);
  // Titlul combinatiei ajunge in `variant_title`; fara el, o comanda About You
  // scade stocul PRODUSULUI, nu al combinatiei, si vitrina revinde marimea.
  assert.deepEqual(deriveVariantSlots(p).map((s) => s.variantTitle), ["M", "L"]);
});

test("produsul fara variante NU primeste titlu de combinatie", () => {
  /*
   * Eticheta afisata e „Unic", dar aceea nu e titlul niciunei combinatii. Scrisa
   * in `variant_title`, scaderea de stoc ar cauta o combinatie inexistenta si ar
   * raporta „a cerut mai mult stoc decat exista" — o alarma falsa la FIECARE
   * comanda a unui magazin de genti, adica exact cazul primului client real.
   */
  const s = deriveVariantSlots(produs())[0];
  assert.equal(s.label, "Unic");
  assert.equal(s.variantTitle, null);

  // Nici combinatiile fara titlu nu inventeaza unul: eticheta cade pe „Variantă 1".
  const faraTitlu = deriveVariantSlots(produs({
    page_sections: cuCombinatii([combo({ title: "", sku: "TR-1-X" })]),
  }))[0];
  assert.equal(faraTitlu.label, "Variantă 1");
  assert.equal(faraTitlu.variantTitle, null);
});

test("doua variante cu aceeasi culoare si marime sunt duplicate pentru About You", () => {
  // Tricou S/M/L cu selectoarele de marime neatinse: trei SKU-uri cu `size: null`
  // si aceeasi culoare. Respingerea venea asincron, cu „wrong sizes", fara sa
  // spuna care varianta.
  const fara = verifica({}, { tip: null, path: null }, [
    varianta("TR-S", { ean: EAN_A }), varianta("TR-M", { ean: EAN_B }), varianta("TR-L", { ean: EAN_C }),
  ]);
  assert.ok(fara.issues.some((i) => i.includes("aceeași combinație")));

  const cuMarimi = verifica({}, { tip: null, path: null }, [
    varianta("TR-S", { ean: EAN_A, size_id: 1 }),
    varianta("TR-M", { ean: EAN_B, size_id: 2 }),
    varianta("TR-L", { ean: EAN_C, size_id: 3 }),
  ]);
  assert.deepEqual(cuMarimi.issues, []);
});

test("o singura varianta fara marime ramane valida", () => {
  // O geanta nu are marime. Verificarea e pe PERECHE, nu pe „are marime", tocmai
  // ca sa nu inventam o cerinta pe care About You n-o are.
  assert.deepEqual(verifica({}, { tip: null, path: null }).issues, []);
});

test("culoarea pusa doar pe unele variante e semnalata; mostenita de toate, nu", () => {
  const amestec = verifica({ color_id: 3 }, { tip: null, path: null }, [
    varianta("TR-S", { ean: EAN_A, size_id: 1, color_id: 9 }),
    varianta("TR-M", { ean: EAN_B, size_id: 2 }),
  ]);
  assert.ok(amestec.issues.some((i) => i.includes("nu are culoare")));

  // Toate mostenesc culoarea listarii: un produs care difera doar prin marime.
  const mostenita = verifica({ color_id: 3 }, { tip: null, path: null }, [
    varianta("TR-S", { ean: EAN_A, size_id: 1 }),
    varianta("TR-M", { ean: EAN_B, size_id: 2 }),
  ]);
  assert.deepEqual(mostenita.issues, []);
});

test("a doua dimensiune de marime se cere pe toate variantele sau pe niciuna", () => {
  const partial = verifica({}, { tip: null, path: null }, [
    varianta("TR-S", { ean: EAN_A, size_id: 1, second_size_id: 5 }),
    varianta("TR-M", { ean: EAN_B, size_id: 2 }),
  ]);
  assert.ok(partial.issues.some((i) => i.includes("A doua dimensiune")));
});

test("cuvintele de incaltaminte fara nivelul „Shoes” doar avertizeaza", () => {
  // „shoe” prinde si „Shoe care”/„Shoe accessories”. Un blocaj de trei grupe
  // acolo ar face categoria nelistabila — adica exact cerinta inventata pe care
  // ne-o reproseaza comerciantii. Nivelul de categorie e proba sigura.
  const ingrijire = regulaClustere("Fashion|Women|Accessories|Shoe care");
  assert.equal(ingrijire.minim, 3);
  assert.equal(ingrijire.blocheaza, false);
  // Calea care trece chiar prin nivelul „Shoes” blocheaza in continuare.
  assert.equal(regulaClustere("Fashion|Women|Shoes|Ankle boots").blocheaza, true);
});
