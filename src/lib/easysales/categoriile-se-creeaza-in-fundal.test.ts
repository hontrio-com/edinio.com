import { test } from "node:test";
import assert from "node:assert/strict";
import { eAsezata, refuzPeCategorieProaspata } from "./catalog";
import { ASTEPTARE_DUPA_CATEGORII_MS, CATEGORIE_RECENTA_MS } from "./constante";

/*
 * ═══ EASYSALES CREEAZA CATEGORIILE IN FUNDAL ═══
 *
 * Masurat pe 15.10.2026, la primul catalog real (okxi): `categories/save/bulk` a raspuns 200, dar
 * primele 7 produse, trimise in urmatoarele 3 secunde, au primit 422 („Câmpul product.categories.0
 * selectat nu este valid”) si au ramas `respins`, cu amprenta scrisa, deci fara nicio retrimitere.
 * Regulile de aici tin produsul departe de fereastra aceea, iar un refuz din ea se reia.
 *
 * Cablajul (categoria proaspata chiar amana produsul, refuzul chiar nu ramane `respins`) se proba pe
 * DEMO, cu serverul fals in modul `catalogAsincronMs`.
 */

const ACUM = Date.parse("2026-10-15T10:12:41.000Z");
const inUrma = (ms: number) => new Date(ACUM - ms).toISOString();

test("categoria abia trimisa nu se da produselor; dupa prag, da", () => {
  assert.equal(eAsezata(inUrma(700), ACUM), false, "trimisa acum 0,7 s, ca la okxi");
  assert.equal(eAsezata(inUrma(ASTEPTARE_DUPA_CATEGORII_MS - 1), ACUM), false);
  assert.equal(eAsezata(inUrma(ASTEPTARE_DUPA_CATEGORII_MS), ACUM), true);
  assert.equal(eAsezata(inUrma(10 * 60_000), ACUM), true);
});

test("fara `trimis_la` (randuri vechi) sau cu o data stricata, categoria se socoteste asezata", () => {
  assert.equal(eAsezata(null, ACUM), true);
  assert.equal(eAsezata(undefined, ACUM), true);
  assert.equal(eAsezata("nu-i data", ACUM), true);
});

test("pragul se poate cere: aceeasi regula numeste si categoriile „recente” pentru refuzuri", () => {
  assert.equal(eAsezata(inUrma(5 * 60_000), ACUM, CATEGORIE_RECENTA_MS), false);
  assert.equal(eAsezata(inUrma(CATEGORIE_RECENTA_MS), ACUM, CATEGORIE_RECENTA_MS), true);
  assert.ok(ASTEPTARE_DUPA_CATEGORII_MS < CATEGORIE_RECENTA_MS, "fereastra refuzurilor o cuprinde pe a asteptarii");
  assert.ok(ASTEPTARE_DUPA_CATEGORII_MS < 60_000, "produsul amanat pleaca la urmatoarea trecere a cronului (un minut)");
});

const CORP = { categories: [1_000_000_123], characteristics: [{ id: 1_000_000_456, value: "Roșu" }] };
const RECENTE = new Set([1_000_000_123]);
const CARACTERISTICI_RECENTE = new Set([1_000_000_456]);
const NIMIC = new Set<number>();

test("refuzul masurat la okxi (Save pe element), pe o categorie trimisa de curand: se reia", () => {
  const mesaj = "product.categories.0: Câmpul product.categories.0 selectat nu este valid.";
  assert.equal(refuzPeCategorieProaspata(mesaj, CORP, RECENTE, NIMIC), true);
});

test("acelasi refuz, in forma elementului unui lot (`categories.0`, fara `products.N.`): se reia", () => {
  assert.equal(refuzPeCategorieProaspata("categories.0: The selected categories.0 is invalid.", CORP, RECENTE, NIMIC), true);
  assert.equal(refuzPeCategorieProaspata("sku: The sku field is required.; categories.0: The selected categories.0 is invalid.", CORP, RECENTE, NIMIC), true);
});

test("pe o categorie VECHE, refuzul e al produsului: ramane `respins`", () => {
  const mesaj = "product.categories.0: Câmpul product.categories.0 selectat nu este valid.";
  assert.equal(refuzPeCategorieProaspata(mesaj, CORP, NIMIC, NIMIC), false);
});

test("un refuz pe ALT camp nu devine reincercare doar fiindca produsul are o categorie noua", () => {
  assert.equal(refuzPeCategorieProaspata("product.description: The description field is required.", CORP, RECENTE, CARACTERISTICI_RECENTE), false);
  assert.equal(refuzPeCategorieProaspata("product.subcategories.0: invalid", CORP, RECENTE, NIMIC), false);
});

test("caracteristicile: aceeasi regula, pe id-ul caracteristicii trimise de curand", () => {
  const mesaj = "product.characteristics.0.id: The selected product.characteristics.0.id is invalid.";
  assert.equal(refuzPeCategorieProaspata(mesaj, CORP, NIMIC, CARACTERISTICI_RECENTE), true);
  assert.equal(refuzPeCategorieProaspata(mesaj, CORP, NIMIC, NIMIC), false);
  assert.equal(refuzPeCategorieProaspata(mesaj, CORP, RECENTE, NIMIC), false, "o categorie recenta nu scuza o caracteristica veche");
});
