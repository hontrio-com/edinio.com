import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  NUMELE_RECUPERARII, ZILE_ATRIBUIRE, felulRecuperarii, mesajulCareAAdus,
} from "./atribuire";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CE APARA PROBELE ASTEA
  ═══════════════════════════════════════════════════════════════════════════════

  O cifra care nu se poate dovedi arata pe ecran exact ca una care se poate.
  De-aia „Recuperate" a stat mult timp fara sa spuna nimic: numara cosuri
  convertite care primisera candva un mesaj, adica si pe cele care s-ar fi
  intors oricum.

  Probele astea apara HOTARELE dintre cele trei feluri, fiindca tocmai ele fac
  diferenta intre „a mers campania" si „au venit oamenii singuri".
*/

const LA = (iso: string) => new Date(iso);
const COMANDA = LA("2026-09-20T12:00:00Z");

test("fara niciun mesaj, comanda e organica", () => {
  assert.equal(felulRecuperarii([], COMANDA), "organica");
});

test("mesaj trimis si nedeschis: asistata, nu atribuita", () => {
  /*
    ⚠ AICI E TOATA MIZA. Pana acum astea intrau la „recuperate", desi nimic nu
    arata ca mesajul a facut ceva. Din cele 307 conversii de pe productie,
    astea ar fi fost singurele doua care contau - si tot nedemonstrabile.
  */
  const r = felulRecuperarii([{ trimis_la: "2026-09-19T10:00:00Z", deschis_la: null }], COMANDA);
  assert.equal(r, "asistata");
});

test("link deschis in fereastra: atribuita", () => {
  assert.equal(
    felulRecuperarii([{ trimis_la: "2026-09-18T10:00:00Z", deschis_la: "2026-09-19T10:00:00Z" }], COMANDA),
    "atribuita",
  );
});

test("⚠ FEREASTRA SE MASOARA DE LA DESCHIDERE, NU DE LA TRIMITERE", () => {
  /*
    ⚠ Un mesaj trimis acum zece zile si deschis ieri, urmat de comanda azi, e o
    recuperare. Masurata de la trimitere, fereastra ar fi expirat tocmai pentru
    omul care chiar a venit prin link.
  */
  const vechiDarCitit = [{ trimis_la: "2026-09-01T10:00:00Z", deschis_la: "2026-09-19T10:00:00Z" }];
  assert.equal(felulRecuperarii(vechiDarCitit, COMANDA), "atribuita");
});

test("⚠ HOTARUL DE SAPTE ZILE: la limita inauntru, peste limita afara", () => {
  const laFix = new Date(COMANDA.getTime() - ZILE_ATRIBUIRE * 86400_000).toISOString();
  const cuOSecundaMaiDevreme = new Date(COMANDA.getTime() - ZILE_ATRIBUIRE * 86400_000 - 1000).toISOString();

  assert.equal(felulRecuperarii([{ trimis_la: laFix, deschis_la: laFix }], COMANDA), "atribuita");
  assert.equal(
    felulRecuperarii([{ trimis_la: cuOSecundaMaiDevreme, deschis_la: cuOSecundaMaiDevreme }], COMANDA),
    "asistata",
    "deschis cu o secunda peste fereastra nu mai are voie sa ia meritul",
  );
});

test("⚠ O COMANDA DINAINTEA DESCHIDERII NU E ADUSA DE LINK", () => {
  /*
    ⚠ Capcana: omul comanda dimineata, iar seara apasa linkul din email din
    curiozitate. Fara verificarea semnului, clickul de seara ar fi luat meritul
    unei comenzi deja plasate - si campania ar fi aratat mai bine decat e.
  */
  const dupaComanda = [{ trimis_la: "2026-09-19T10:00:00Z", deschis_la: "2026-09-20T20:00:00Z" }];
  assert.equal(felulRecuperarii(dupaComanda, COMANDA), "asistata");
});

