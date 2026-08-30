import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  clasificaStatus,
  codNumeric,
  codutiNecunoscute,
  descriereStatus,
  eStareFinala,
  esteRetur,
  laMomentUtc,
  statusComandaDinCod,
  statusFinalDinStari,
  statusUrmator,
  trebuieSemnalat,
  ultimaStare,
  STATUSURI,
} from "./statusuri";
import type { StarePosta } from "./client";

/*
 * Spre deosebire de eColet si Pall-Ex, Posta PUBLICA nomenclatorul (Anexa 2), deci
 * harta e pe numere, nu pe cuvinte. Probele de mai jos apara chiar locurile in care
 * NU le dam crezare, si pe cele in care tabelul lor se contrazice.
 */

test("Anexa 2 e transcrisa intreaga: 55 de statusuri", () => {
  assert.equal(Object.keys(STATUSURI).length, 55);
});

test("fiecare intrare are denumire, denumire web si clasa", () => {
  for (const [cod, i] of Object.entries(STATUSURI)) {
    assert.ok(i.denumire.trim(), `${cod} fara denumire`);
    assert.ok(i.web.trim(), `${cod} fara denumire web`);
    assert.ok(i.clasa, `${cod} fara clasa`);
  }
});

// ─── Livrarea ─────────────────────────────────────────────────────────────────

test("4 „Distribuit” si 19 sunt livrare, si sunt finale", () => {
  assert.equal(clasificaStatus(4), "livrat");
  assert.equal(clasificaStatus(19), "livrat");
  assert.equal(statusComandaDinCod(4), "delivered");
  assert.ok(eStareFinala(4));
  assert.ok(eStareFinala(19));
});

test("⚠ 71 „Predat (Pachetomat)” NU se marcheaza livrat", () => {
  /*
   * Se citeste a livrare, dar in tabelul LOR `statusFinal` e FALS, spre deosebire
   * de 4 si 19. Marcata livrata pe nedrept, o comanda cu plata la livrare ar
   * trece drept incasata. Ramane „in retea" si SE SEMNALEAZA.
   */
  assert.notEqual(clasificaStatus(71), "livrat");
  assert.equal(statusComandaDinCod(71), "shipped");
  assert.ok(trebuieSemnalat(71));
  assert.ok(!eStareFinala(71));
});

// ─── Cele doua locuri in care nu credem steagul lor ───────────────────────────

test("⚠ 56 „Anulat” e FINAL la noi, desi la ei `statusFinal` e FALS", () => {
  /* Altfel comanda anulata ar fi interogata la nesfarsit si ar sta in capul
     cozii, blocand comenzile vii. */
  assert.ok(eStareFinala(56));
  assert.equal(statusComandaDinCod(56), null, "nu misca comanda");
  assert.ok(trebuieSemnalat(56));
});

test("⚠ 10 „Pierdut” NU e final, fiindca 18 „Regasit” vine dupa el", () => {
  assert.ok(!eStareFinala(10), "scos din urmarire, coletul regasit n-ar mai fi vazut");
  assert.ok(trebuieSemnalat(10));
  assert.equal(clasificaStatus(18), "in_retea");
  assert.ok(trebuieSemnalat(18));
});

// ─── Returul ──────────────────────────────────────────────────────────────────

test("20 „Returnat” e retur, e final, si NU inchide comanda", () => {
  assert.ok(esteRetur(20));
  assert.ok(eStareFinala(20));
  assert.ok(trebuieSemnalat(20));
  /* Anularea si rambursarea sunt decizii ale comerciantului, nu ale Postei. */
  assert.equal(statusComandaDinCod(20), null);
});

test("nimic altceva nu e retur", () => {
  assert.ok(!esteRetur(4));
  assert.ok(!esteRetur(22), "„Reexpediat” nu e retur la expeditor");
});

// ─── Borderoul: 33 inca la comerciant, 34 predat ──────────────────────────────

test("33 e scanat pe borderou (inca la comerciant), 34 e predat", () => {
  assert.equal(statusComandaDinCod(33), "processing");
  assert.equal(statusComandaDinCod(34), "shipped");
});

// ─── Avizarea ─────────────────────────────────────────────────────────────────

test("„Avizat” nu se semnaleaza, „Reavizat” da", () => {
  /* Avizarea e purtare normala la posta; a doua incercare inseamna ca returul
     se apropie, si atunci merita sa afle omul. */
  assert.ok(!trebuieSemnalat(1));
  assert.ok(trebuieSemnalat(16));
  assert.equal(clasificaStatus(1), "in_retea");
});

// ─── Codurile necunoscute ─────────────────────────────────────────────────────

test("un cod care nu e in tabel nu misca nimic si nu semnaleaza nimic", () => {
  assert.equal(clasificaStatus(999), "necunoscut");
  assert.equal(statusComandaDinCod(999), null);
  assert.ok(!trebuieSemnalat(999));
  assert.ok(!eStareFinala(999));
});

test("codul se citeste si din sir, fiindca in baza sta ca text", () => {
  assert.equal(codNumeric("4"), 4);
  assert.equal(codNumeric(4), 4);
  assert.equal(codNumeric(" 56 "), 56);
  assert.equal(statusComandaDinCod("4"), "delivered");
});

