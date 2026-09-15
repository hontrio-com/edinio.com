import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  OPERATII_DPD, clasificaOperatia, eStareFinalaDpd, esteReturDpd, statusComandaDinOperatie,
  statusUrmatorDpd, trebuieSemnalatDpd, ultimaOperatie,
} from "@/lib/shipping/statusuri-dpd";

/*
 * ══════════════════════════════════════════════════════════════════════════
 * CODURILE DE OPERATIE DPD                                      (15.09.2026)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Harta vine din „Appendix 1 - Track And Trace Operation Codes", din documentatia lor oficiala.
 * Spre deosebire de Woot, DPD o PUBLICA, si de aceea aici comanda chiar se muta si factura chiar
 * pleaca. Ceea ce face ca fiecare rand de mai jos sa apere bani, nu un text pe ecran.
 */

/* ── ⚠ Cele trei capcane ─────────────────────────────────────────────────── */

test("⚠⚠ „Livrat” e -14, NEGATIV, iar 14 nu inseamna livrare", () => {
  /*
   * ⚠ CEA MAI USOARA GRESEALA CU PUTINTA. `14` exista in CEALALTA lista a lor (Appendix 2, codurile
   * de exceptie), unde inseamna „Refused by recipient - not ordered". Un parser care taie semnul,
   * sau care confunda cele doua tabele, ar inchide comanda si ar emite FACTURA pe un refuz.
   */
  assert.equal(clasificaOperatia(-14), "livrat");
  assert.equal(statusComandaDinOperatie(-14), "delivered");
  assert.equal(eStareFinalaDpd(-14), true);

  assert.equal(clasificaOperatia(14), "necunoscut", "codul 14 a capatat un inteles pe care nu-l are");
  assert.equal(statusComandaDinOperatie(14), null, "codul 14 muta comanda");
});

test("⚠⚠ „Delivered Back to Sender” (124) NU e livrare, desi ii scrie numele in ea", () => {
  /* E returul AJUNS inapoi la comerciant. Marcat „livrat", comanda s-ar inchide si ar pleca factura
     pentru un colet care tocmai s-a intors. */
  assert.notEqual(clasificaOperatia(124), "livrat");
  assert.equal(statusComandaDinOperatie(124), null);
  assert.equal(esteReturDpd(124), true, "returul ajuns nu mai e recunoscut ca retur");
  assert.equal(eStareFinalaDpd(124), true, "coletul intors inapoi e totusi un capat de drum");
});

test("⚠⚠ coletul AJUNS la punct nu e coletul RIDICAT", () => {
  /*
   * ⚠ Aceeasi lectie pe care FAN a platit-o cu `S46`. Coletul e in dulap sau la oficiu, dar
   * cumparatorul nu l-a luat. Trecuta pe „Livrata", comanda s-ar inchide cu marfa inca acolo, iar
   * daca omul n-o ridica, ea se intoarce si nimeni nu mai e atent.
   */
  for (const cod of [134, 1134]) {
    assert.equal(clasificaOperatia(cod), "in_retea", `codul ${cod} a fost luat drept altceva`);
    assert.equal(statusComandaDinOperatie(cod), "shipped", `codul ${cod} inchide comanda`);
  }
});

/* ── Clasificarea ─────────────────────────────────────────────────────────── */

test("coletul care se misca duce comanda pe „Expediata”", () => {
  for (const cod of [1, 2, 11, 12, 21, 38, 39, 69, 115, 116, 152, 175, 176, 217]) {
    assert.equal(statusComandaDinOperatie(cod), "shipped", `codul ${cod} nu duce pe expediat`);
  }
  /* „Shipment data received" e inaintea ridicarii: coletul e inca la comerciant. */
  assert.equal(statusComandaDinOperatie(148), "processing");
});

