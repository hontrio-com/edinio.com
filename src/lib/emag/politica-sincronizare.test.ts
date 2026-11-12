import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ceSeTrimite, ofertaGreaDupaPolitica, ofertaUsoaraDupaPolitica, politicaSincronizare, valorileLaEi,
} from "./politica-sincronizare";
import type { EmagOferta, EmagOfertaCitita, EmagProdusOferta } from "./types";

/**
 * Regula care desparte stocul de pret la eMAG (12.11.2026).
 *
 * Ce apara: (1) un magazin fara comutatoare scrise trimite EXACT ce trimitea; (2) pretul oprit nu
 * pleaca NICIODATA cu valoarea din magazin, nici pe ruta usoara, nici pe cea grea, nici la apasarea
 * omului; (3) pe ruta grea, o oferta ale carei valori nu le stim NU pleaca.
 */

test("fara comutatoare scrise: pleaca tot, ca inainte", () => {
  assert.deepEqual(politicaSincronizare({}), { stoc: true, pret: true });
  assert.deepEqual(politicaSincronizare({ sincronizeaza_stocul: true, sincronizeaza_pretul: true }), { stoc: true, pret: true });
});

test("apasarea omului trece peste stocul oprit, dar niciodata peste pretul oprit", () => {
  const c = { sincronizeaza_stocul: false, sincronizeaza_pretul: false };
  assert.deepEqual(politicaSincronizare(c), { stoc: false, pret: false });
  assert.deepEqual(politicaSincronizare(c, { fortat: true }), { stoc: true, pret: false });
});

const usoara: EmagOferta = {
  id: 7,
  sale_price: 100,
  min_sale_price: 90,
  max_sale_price: 110,
  recommended_price: 120,
  vat_id: 3,
  handling_time: [{ warehouse_id: 1, value: 1 }],
  stock: [{ warehouse_id: 1, value: 5 }],
  status: 1,
};

test("ruta usoara, pret oprit: nu pleaca niciun camp de pret, nici cota de TVA", () => {
  const o = ofertaUsoaraDupaPolitica(usoara, { stoc: true, pret: false });
  assert.deepEqual(o, {
    id: 7, handling_time: [{ warehouse_id: 1, value: 1 }], stock: [{ warehouse_id: 1, value: 5 }], status: 1,
  });
});

test("ruta usoara, stoc oprit: pleaca pretul, fara stoc", () => {
  const o = ofertaUsoaraDupaPolitica(usoara, { stoc: false, pret: true });
  assert.equal(o.stock, undefined);
  assert.equal(o.sale_price, 100);
  assert.equal(o.vat_id, 3);
});

test("ruta usoara, amandoua oprite: raman doar starea si timpul de pregatire", () => {
  assert.deepEqual(ofertaUsoaraDupaPolitica(usoara, { stoc: false, pret: false }), {
    id: 7, handling_time: [{ warehouse_id: 1, value: 1 }], status: 1,
  });
});

test("ruta usoara, amandoua pornite: oferta nu se atinge", () => {
  assert.equal(ofertaUsoaraDupaPolitica(usoara, { stoc: true, pret: true }), usoara);
});

test("ruta usoara nu strica oferta primita (deriva o mai foloseste)", () => {
  const copie = structuredClone(usoara);
  ofertaUsoaraDupaPolitica(usoara, { stoc: false, pret: false });
  assert.deepEqual(usoara, copie);
});

const citita = (o: Partial<EmagOfertaCitita>): EmagOfertaCitita => ({ id: 7, ...o });

test("valorile lor: fara pret nu e nimic de pastrat", () => {
  assert.equal(valorileLaEi(citita({}), 1), null);
  assert.equal(valorileLaEi(citita({ sale_price: 0 }), 1), null);
});