test("orice nu e intreg pozitiv devine null", () => {
  assert.equal(codNumeric("abc"), null);
  assert.equal(codNumeric(""), null);
  assert.equal(codNumeric(0), null);
  assert.equal(codNumeric(-4), null);
  assert.equal(codNumeric(4.5), null);
  assert.equal(codNumeric(null), null);
  assert.equal(codNumeric({}), null);
});

test("descrierea foloseste denumirea web; necunoscuta, arata codul", () => {
  assert.equal(descriereStatus(4), "Predat la destinatar");
  assert.equal(descriereStatus(999), "Status 999");
  assert.equal(descriereStatus(999, "Ceva nou"), "Ceva nou", "textul lor bate codul");
  assert.equal(descriereStatus(null), "Status necunoscut");
});

// ─── Scara comenzii ───────────────────────────────────────────────────────────

test("statusul nu coboara niciodata", () => {
  assert.equal(statusUrmator("delivered", 14), null, "„Prezentat” nu intoarce o livrare");
  assert.equal(statusUrmator("shipped", 33), null);
  assert.equal(statusUrmator("processing", 14), "shipped");
  assert.equal(statusUrmator("pending", 4), "delivered");
});

test("o comanda anulata sau rambursata nu se misca de la Posta", () => {
  assert.equal(statusUrmator("cancelled", 4), null);
  assert.equal(statusUrmator("refunded", 4), null);
});

test("acelasi status nu produce o schimbare", () => {
  assert.equal(statusUrmator("shipped", 14), null);
});

// ─── Istoricul intreg, nu doar ultima stare ───────────────────────────────────

test("⚠ se ia treapta cea mai INALTA din istoric, nu ultimul eveniment", () => {
  /*
   * Lectia GLS: intre doua treceri ale cronului pot intra mai multe evenimente,
   * iar ultimul poate fi administrativ. Citind doar pe el, livrarea petrecuta
   * intre timp n-ar mai fi vazuta niciodata — iar la plata la livrare asta
   * inseamna bani neinregistrati.
   */
  const stari: StarePosta[] = [
    { idStatus: 14, data: "01.02.2026 09:00" },
    { idStatus: 4, data: "03.02.2026 11:00" },
    { idStatus: 21, data: "03.02.2026 15:00" },  // „Schimbare cod", administrativ
  ];
  assert.equal(statusFinalDinStari("processing", stari), "delivered");
});

test("un istoric fara evenimente cu inteles nu misca nimic", () => {
  assert.equal(statusFinalDinStari("shipped", [{ idStatus: 23 }, { idStatus: 999 }]), null);
  assert.equal(statusFinalDinStari("shipped", []), null);
});

test("istoricul nu poate cobori statusul", () => {
  assert.equal(statusFinalDinStari("delivered", [{ idStatus: 14 }]), null);
});

// ─── Datele lor ───────────────────────────────────────────────────────────────

test("data lor se citeste: ZZ.LL.AAAA HH:mm", () => {
  /* ⚠ Nu e ISO: `new Date("26.02.2015 10:33")` da Invalid Date in Node. */
  assert.equal(laMomentUtc("26.02.2015 10:33"), Date.UTC(2015, 1, 26, 10, 33));
  assert.equal(laMomentUtc("01.01.2026"), Date.UTC(2026, 0, 1, 0, 0));
});

test("o data pe care n-o intelegem nu se compara", () => {
  assert.equal(laMomentUtc("2015-02-26"), null);
  assert.equal(laMomentUtc(""), null);
  assert.equal(laMomentUtc(null), null);
});

test("ultima stare se alege dupa data, nu dupa ordinea din lista", () => {
  const stari: StarePosta[] = [
    { idStatus: 4, data: "03.02.2026 11:00" },
    { idStatus: 14, data: "01.02.2026 09:00" },
  ];
  assert.equal(ultimaStare(stari)?.idStatus, 4);
});

test("fara date citibile, ultima stare e ultima din lista", () => {
  const stari: StarePosta[] = [{ idStatus: 14 }, { idStatus: 4 }];
  assert.equal(ultimaStare(stari)?.idStatus, 4);
  assert.equal(ultimaStare([]), null);
});

// ─── Nomenclatorul viu ────────────────────────────────────────────────────────

test("codurile aparute la ei si lipsa din tabelul nostru se scot la iveala", () => {
  const noi = codutiNecunoscute([
    { idStatus: 4, statusWeb: "Predat la destinatar" },
    { idStatus: 200, statusWeb: "Ceva nou" },
    { idStatus: 201, status: "Fara denumire web" },
    { idStatus: "aiurea" },
  ]);
  assert.deepEqual(noi, [
    { cod: 200, nume: "Ceva nou" },
    { cod: 201, nume: "Fara denumire web" },
  ]);
});

test("un nomenclator identic cu tabelul nostru nu scoate nimic", () => {
  const toate = Object.keys(STATUSURI).map((c) => ({ idStatus: Number(c) }));
  assert.deepEqual(codutiNecunoscute(toate), []);
});
