import assert from "node:assert/strict";
import { test } from "node:test";
import { aplicaPolitica, areComutatoareProprii, politicaSincronizare } from "./politica-sincronizare";

/**
 * Regula care desparte stocul de pret la Trendyol (04.11.2026, VetDepo).
 *
 * Ce apara: (1) un magazin fara comutatoare scrise merge EXACT ca inainte, deci livrarea nu
 * porneste pretul pe listarile preluate ale nimanui; (2) pretul oprit nu pleaca NICIODATA cu
 * valoarea din magazin, nici la apasarea omului, nici la scoaterea din vanzare; (3) un articol
 * fara valoare actuala la ei nu pleaca deloc.
 */
const preluata = { auto_inventory: false };
const aNoastra = { auto_inventory: true };

test("fara comutatoare scrise: regula veche, neschimbata", () => {
  assert.equal(areComutatoareProprii({}), false);
  assert.deepEqual(politicaSincronizare({}, preluata), { stoc: false, pret: false });
  assert.deepEqual(politicaSincronizare({}, aNoastra), { stoc: true, pret: true });
  assert.deepEqual(politicaSincronizare({}, { auto_inventory: null }), { stoc: true, pret: true });
  /* Apasarea omului si scoaterea din vanzare treceau si inainte peste listarea preluata, cu tot. */
  assert.deepEqual(politicaSincronizare({}, preluata, { manual: true }), { stoc: true, pret: true });
  assert.deepEqual(politicaSincronizare({}, preluata, { forceZero: true }), { stoc: true, pret: true });
});

test("stoc pornit, pret oprit: si pe listarile preluate, si pe ale noastre", () => {
  const c = { sincronizeaza_stocul: true, sincronizeaza_pretul: false };
  assert.equal(areComutatoareProprii(c), true);
  assert.deepEqual(politicaSincronizare(c, preluata), { stoc: true, pret: false });
  assert.deepEqual(politicaSincronizare(c, aNoastra), { stoc: true, pret: false });
});

test("pretul oprit nu trece nici la apasarea omului, nici la scoaterea din vanzare", () => {
  const c = { sincronizeaza_stocul: false, sincronizeaza_pretul: false };
  assert.deepEqual(politicaSincronizare(c, aNoastra), { stoc: false, pret: false });
  assert.deepEqual(politicaSincronizare(c, aNoastra, { manual: true }), { stoc: true, pret: false });
  assert.deepEqual(politicaSincronizare(c, preluata, { forceZero: true }), { stoc: true, pret: false });
});

test("un singur comutator scris e destul ca regula noua sa se aplice", () => {
  assert.deepEqual(politicaSincronizare({ sincronizeaza_pretul: false }, preluata), { stoc: true, pret: false });
  assert.deepEqual(politicaSincronizare({ sincronizeaza_stocul: false }, preluata), { stoc: false, pret: true });
});

const dorit = { barcode: "B1", quantity: 50, salePrice: 111.99, listPrice: 129.99 };
const actuale = new Map([["B1", { quantity: 48, salePrice: 99.5, listPrice: 99.5 }]]);

test("pret oprit: pleaca stocul nostru cu pretul LOR", () => {
  assert.deepEqual(aplicaPolitica([dorit], actuale, { stoc: true, pret: false }),
    [{ barcode: "B1", quantity: 50, salePrice: 99.5, listPrice: 99.5 }]);
});

test("stoc oprit: pleaca pretul nostru cu stocul LOR", () => {
  assert.deepEqual(aplicaPolitica([dorit], actuale, { stoc: false, pret: true }),
    [{ barcode: "B1", quantity: 48, salePrice: 111.99, listPrice: 129.99 }]);
});

test("amandoua pornite: valorile noastre, fara nicio citire necesara", () => {
  assert.deepEqual(aplicaPolitica([dorit], new Map(), { stoc: true, pret: true }), [dorit]);
});

test("fara valoare actuala la ei, articolul NU pleaca cu pretul din magazin", () => {
  assert.deepEqual(aplicaPolitica([dorit], new Map(), { stoc: true, pret: false }), []);
  /* Un pret zero la ei ar face lotul sa cada, si cu el si stocul. */
  const zero = new Map([["B1", { quantity: 1, salePrice: 0, listPrice: 0 }]]);
  assert.deepEqual(aplicaPolitica([dorit], zero, { stoc: true, pret: false }), []);
});

test("pretul taiat pastrat nu iese sub pretul de vanzare", () => {
  const strambe = new Map([["B1", { quantity: 3, salePrice: 40, listPrice: 30 }]]);
  const [a] = aplicaPolitica([dorit], strambe, { stoc: true, pret: false });
  assert.equal(a.listPrice, 40);
});
