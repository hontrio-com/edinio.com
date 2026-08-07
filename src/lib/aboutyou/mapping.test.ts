import assert from "node:assert/strict";
import { test } from "node:test";
import {
  atasezaPreturileRon, deriveVariantSlots, eanValid, stocVarianta, verificaSku,
  type AboutYouVariantData, type MappableProduct,
} from "./mapping";

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