test("valorile lor: stocul pe depozite, altfel `general_stock` pe depozitul magazinului", () => {
  const peDepozite = valorileLaEi(citita({
    sale_price: 50, stock: [{ warehouse_id: 2, value: 4 }, { warehouse_id: 3, value: 1 }],
  }), 1);
  assert.deepEqual(peDepozite?.stock, [{ warehouse_id: 2, value: 4 }, { warehouse_id: 3, value: 1 }]);

  const general = valorileLaEi(citita({ sale_price: 50, general_stock: 9 }), 1);
  assert.deepEqual(general?.stock, [{ warehouse_id: 1, value: 9 }]);

  const nestiut = valorileLaEi(citita({ sale_price: 50 }), 1);
  assert.equal(nestiut?.stock, null);
});

const grea = (): EmagProdusOferta => ({
  id: 7,
  name: "Hrana",
  status: 1,
  sale_price: 100,
  recommended_price: 120,
  min_sale_price: 90,
  max_sale_price: 110,
  stock: [{ warehouse_id: 1, value: 5 }],
  vat_id: 3,
});
const banda = (p: number) => ({ min_sale_price: p * 0.5, max_sale_price: p * 1.5 });

test("ruta grea, pret oprit: pleaca pretul, banda si cota LOR, fisa si stocul nostru", () => {
  const laEi = valorileLaEi(citita({
    sale_price: 80, min_sale_price: 70, max_sale_price: 95, vat_id: 5, recommended_price: 85,
    stock: [{ warehouse_id: 1, value: 2 }],
  }), 1)!;
  const o = ofertaGreaDupaPolitica(grea(), laEi, { stoc: true, pret: false }, banda)!;
  assert.equal(o.name, "Hrana");
  assert.equal(o.sale_price, 80);
  assert.equal(o.min_sale_price, 70);
  assert.equal(o.max_sale_price, 95);
  assert.equal(o.recommended_price, 85);
  assert.equal(o.vat_id, 5);
  assert.deepEqual(o.stock, [{ warehouse_id: 1, value: 5 }]);
});

test("ruta grea, pret oprit: banda lor stricata se reface in jurul pretului LOR", () => {
  const laEi = valorileLaEi(citita({ sale_price: 80, min_sale_price: 90, max_sale_price: 90 }), 1)!;
  const o = ofertaGreaDupaPolitica(grea(), laEi, { stoc: true, pret: false }, banda)!;
  assert.equal(o.min_sale_price, 40);
  assert.equal(o.max_sale_price, 120);
  /* Pretul taiat al nostru (120) nu pleaca peste pretul lor. */
  assert.equal(o.recommended_price, undefined);
  /* Cota necunoscuta ramane a noastra: campul e obligatoriu pe ruta grea. */
  assert.equal(o.vat_id, 3);
});

test("ruta grea, stoc oprit: pleaca stocul LOR, pretul nostru", () => {
  const laEi = valorileLaEi(citita({ sale_price: 80, general_stock: 11 }), 1)!;
  const o = ofertaGreaDupaPolitica(grea(), laEi, { stoc: false, pret: true }, banda)!;
  assert.deepEqual(o.stock, [{ warehouse_id: 1, value: 11 }]);
  assert.equal(o.sale_price, 100);
});

test("ruta grea: fara valorile lor, oferta NU pleaca cu ale magazinului", () => {
  assert.equal(ofertaGreaDupaPolitica(grea(), undefined, { stoc: true, pret: false }, banda), null);
  const faraStoc = valorileLaEi(citita({ sale_price: 80 }), 1)!;
  assert.equal(ofertaGreaDupaPolitica(grea(), faraStoc, { stoc: false, pret: true }, banda), null);
});

test("ruta grea, amandoua pornite: nu se cere nimic de la ei", () => {
  const o = grea();
  assert.equal(ofertaGreaDupaPolitica(o, undefined, { stoc: true, pret: true }, banda), o);
});

test("textul din panou spune exact ce pleaca", () => {
  assert.equal(ceSeTrimite({ stoc: true, pret: true }), "prețul și stocul");
  assert.equal(ceSeTrimite({ stoc: true, pret: false }), "stocul");
  assert.equal(ceSeTrimite({ stoc: false, pret: true }), "prețul");
  assert.equal(ceSeTrimite({ stoc: false, pret: false }), null);
});
