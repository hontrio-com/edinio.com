import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { COLOANA_AWB, NUME_CURIER } from "@/lib/orders/awb-propriu";
import { COLOANE_FACTURA_EMISA } from "@/lib/billing/factura-pe-comanda";
import { MARKETPLACE_ORIGINI } from "@/lib/orders/origin";
import { CASE_FACTURARE, CHEI_CASE_FACTURARE, cheiaCurierului, CURIERI, SIGLE_MARKETPLACE, siglaCurierului } from "./parteneri";

/*
  Partenerii platformei: curierii, casele de facturare si marketplace-urile, cu siglele lor.

  Listele panoului nu mai scriu numele unui curier: ii arata sigla. O cale gresita inseamna deci
  un buton GOL la toate magazinele care au curierul acela, iar o coloana gresita, o integrare
  pornita care pare oprita. Nimic din toate astea nu da eroare; de aceea se verifica aici.
*/

const TIPURI = readFileSync("src/types/database.types.ts", "utf8");
const coloaneleTabelului = (tabel: string): Set<string> => {
  const inceput = TIPURI.indexOf(`      ${tabel}: {\n        Row: {`);
  assert.ok(inceput > 0, `tabelul ${tabel} nu e in tipuri`);
  const corp = TIPURI.slice(inceput, TIPURI.indexOf("\n        }", inceput));
  return new Set([...corp.matchAll(/^\s{10}([a-z_0-9]+)\??:/gm)].map((m) => m[1]));
};
const peDisc = (logo: string) => existsSync(path.join(process.cwd(), "public", logo));

test("⚠ fiecare curier care emite AWB din platforma e aici, cu cheia lui si cu numele comun", () => {
  assert.deepEqual(Object.keys(CURIERI).sort(), Object.keys(COLOANA_AWB).sort());
  for (const [cheie, c] of Object.entries(CURIERI)) {
    assert.equal(c.cheie, cheie);
    /* Un singur nume: cel din refuzul unui AWB si din notificarea de expediere. */
    assert.equal(c.nume, NUME_CURIER[c.cheie]);
  }
});

test("⚠ fiecare sigla are fisierul ei pe disc", () => {
  for (const c of Object.values(CURIERI)) assert.ok(peDisc(c.logo), `lipseste public${c.logo}`);
  for (const c of CASE_FACTURARE) assert.ok(peDisc(c.logo), `lipseste public${c.logo}`);
  for (const [cheie, logo] of Object.entries(SIGLE_MARKETPLACE)) assert.ok(peDisc(logo), `lipseste public${logo} (${cheie})`);
});

test("⚠ coloanele de configurare si de stare exista in baza", () => {
  const setari = coloaneleTabelului("store_settings");
  const comenzi = coloaneleTabelului("orders");
  for (const c of Object.values(CURIERI)) {
    assert.ok(setari.has(c.config), `store_settings.${c.config} (${c.cheie})`);
    if (c.stare) assert.ok(comenzi.has(c.stare), `orders.${c.stare} (${c.cheie})`);
  }
  for (const c of CASE_FACTURARE) assert.ok(setari.has(c.config), `store_settings.${c.config} (${c.cheie})`);
});

test("casele de facturare sunt cele ale dispecerului, in aceeasi ordine", () => {
  assert.deepEqual(CASE_FACTURARE.map((c) => c.cheie), [...CHEI_CASE_FACTURARE]);
  /* Aceeasi ordine ca la „are comanda o factura?": lista si dispecerul vorbesc despre aceleasi case. */
  assert.deepEqual(COLOANE_FACTURA_EMISA.map((c) => c.slice(0, c.indexOf("_"))), [...CHEI_CASE_FACTURARE]);
});

test("siglele de marketplace sunt ale unor marketplace-uri pe care platforma le cunoaste", () => {
  for (const cheie of Object.keys(SIGLE_MARKETPLACE)) assert.ok(Object.hasOwn(MARKETPLACE_ORIGINI, cheie), cheie);
});

test("cheia curierului dupa ce a scris checkoutul la comanda", () => {
  assert.equal(cheiaCurierului("fan-courier"), "fancourier");
  assert.equal(cheiaCurierului("fan_courier"), "fancourier");
  assert.equal(cheiaCurierului("  Sameday "), "sameday");
  assert.equal(cheiaCurierului("posta-romana"), "posta");
  assert.equal(cheiaCurierului("pall-ex"), "pallex");
  /* Ridicarea din magazin si livrarea proprie nu sunt curieri; nici ce nu cunoastem. */
  for (const altceva of ["pickup", "own", "", null, undefined, "curier-nou", "constructor", "toString"]) {
    assert.equal(cheiaCurierului(altceva), null, String(altceva));
  }
});

test("sigla de panou e varianta mica acolo unde exista, si `null` pentru o cheie necunoscuta", () => {
  assert.deepEqual(siglaCurierului("cargus"), { cheie: "cargus", nume: "Cargus", logo: "/integrations/mici/cargus.webp" });
  assert.deepEqual(siglaCurierului("dpd"), { cheie: "dpd", nume: "DPD", logo: "/integrations/dpd.svg" });
  assert.equal(siglaCurierului("curier-nou"), null);
  assert.equal(siglaCurierului("hasOwnProperty"), null);
});