test("⚠ problemele NU muta singure comanda, doar cheama omul", () => {
  /* O livrare nereusita sau un refuz nu au voie sa anuleze comanda. Comerciantul hotaraste. */
  for (const cod of [44, 123, 136, 164, 169, 181, 190, 195, 111, 120, 121]) {
    assert.equal(statusComandaDinOperatie(cod), null, `codul ${cod} muta singur comanda`);
    assert.equal(trebuieSemnalatDpd(cod), true, `codul ${cod} nu mai cheama omul`);
  }
});

test("⚠ refuzurile NU sunt finale: dupa ele vine returul", () => {
  /*
   * Marcate „final", am inceta sa intrebam exact cand incepe partea care il intereseaza pe
   * comerciant. Invers, o stare finala tratata ca nefinala costa doar cateva cereri in plus:
   * schimbul e asimetric si se alege in partea ieftina.
   */
  for (const cod of [44, 123, 111]) {
    assert.equal(eStareFinalaDpd(cod), false, `codul ${cod} a fost socotit capat de drum`);
  }
  /* Capetele adevarate. */
  for (const cod of [-14, 124, 125, 127, 128, 129]) {
    assert.equal(eStareFinalaDpd(cod), true, `codul ${cod} nu mai e capat de drum`);
  }
});

test("un cod nedocumentat ramane NECUNOSCUT, nu o ghicitura", () => {
  for (const cod of [999, -1, 0, 7777]) {
    assert.equal(clasificaOperatia(cod), "necunoscut");
    assert.equal(statusComandaDinOperatie(cod), null);
  }
  assert.equal(clasificaOperatia(null), "necunoscut");
  assert.equal(clasificaOperatia(undefined), "necunoscut");
  assert.equal(clasificaOperatia(12.5), "necunoscut", "un cod care nu e intreg a fost citit ca intreg");
});

/* ── Treptele ─────────────────────────────────────────────────────────────── */

test("⚠ starea nu COBOARA niciodata", () => {
  /* Operatiile nu vin garantat in ordine; un „Arrival Scan" sosit dupa „Delivered" ar fi dat
     comanda inapoi pe „Expediata". */
  assert.equal(statusUrmatorDpd("delivered", 1), null);
  assert.equal(statusUrmatorDpd("shipped", 148), null, "„date primite” a coborat comanda la procesare");
  assert.equal(statusUrmatorDpd("processing", 12), "shipped");
  assert.equal(statusUrmatorDpd("shipped", -14), "delivered");
  assert.equal(statusUrmatorDpd("shipped", 12), null, "aceeasi stare nu se rescrie degeaba");
});

test("⚠ o comanda anulata sau restituita nu se mai misca de la niciun eveniment", () => {
  for (const stare of ["cancelled", "refunded"]) {
    assert.equal(statusUrmatorDpd(stare, -14), null, `o comanda ${stare} a fost mutata pe livrat`);
  }
});

/* ── Ultima operatie ──────────────────────────────────────────────────────── */

test("⚠ ultima operatie se ia dupa TIMP, nu dupa locul din lista", () => {
  const op = ultimaOperatie([
    { dateTime: "2026-09-15T09:00:00+03:00", operationCode: 1, description: "Arrival Scan" },
    { dateTime: "2026-09-15T18:00:00+03:00", operationCode: -14, description: "Livrat" },
    { dateTime: "2026-09-15T12:00:00+03:00", operationCode: 12, description: "Out for Delivery" },
  ]);
  assert.equal(op?.operationCode, -14);
});

test("⚠ si se compara ca MOMENT, nu ca sir, fiindca fusul poate sa difere", () => {
  /*
   * Coletul poate trece granita, iar doua operatii scrise in fusuri diferite s-ar ordona gresit ca
   * text: „2026-09-15T08:00:00+03:00" e DUPA „2026-09-15T07:00:00+01:00" ca text, dar INAINTE ca
   * moment (05:00 UTC fata de 06:00 UTC).
   */
  const op = ultimaOperatie([
    { dateTime: "2026-09-15T08:00:00+03:00", operationCode: 1 },
    { dateTime: "2026-09-15T07:00:00+01:00", operationCode: -14 },
  ]);
  assert.equal(op?.operationCode, -14, "ordinea s-a facut pe text, nu pe moment");
});

