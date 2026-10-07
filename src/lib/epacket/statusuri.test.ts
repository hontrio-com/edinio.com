import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  STARI, clasificaStatus, descriereStare, eStareFinala, esteRetur, normalizeazaStatus, statusUrmator, trebuieSemnalat,
} from "./statusuri";

/**
 * Tabelul „Statusuri" din specificatia LOR (salvata in depozit), citit rand cu rand:
 * `| `cod` | Denumire | da/nu |`.
 */
function tabelulLor(): { cod: string; denumire: string; final: boolean }[] {
  const spec = JSON.parse(readFileSync(new URL("../../../docs/curieri/EPACKET-openapi.json", import.meta.url), "utf8"));
  const text: string = spec.info.description;
  const sectiune = text.slice(text.indexOf("## Statusuri"));
  const randuri: { cod: string; denumire: string; final: boolean }[] = [];
  for (const m of sectiune.matchAll(/^\|\s*`([a-z_]+)`\s*\|\s*([^|]+?)\s*\|\s*(da|nu)\s*\|/gm)) {
    randuri.push({ cod: m[1], denumire: m[2], final: m[3] === "da" });
  }
  return randuri;
}

test("⚠⚠ harta are EXACT codurile lor, cu aceleasi stari finale si aceleasi denumiri", () => {
  const lor = tabelulLor();
  assert.equal(lor.length, 19, "tabelul lor are 19 coduri");
  assert.deepEqual(Object.keys(STARI).sort(), lor.map((r) => r.cod).sort());
  for (const r of lor) {
    assert.equal(STARI[r.cod as keyof typeof STARI].final === true, r.final, `${r.cod}: „Final” difera`);
    assert.equal(STARI[r.cod as keyof typeof STARI].denumire, r.denumire, `${r.cod}: denumirea difera`);
  }
});

test("comanda urca pe scara: creat -> In procesare, preluat -> Expediata, livrat -> Livrata", () => {
  assert.equal(statusUrmator("confirmed", "creat"), "processing");
  assert.equal(statusUrmator("processing", "preluat"), "shipped");
  assert.equal(statusUrmator("shipped", "in_livrare"), null, "deja expediata");
  assert.equal(statusUrmator("shipped", "livrat"), "delivered");
  assert.equal(statusUrmator("delivered", "in_tranzit"), null, "nu se coboara niciodata");
  assert.equal(statusUrmator("cancelled", "livrat"), null, "o comanda anulata nu se misca de la curier");
});

test("⚠ „creat” NU e expediat: marfa e inca la comerciant", () => {
  assert.equal(clasificaStatus("creat"), "la_comerciant");
  assert.notEqual(statusUrmator("confirmed", "creat"), "shipped");
});

test("problemele se semnaleaza si nu misca comanda; returul se recunoaste", () => {
  for (const s of ["preluare_esuata", "avizat", "livrare_esuata", "redirectionat", "retinut", "avariat", "refuzat", "retur_in_curs", "returnat", "anulat", "distrus", "abandonat", "inchis_administrativ"]) {
    assert.equal(trebuieSemnalat(s), true, s);
    assert.equal(statusUrmator("shipped", s), null, s);
  }
  assert.equal(esteRetur("refuzat"), true);
  assert.equal(esteRetur("returnat"), true);
  assert.equal(esteRetur("redirectionat"), false, "redirectionarea merge in alta parte, nu inapoi");
});

test("⚠ ce nu s-a vazut nu misca nimic si nu iese din urmarire", () => {
  assert.equal(normalizeazaStatus("in_vama"), null);
  assert.equal(clasificaStatus("in_vama"), "necunoscut");
  assert.equal(statusUrmator("shipped", "in_vama"), null);
  assert.equal(trebuieSemnalat("in_vama"), false);
  assert.equal(eStareFinala("in_vama"), false);
  /* Dar daca EI spun ca e final, se opreste. */
  assert.equal(eStareFinala("in_vama", true), true);
  /* Si codul lor „necunoscut" e nefinal. */
  assert.equal(eStareFinala("necunoscut"), false);
  /* Un cod din prototip nu e stare. */
  assert.equal(normalizeazaStatus("constructor"), null);
});

test("denumirea: a lor intai, apoi a tabelului", () => {
  assert.equal(descriereStare("in_tranzit", "În tranzit"), "În tranzit");
  assert.equal(descriereStare("in_tranzit", ""), "În tranzit");
  assert.equal(descriereStare("in_vama", null), "Stare e-packet „in_vama”");
});