test("⚠ MERITUL MERGE LA MESAJUL DESCHIS CEL MAI RECENT", () => {
  /*
    ⚠ Daca omul a primit trei mesaje si l-a deschis pe al treilea, al treilea
    l-a adus. Numarat pe primul, orice campanie ar fi aratat ca merge doar
    prima trimitere si ca urmatoarele sunt bani aruncati.
  */
  const mesaje = [
    { trimis_la: "2026-09-14T10:00:00Z", deschis_la: "2026-09-15T10:00:00Z", nume: "primul" },
    { trimis_la: "2026-09-17T10:00:00Z", deschis_la: null, nume: "al doilea" },
    { trimis_la: "2026-09-19T10:00:00Z", deschis_la: "2026-09-19T18:00:00Z", nume: "al treilea" },
  ];
  assert.equal(mesajulCareAAdus(mesaje, COMANDA)?.nume, "al treilea");
});

test("mesajul care a adus nu se alege dintre cele din afara ferestrei", () => {
  const mesaje = [{ trimis_la: "2026-08-01T10:00:00Z", deschis_la: "2026-08-02T10:00:00Z", nume: "vechi" }];
  assert.equal(mesajulCareAAdus(mesaje, COMANDA), null);
  assert.equal(mesajulCareAAdus([], COMANDA), null);
});

test("o data stricata nu trece drept deschidere", () => {
  /* ⚠ `new Date("nu o data").getTime()` da NaN, iar orice comparatie cu NaN e
     falsa - deci fara verificare randul ar fi cazut tacut in „asistata". Bine,
     dar din intamplare: aici se masoara ca e dinadins. */
  const r = felulRecuperarii([{ trimis_la: "2026-09-19T10:00:00Z", deschis_la: "nu o data" }], COMANDA);
  assert.equal(r, "asistata");
  assert.equal(mesajulCareAAdus([{ trimis_la: "x", deschis_la: "nu o data" }], COMANDA), null);
});

test("cele trei nume spun lucruri diferite, si al doilea spune ca NU se poate dovedi", () => {
  const n = NUMELE_RECUPERARII;
  assert.equal(new Set(Object.values(n).map((x) => x.titlu)).size, 3);
  assert.match(n.asistata.explicatie, /nu se poate dovedi/i);
  assert.match(n.atribuita.explicatie, /se poate dovedi/i);
  assert.match(n.atribuita.explicatie, new RegExp(`${ZILE_ATRIBUIRE} zile`));
});

test("⚠ CELE TREI NU SE ADUNA INTR-UN „RECUPERAT” MAI MARE", () => {
  /*
    ⚠ Capcana pe care o pazeste proba: cineva vede trei cifre mici si le
    aduna „ca sa arate mai bine". Suma lor e chiar cifra veche - toate
    conversiile lunii - adica exact cea care nu spunea nimic.

    Se masoara pe ecran ca a doua si a treia NU stau pe randul cardurilor
    mari, si ca explicatia celei de-a doua spune ca nu se poate dovedi.
  */
  const ecran = readFileSync(
    new URL("../../components/dashboard/AbandonedCartsClient.tsx", import.meta.url), "utf8",
  );
  const randulMare = ecran.slice(ecran.indexOf("{/* KPIs */}"), ecran.indexOf("asistateCount"));
  assert.doesNotMatch(randulMare, /organiceCount/, "cifra organica a urcat langa cele care se dovedesc");
  assert.match(ecran, /NUMELE_RECUPERARII\.atribuita\.explicatie/, "cardul nu-si spune ce masoara");

  /* Si ca numele vechi, care se citea gresit, a disparut de pe ecran. */
  assert.doesNotMatch(ecran, /label="Rat[ăa] abandon"/, "a ramas numele vechi al ratei");
  assert.match(ecran, /Rată de abandon la finalizare/);
});

test("⚠ CADEREA INAPOI: cosurile de dinainte de jurnal nu devin peste noapte „organice”", () => {
  /*
    ⚠ Cosurile convertite inainte de 21.09.2026 n-au niciun rand in
    `recovery_sends`, dar unele chiar au primit mesaje - se vede in
    `recovery_email_sent_at`. Socotite fara asta, tot istoricul ar fi trecut la
    „organic", si comerciantul ar fi vazut munca lui de pana acum stearsa.
  */
  const sursa = readFileSync(
    new URL("../actions/abandoned-cart.actions.ts", import.meta.url), "utf8",
  );
  assert.match(
    sursa,
    /mesaje\.length === 0\s*\n\s*\?\s*\(\(r\.recovery_email_sent_at \|\| r\.recovery_sms_sent_at\) \? "asistata" : "organica"\)/,
    "lipseste caderea inapoi pe datele de dinainte de jurnal",
  );
});