test("o operatie fara data folosibila nu poate castiga", () => {
  const op = ultimaOperatie([
    { dateTime: "2026-09-15T09:00:00+03:00", operationCode: 12 },
    { dateTime: "candva", operationCode: -14 },
    { operationCode: 44 },
  ]);
  assert.equal(op?.operationCode, 12);
  assert.equal(ultimaOperatie([]), null);
  assert.equal(ultimaOperatie(null), null);
  assert.equal(ultimaOperatie([{ operationCode: 1 }]), null, "o lista fara nicio data a intors ceva");
});

/* ── ⚠ Si apelantul ──────────────────────────────────────────────────────── */

const RAD = process.cwd();
const sursa = (rel: string) =>
  readFileSync(path.join(RAD, rel), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

const CRON = "src/app/api/cron/dpd-tracking/route.ts";

test("⚠⚠ cronul cere cel mult ZECE colete pe cerere, fiindca aia e limita LOR", () => {
  /* „Allowed are up to 10 parcels", scris in documentatia lor. Un lot mai mare nu da o eroare
     limpede, ci un raspuns pe care nu-l intelegi. */
  assert.match(sursa(CRON), /const COLETE_PE_CERERE = 10;/);
});

test("⚠⚠ marcajul se scrie pentru TOATE cele cerute, nu doar pentru cele intoarse", () => {
  /*
   * Un numar necunoscut contului vine cu eroarea lui sau lipseste din raspuns. Marcate doar cele
   * intoarse, celelalte raman cu ceasul NULL, ies primele la fiecare rulare si blocheaza permanent
   * capul cozii. Blocajul asta a fost platit o data, la cronul GLS.
   */
  const s = sursa(CRON);
  const marcaje = (s.match(/marcheazaLotul\(admin, \{/g) ?? []).length;
  assert.equal(marcaje, 2, `marcajul de lot se scrie in ${marcaje} locuri; trebuie si pe drumul bun, si pe cel picat`);
});

test("⚠ tranzitia poarta coletul citit, si nu pleaca daca starea n-a aterizat", () => {
  const s = sursa(CRON);
  assert.match(s, /expediere: \{ coloana: "dpd_awb_number", valoare: o\.dpd_awb_number \}/);
  assert.match(s, /if \(!scrisa\.scris\) continue;/,
    "tranzitia pleaca si cand starea n-a ajuns pe comanda, adica pe alt colet");
});

test("⚠ si cronul e PORNIT, nu doar scris", () => {
  const vercel = JSON.parse(readFileSync(path.join(RAD, "vercel.json"), "utf8")) as
    { crons: { path: string; schedule: string }[] };
  const randul = vercel.crons.find((c) => c.path === "/api/cron/dpd-tracking");
  assert.ok(randul, "cronul DPD nu e programat, deci nu ruleaza niciodata");
  assert.match(randul.schedule, /^\d+ \*\/\d+ \* \* \*$/);
});

test("⚠ emiterea scrie ceasul expedierii", () => {
  assert.match(
    sursa("src/lib/actions/dpd.actions.ts"), /dpd_awb_at: new Date\(\)\.toISOString\(\)/,
    "fara ceas, fereastra de urmarire s-ar masura din data comenzii",
  );
});

test("harta chiar are toate codurile documentate", () => {
  /* ⚠ Fara randul asta, o harta golita din greseala ar face toate probele de clasificare sa cada
     cu mesaje despre coduri, nu despre harta. */
  assert.ok(Object.keys(OPERATII_DPD).length >= 30, `harta are doar ${Object.keys(OPERATII_DPD).length} coduri`);
  assert.ok("-14" in OPERATII_DPD, "codul de livrare a disparut din harta");
});
