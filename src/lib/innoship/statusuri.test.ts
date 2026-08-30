import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  clasificaStatus,
  codNumeric,
  descriereRamburs,
  descriereStatus,
  eStareFinala,
  esteRetur,
  rambursTrebuieSemnalat,
  statusComandaDinCod,
  statusFinalDinStari,
  statusUrmator,
  trebuieSemnalat,
  ultimaStare,
  STATUSURI,
  STATUSURI_RAMBURS,
} from "./statusuri";
import type { StareInnoship } from "./client";

/*
 * Statusurile Innoship sunt NORMALIZATE peste ~230 de curieri, deci „Delivered"
 * inseamna acelasi lucru indiferent cine a dus coletul. Probele de aici apara
 * transcrierea tabelului lor si cele cateva locuri in care traducerea catre
 * treapta comenzii e o hotarare de-a noastra, nu o copiere.
 */

test("tabelul lor de statusuri e transcris intreg: 39 de intrari", () => {
  assert.equal(Object.keys(STATUSURI).length, 39);
});

test("tabelul rambursului are cele patru statusuri", () => {
  assert.deepEqual(Object.keys(STATUSURI_RAMBURS).map(Number).sort((a, b) => a - b), [1, 2, 3, 99]);
});

test("fiecare intrare are denumire si clasa", () => {
  for (const [cod, i] of Object.entries(STATUSURI)) {
    assert.ok(i.denumire.trim(), `${cod} fara denumire`);
    assert.ok(i.clasa, `${cod} fara clasa`);
  }
});

// ─── Traducerile care sunt hotarari, nu copieri ───────────────────────────────

test("⚠ 1 „New” inseamna doar ca s-a facut eticheta — marfa e inca la comerciant", () => {
  /* Marcata „expediata", comanda ar minti clientul. */
  assert.equal(clasificaStatus(1), "la_comerciant");
  assert.equal(statusComandaDinCod(1), "processing");
});

test("2 si 3 inseamna ca a plecat", () => {
  assert.equal(statusComandaDinCod(2), "shipped");
  assert.equal(statusComandaDinCod(3), "shipped");
});

test("⚠ 4 „nepredat la timp” se semnaleaza: marfa n-a plecat si nimeni n-ar afla", () => {
  assert.equal(clasificaStatus(4), "problema");
  assert.ok(trebuieSemnalat(4));
});

test("⚠ 36 si 37 NU se semnaleaza: sunt incercari de livrare, purtare normala", () => {
  /* Semnalate, ar umple clopotelul si l-ar face de necitit tocmai cand apare ceva
     adevarat. Aceeasi hotarare ca la „Avizat" al Postei. */
  assert.ok(!trebuieSemnalat(36));
  assert.ok(!trebuieSemnalat(37));
  assert.equal(statusComandaDinCod(36), "shipped");
});

test("⚠ 103 „livrare partiala” NU e livrare", () => {
  /* Marcata livrata, comanda ar trece drept incheiata cu marfa lipsa. */
  assert.notEqual(clasificaStatus(103), "livrat");
  assert.equal(statusComandaDinCod(103), null);
  assert.ok(trebuieSemnalat(103));
  assert.ok(eStareFinala(103));
});

test("106 „anulat de expeditor” nu se semnaleaza: comerciantul stie deja", () => {
  assert.ok(!trebuieSemnalat(106));
  assert.ok(trebuieSemnalat(107), "dar anulat de CURIER, da");
  assert.ok(trebuieSemnalat(108), "si anulat de SISTEM, da");
});

test("100 „Livrat” e singurul care inchide comanda", () => {
  assert.equal(statusComandaDinCod(100), "delivered");
  assert.ok(eStareFinala(100));
  for (const cod of [101, 102, 103, 104, 105, 106, 107, 108, 109, 110]) {
    assert.equal(statusComandaDinCod(cod), null, `${cod} nu are voie sa miste comanda`);
    assert.ok(eStareFinala(cod), `${cod} ar trebui sa fie final`);
  }
});

