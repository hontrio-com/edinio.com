import { strict as assert } from "node:assert";
import { test } from "node:test";
import { eVandabila, LOT_MAXIM, rutaDeTrimitere, traducereaPoateBloca } from "./rute";

/*
 * Probele drumului pe care pleaca o modificare spre eMAG.
 *
 * ⚠ Toate greselile pazite aici raspund „reusit". Nu se vad nici la citire, nici la
 * rulare — se afla de la comerciant, peste o zi, cand intreaba de ce nu s-a schimbat
 * nimic. Exact asa s-a aflat la Trendyol, pe 1051 de produse.
 */

const BAZA = { op: "pret" as const, existaLaEmag: true, autoSync: true };

/* ── Drumul se alege dupa CE S-A SCHIMBAT ──────────────────────────────────── */

test("eMAG rute: o schimbare de pret NU merge pe ruta care trimite documentatia", () => {
  /*
   * ═══ CHIAR DEFECTUL VETDEPO, MUTAT LA eMAG ═══
   *
   * La Trendyol, `op: 'upsert'` pe un produs aprobat trimitea CONTINUT in loc de
   * pret. 1051 de produse au raportat succes cu preturile neschimbate.
   *
   * `product_offer/save` e ruta grea: duce documentatia intreaga si e singura care
   * poate CREA. Folosita pentru un pret, ea rescrie la eMAG tot ce a atins vreodata
   * comerciantul in panoul lor.
   */
  assert.equal(rutaDeTrimitere({ ...BAZA, op: "pret" }).fel, "oferta");
  assert.notEqual(rutaDeTrimitere({ ...BAZA, op: "pret" }).fel, "creeaza");
});

test("eMAG rute: o miscare de stoc merge pe ruta cea mai usoara", () => {
  /* `PATCH /offer_stock/{id}` nu atinge nici pretul, nici documentatia. Trimisa mai
     greu, o oferta preluata si-ar fi pierdut modificarile la FIECARE vanzare. */
  assert.equal(rutaDeTrimitere({ ...BAZA, op: "stoc" }).fel, "stoc");
});

test("eMAG rute: publicarea e singura care merge pe ruta grea", () => {
  assert.equal(rutaDeTrimitere({ ...BAZA, op: "oferta" }).fel, "creeaza");
});

test("eMAG rute: masuratorile au ruta lor", () => {
  assert.equal(rutaDeTrimitere({ ...BAZA, op: "masuratori" }).fel, "masuratori");
});

/* ── Prima trimitere nu poate fi o actualizare ─────────────────────────────── */

test("eMAG rute: o oferta care nu exista inca la ei pleaca pe ruta care CREEAZA", () => {
  /*
   * Oricat de mica ar fi lucrarea ceruta. Trimisa pe `offer_stock`, eMAG ar fi
   * raspuns cu un refuz despre un id inexistent — iar produsul ar fi ramas
   * nepublicat, cu un mesaj care nu spune nicaieri „mai intai publica-l".
   */
  assert.equal(rutaDeTrimitere({ ...BAZA, op: "stoc", existaLaEmag: false }).fel, "creeaza");
  assert.equal(rutaDeTrimitere({ ...BAZA, op: "pret", existaLaEmag: false }).fel, "creeaza");
});

/* ── Ofertele preluate ─────────────────────────────────────────────────────── */

test("eMAG rute: unei oferte PRELUATE nu i se rescrie pretul singur", () => {
  /*
   * ⚠ A DOUA PAZA, si trebuie sa existe chiar daca prima e in coada.
   *
   * Ofertele aduse de import au `auto_sync: false`: pretul si stocul lor sunt puse
   * de comerciant in panoul eMAG. Un rand poate ajunge in coada INAINTE ca
   * `auto_sync` sa fie stins de importul care ruleaza chiar atunci — si atunci numai
   * verificarea de aici mai apuca sa-l opreasca.
   */
  const r = rutaDeTrimitere({ ...BAZA, op: "pret", autoSync: false });
  assert.equal(r.fel, "nimic");
  assert.match(r.motiv ?? "", /preluat/i);
  assert.match(r.motiv ?? "", /Trimite acum/, "motivul spune si ce poate face omul");
});

test("eMAG rute: dar cand comerciantul apasa el butonul, pleaca", () => {
  /*
   * „Nu trimite singur" nu inseamna „nu trimite niciodata" — inseamna „nu fara sa-mi
   * ceri". Confundate, butonul „Trimite acum" n-ar fi facut nimic pe ofertele
   * preluate, si nici n-ar fi spus de ce.
   */
  assert.equal(rutaDeTrimitere({ ...BAZA, op: "pret", autoSync: false, fortat: true }).fel, "oferta");
  assert.equal(rutaDeTrimitere({ ...BAZA, op: "stoc", autoSync: false, fortat: true }).fel, "stoc");
});

