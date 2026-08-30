import assert from "node:assert/strict";
import { test } from "node:test";
import { disponibilitatePachet, readBundleConfig, type StareComponenta } from "./bundles";

/**
 * „Pachetul asta se poate cumpara?" avea patru raspunsuri diferite.
 *
 * Cardul din catalog stia de pachete, cele doua pagini de produs nu (calculau
 * disponibilitatea din campuri pe care un pachet nu le are — el se scrie cu
 * `track_inventory: false`), iar panoul avea a patra formulare. Rezultatul, viu
 * in productie: „Pachet Femei" (suplio, publicat, 358,40 lei) are toate cele trei
 * componente sterse de o saptamana si se afiseaza disponibil; „Kit Incarcare
 * Rapida USB" are cardul „Stoc epuizat" si butonul Comanda deschis in acelasi
 * timp, iar comanda cade la ultimul pas.
 */

const c = (over: Partial<StareComponenta> = {}): StareComponenta => ({
  quantity: 1, vandabila: true, track_inventory: false, stock_quantity: null, ...over,
});

test("componente nelimitate: pachetul e disponibil", () => {
  assert.deepEqual(disponibilitatePachet([c(), c()]), { inStock: true, max: Infinity });
});

test("o componenta STEARSA face pachetul indisponibil, si spune care", () => {
  // Asta e „Pachet Femei". Regula veche raspundea „disponibil" pentru ca doar
  // unul din patru apelanti trimitea steagul optional `missing`.
  const r = disponibilitatePachet([c(), c({ vandabila: false }), c()]);
  assert.deepEqual(r, { inStock: false, max: 0, motiv: "componenta_lipsa", indice: 1 });
});

test("stocul unei componente margineste cate pachete se pot face", () => {
  // Doua bucati pe pachet, sapte in stoc: trei pachete.
  const r = disponibilitatePachet([c(), c({ quantity: 2, track_inventory: true, stock_quantity: 7 })]);
  assert.deepEqual(r, { inStock: true, max: 3 });
});

test("componenta terminata inchide pachetul, cu indicele ei", () => {
  const r = disponibilitatePachet([c(), c({ track_inventory: true, stock_quantity: 0 })]);
  assert.deepEqual(r, { inStock: false, max: 0, motiv: "stoc_insuficient", indice: 1 });
});

test("cea mai stramta componenta da numarul, nu prima gasita", () => {
  const r = disponibilitatePachet([
    c({ track_inventory: true, stock_quantity: 10 }),
    c({ track_inventory: true, stock_quantity: 2 }),
    c({ track_inventory: true, stock_quantity: 6 }),
  ]);
  assert.deepEqual(r, { inStock: true, max: 2 });
});

test("pachetul fara componente nu se vinde", () => {
  // Acelasi raspuns acopera si pachetul caruia formularul obisnuit de produs i-a
  // sters configul: `is_bundle` ramane true, dar nu mai are ce sa expedieze.
  assert.deepEqual(disponibilitatePachet([]), { inStock: false, max: 0, motiv: "fara_componente", indice: -1 });
});

test("componenta LIPSA bate componenta epuizata, oricare ar fi ordinea", () => {
  // Ordinea conteaza pentru mesaj: „nu mai exista" cere alta reparatie decat „s-a
  // terminat", iar prima nu se rezolva asteptand.
  const r = disponibilitatePachet([c({ track_inventory: true, stock_quantity: 0 }), c({ vandabila: false })]);
  assert.deepEqual(r, { inStock: false, max: 0, motiv: "componenta_lipsa", indice: 1 });
});

/* ─── Citirea configului ───────────────────────────────────────────────────── */

test("configul fara produse nu e config", () => {
  assert.equal(readBundleConfig(null), null);
  assert.equal(readBundleConfig({ bundle: { items: [] } }), null);
  assert.equal(readBundleConfig({}), null);
});

test("cantitatile din config se normalizeaza", () => {
  const cfg = readBundleConfig({ bundle: { items: [{ product_id: "p1", quantity: 0 }, { product_id: "p2", quantity: 2.7 }] } });
  assert.deepEqual(cfg?.items, [{ product_id: "p1", quantity: 1 }, { product_id: "p2", quantity: 2 }]);
});

test("componenta DEZACTIVATA inchide pachetul, la fel ca una stearsa", () => {
  // Pentru vanzare sunt acelasi lucru: nu se poate expedia. Se deosebesc doar la
  // salvarea din panou, unde una se poate pretui si cealalta nu.
  assert.equal(disponibilitatePachet([c(), c({ vandabila: false })]).inStock, false);
});