test("returul se recunoaste", () => {
  assert.ok(esteRetur(104));
  assert.ok(esteRetur(110));
  assert.ok(!esteRetur(100));
});

// ─── Necunoscutele ────────────────────────────────────────────────────────────

test("un cod care nu e in tabel nu misca nimic si nu semnaleaza nimic", () => {
  assert.equal(clasificaStatus(999), "necunoscut");
  assert.equal(statusComandaDinCod(999), null);
  assert.ok(!trebuieSemnalat(999));
  assert.ok(!eStareFinala(999));
});

test("codul se citeste si din sir, fiindca in baza sta ca text", () => {
  assert.equal(codNumeric("100"), 100);
  assert.equal(statusComandaDinCod("100"), "delivered");
  assert.equal(codNumeric("abc"), null);
  assert.equal(codNumeric(0), null);
  assert.equal(codNumeric(null), null);
});

test("descrierea foloseste tabelul; necunoscuta, arata ce au trimis ei", () => {
  assert.equal(descriereStatus(100), "Livrat");
  assert.equal(descriereStatus(999, "Something New"), "Something New");
  assert.equal(descriereStatus(999), "Status 999");
});

// ─── Scara comenzii ───────────────────────────────────────────────────────────

test("statusul nu coboara niciodata", () => {
  assert.equal(statusUrmator("delivered", 20), null);
  assert.equal(statusUrmator("shipped", 1), null);
  assert.equal(statusUrmator("processing", 20), "shipped");
  assert.equal(statusUrmator("pending", 100), "delivered");
});

test("o comanda anulata sau rambursata nu se misca de la curier", () => {
  assert.equal(statusUrmator("cancelled", 100), null);
  assert.equal(statusUrmator("refunded", 100), null);
});

// ─── Istoricul intreg ─────────────────────────────────────────────────────────

test("⚠ se ia treapta cea mai INALTA din istoric, nu ultimul eveniment", () => {
  /* Lectia GLS: ultimul eveniment poate fi administrativ, iar livrarea petrecuta
     intre doua treceri ale cronului n-ar mai fi vazuta niciodata. */
  const stari: StareInnoship[] = [
    { clientStatusId: 2, eventDate: "2026-09-01T10:00:00" },
    { clientStatusId: 100, eventDate: "2026-09-03T15:00:00" },
    { clientStatusId: 41, eventDate: "2026-09-03T16:00:00" },
  ];
  assert.equal(statusFinalDinStari("processing", stari), "delivered");
});

test("un istoric fara evenimente cu inteles nu misca nimic", () => {
  assert.equal(statusFinalDinStari("shipped", [{ clientStatusId: 90 }, { clientStatusId: 999 }]), null);
  assert.equal(statusFinalDinStari("shipped", []), null);
});

test("ultima stare se alege dupa data, nu dupa ordinea din lista", () => {
  const stari: StareInnoship[] = [
    { clientStatusId: 100, eventDate: "2026-09-03T15:00:00" },
    { clientStatusId: 2, eventDate: "2026-09-01T10:00:00" },
  ];
  assert.equal(ultimaStare(stari)?.clientStatusId, 100);
  assert.equal(ultimaStare([]), null);
  assert.equal(ultimaStare(null), null);
});

// ─── Rambursul ────────────────────────────────────────────────────────────────

test("statusul rambursului se descrie in cuvintele comerciantului", () => {
  assert.equal(descriereRamburs(2), "Ramburs incasat de curier");
  assert.equal(descriereRamburs(3), "Ramburs virat catre tine");
  assert.equal(descriereRamburs(999), "Status ramburs 999");
});

test("⚠ se semnaleaza doar virarea si cazul neurmaribil", () => {
  /* „Incasat de curier" e un pas normal; virarea e ce asteapta comerciantul. */
  assert.ok(!rambursTrebuieSemnalat(1));
  assert.ok(!rambursTrebuieSemnalat(2));
  assert.ok(rambursTrebuieSemnalat(3));
  assert.ok(rambursTrebuieSemnalat(99));
});