/* ── Retragerea trece peste tot ────────────────────────────────────────────── */

test("eMAG rute: stergerea unui produs preluat ajunge TOTUSI la eMAG", () => {
  /*
   * ⚠ ORDINEA VERIFICARILOR. Pusa dupa paza ofertelor preluate, retragerea unui
   * produs importat n-ar fi plecat niciodata — si magazinul ar fi continuat sa vanda
   * pe eMAG un produs care nu mai exista la noi. Nimeni nu apasa „Trimite acum"
   * pentru un produs pe care tocmai l-a sters.
   */
  assert.equal(rutaDeTrimitere({ op: "retragere", existaLaEmag: true, autoSync: false }).fel, "retrage");
});

test("eMAG rute: o oferta care n-a ajuns niciodata la ei nu se retrage", () => {
  const r = rutaDeTrimitere({ op: "retragere", existaLaEmag: false, autoSync: true });
  assert.equal(r.fel, "nimic");
  assert.match(r.motiv ?? "", /niciodat/i);
});

/* ── Loturile ──────────────────────────────────────────────────────────────── */

test("eMAG rute: niciun lot nu trece de 50", () => {
  /* Peste 50, `product_offer/save` intoarce „Maximum input vars of 4000 exceeded" si
     NU salveaza nimic din lot. Vezi `errors.ts`, unde raspunsul e clasificat refuz. */
  for (const [fel, cat] of Object.entries(LOT_MAXIM)) {
    assert.ok(cat <= 50, `${fel} are lot ${cat}`);
  }
  assert.equal(LOT_MAXIM.stoc, 1, "`offer_stock` e PATCH pe un id, deci n-are lot");
});

/* ── Vandabilitatea ────────────────────────────────────────────────────────── */

const APROBATA = { stoc: 3, status: 1, offer_validation_status: 1, validation_status: 9 };

test("eMAG: o oferta e vandabila numai cu toate cele patru conditii deodata", () => {
  /*
   * Verificata pe una singura, ecranul ar fi spus „publicat" pentru oferte pe care
   * cumparatorul nu le vede — cea mai suparatoare minciuna a unui panou, fiindca
   * omul nu are cum s-o dovedeasca.
   */
  assert.equal(eVandabila(APROBATA), true);
  assert.equal(eVandabila({ ...APROBATA, stoc: 0 }), false, "fara stoc");
  assert.equal(eVandabila({ ...APROBATA, status: 0 }), false, "oprita");
  assert.equal(eVandabila({ ...APROBATA, offer_validation_status: 2 }), false, "oferta nevalidata");
  assert.equal(eVandabila({ ...APROBATA, validation_status: 1 }), false, "asteapta MKTP");
  assert.equal(eVandabila({ ...APROBATA, validation_status: null }), false, "nu stim");
});

test("eMAG: cele patru stari de validare care ingaduie vanzarea", () => {
  for (const v of [3, 9, 11, 12]) {
    assert.equal(eVandabila({ ...APROBATA, validation_status: v }), true, `validation_status ${v}`);
  }
  for (const v of [1, 2, 4, 5, 6, 8, 10]) {
    assert.equal(eVandabila({ ...APROBATA, validation_status: v }), false, `validation_status ${v}`);
  }
});

test("eMAG: traducerea se ARATA, nu se interpreteaza", () => {
  /*
   * ═══ CE NU STIM, NU PRETINDEM CA STIM ═══
   *
   * Documentatia lor spune doar ca „produsele traduse automat pot sa nu fie publicate
   * chiar cu validation_status 9/11 — verifica translation_validation_status pentru
   * granularitate". Cautat in tot OpenAPI-ul: campul apare de DOUA ori si nicaieri
   * nu i se enumera valorile.
   *
   * Prima forma a lui `eVandabila` avea aici o lista copiata dupa `validation_status`.
   * Era inventata — si inventata ar fi aratat „publicat" acolo unde eMAG blocheaza,
   * adica exact greseala impotriva careia te avertizeaza documentatia lor.
   */
  assert.equal(traducereaPoateBloca({ validation_status: 9, translation_validation_status: 5 }), true);
  assert.equal(traducereaPoateBloca({ validation_status: 9, translation_validation_status: null }), false,
    "n-au spus nimic despre traducere");
  assert.equal(traducereaPoateBloca({ validation_status: 1, translation_validation_status: 5 }), false,
    "cand oferta oricum nu e aprobata, traducerea nu e stirea zilei");
});
