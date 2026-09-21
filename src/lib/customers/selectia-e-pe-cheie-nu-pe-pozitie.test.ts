import test from "node:test";
import assert from "node:assert/strict";

import type { Customer } from "@/lib/customers";
import {
  COLOANE_CSV_CLIENTI, comuta, csvulClientilor, cumSeSterge, doarCeleDePePagina,
  numePropusPentruSegment, numeleFisieruluiDeClienti, rezumatSelectiei,
} from "./selectie";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * BIFELE SE TIN PE CHEIE, NU PE POZITIE                         (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ Si nu e o preferinta de stil. Tinute pe pozitie, o sortare schimbata sau un
 * client nou intrat intre timp ar muta bifele pe ALTI oameni — iar butonul de
 * sub ele sterge date fara intoarcere. Nimeni n-ar vedea nimic: lista arata la
 * fel, doar ca randul 3 nu mai e acelasi om.
 */

function client(p: Partial<Customer> = {}): Customer {
  return {
    key: "722111999", name: "Ana Pop", phone: "0722111999", email: null,
    city: null, county: null, address: null,
    orderCount: 0, validOrderCount: 0, cancelledCount: 0, refundedCount: 0,
    ordersValue: 0, collectedTotal: 0, aov: 0,
    firstOrderAt: null, lastOrderAt: null, lastStatus: null,
    source: null, canal: null,
    ...p,
  };
}

test("⚠⚠ bifele se muta odata cu omul, nu cu randul", () => {
  const a = client({ key: "aaa", name: "Ana" });
  const b = client({ key: "bbb", name: "Barbu" });
  const c = client({ key: "ccc", name: "Cristi" });

  let alese = comuta(new Set<string>(), "bbb");
  assert.deepEqual([...alese], ["bbb"]);

  /* Lista se re-sorteaza: Barbu ajunge primul. Bifa ramane pe Barbu. */
  const dupaSortare = [b, a, c];
  assert.deepEqual([...doarCeleDePePagina(alese, dupaSortare)], ["bbb"]);

  alese = comuta(alese, "bbb");
  assert.deepEqual([...alese], []);
});

test("⚠⚠ bifele de pe alta pagina NU pleaca la actiune", () => {
  /*
   * Fara curatare, bifele de pe pagina 1 ar fi ramas in stare si ar fi plecat
   * impreuna cu cele de pe pagina 2: bara ar fi aratat „63 selectați" intr-o
   * lista de cincizeci, iar stergerea ar fi atins oameni pe care comerciantul
   * nu-i mai avea pe ecran.
   */
  const pagina1 = [client({ key: "p1a" }), client({ key: "p1b" })];
  const pagina2 = [client({ key: "p2a" }), client({ key: "p2b" })];

  const alese = new Set(["p1a", "p1b"]);
  assert.deepEqual([...doarCeleDePePagina(alese, pagina2)], []);
  assert.deepEqual([...doarCeleDePePagina(alese, pagina1)].sort(), ["p1a", "p1b"]);

  /* Si dupa un filtru care lasa un singur rand, ramane o singura bifa. */
  assert.deepEqual([...doarCeleDePePagina(alese, [pagina1[1]])], ["p1b"]);
});

test("⚠ `comuta` nu schimba multimea primita", () => {
  /* Schimbata pe loc, React n-ar fi vazut nicio deosebire si bifa n-ar fi aparut. */
  const initiala = new Set(["x"]);
  const noua = comuta(initiala, "y");
  assert.deepEqual([...initiala], ["x"]);
  assert.deepEqual([...noua].sort(), ["x", "y"]);
});

/* ── Ce spune bara ──────────────────────────────────────────────────────── */

test("⚠⚠ bara spune CATI se sterg si CATI se anonimizeaza", () => {
  /*
   * Butonul face doua lucruri deosebite dupa cum e omul. „Ștergi 12 clienți" ar
   * fi fost fals pentru zece dintre ei, care raman in rapoarte cu comenzile lor.
   */
  const alesi = [
    client({ key: "a", orderCount: 0 }),
    client({ key: "b", orderCount: 3, ordersValue: 500 }),
    client({ key: "c", orderCount: 1, ordersValue: 200 }),
  ];
  const r = rezumatSelectiei(alesi);
  assert.equal(r.cati, 3);
  assert.equal(r.contacte, 1);
  assert.equal(r.cumparatori, 2);
  assert.equal(r.valoare, 700);

  const t = cumSeSterge(r);
  assert.match(t, /1 contact se șterge/);
  assert.match(t, /2 cumpărători își pierd/);
  assert.match(t, /comenzile rămân/);
});

test("singularul si pluralul sunt amandoua corecte", () => {
  assert.match(cumSeSterge({ contacte: 2, cumparatori: 0 }), /2 contacte se șterg/);
  assert.match(cumSeSterge({ contacte: 0, cumparatori: 1 }), /1 cumpărător își pierde/);
  assert.equal(cumSeSterge({ contacte: 0, cumparatori: 0 }), "");
});

/* ── Descarcarea ────────────────────────────────────────────────────────── */

test("⚠ fisierul are toate coloanele antetului pe fiecare rand", () => {
  /*
   * O coloana adaugata in antet si uitata in rand ar fi mutat toate valorile de
   * dupa ea cu o pozitie: „Județ" ar fi ajuns sub „Oraș", si nimeni n-ar fi
   * observat decat filtrand in Excel.
   */
  const csv = csvulClientilor([client({ name: "Ana", phone: "0722111999" })]);
  const linii = csv.replace("﻿", "").trimEnd().split("\r\n");
  assert.equal(linii.length, 2);
  assert.equal(linii[0].split(";").length, COLOANE_CSV_CLIENTI.length);
  assert.equal(linii[1].split(";").length, COLOANE_CSV_CLIENTI.length);
});

test("⚠⚠ un nume care e formula Excel nu se executa", () => {
  /*
   * Numele vine de la CUMPARATOR, scris de el la checkout. Vezi `lib/csv.test.ts`
   * — gaura a fost gasita in exportul de cosuri, care era deja livrat.
   */
  const csv = csvulClientilor([client({ name: '=HYPERLINK("http://rau","Factura")' })]);
  assert.ok(!/(^|;)=HYPERLINK/m.test(csv), "numele iese din fisier ca formula");
  assert.ok(csv.includes("'=HYPERLINK"), "lipseste apostroful care il face text");
});

test("⚠ telefonul isi pastreaza zeroul din fata", () => {
  const csv = csvulClientilor([client({ phone: "0722111999" })]);
  assert.ok(csv.includes("'0722111999"), "telefonul nu mai e scris ca text");
});

test("⚠ „sursa contactului” se scrie pe litere, si pentru cumparatori", () => {
  /*
   * `source` e `null` pentru un cumparator (n-are rand in `customers`), dar asta
   * NU inseamna „nu stim". Un gol in coloana aceea ar fi aratat a date lipsa.
   */
  const csv = csvulClientilor([
    client({ key: "a", source: null, orderCount: 2 }),
    client({ key: "b", source: "manual" }),
    client({ key: "c", source: "import" }),
  ]);
  assert.match(csv, /a comandat/);
  assert.match(csv, /adăugat manual/);
  assert.match(csv, /importat/);
});

test("⚠ cele doua numere de comenzi sunt AMANDOUA in fisier", () => {
  /*
   * „5 comenzi · 1.240 lei" vorbea despre multimi diferite: cele cinci pot
   * cuprinde doua anulate, pe cand suma le scoate. In fisier, unde nu e nimeni
   * sa explice, diferenta trebuie sa se vada in coloane.
   */
  assert.ok(COLOANE_CSV_CLIENTI.includes("Comenzi valide"));
  assert.ok(COLOANE_CSV_CLIENTI.includes("Comenzi totale"));
  const csv = csvulClientilor([client({ orderCount: 5, validOrderCount: 3, cancelledCount: 2 })]);
  const valori = csv.replace("﻿", "").trimEnd().split("\r\n")[1].split(";");
  assert.equal(valori[COLOANE_CSV_CLIENTI.indexOf("Comenzi valide")], "3");
  assert.equal(valori[COLOANE_CSV_CLIENTI.indexOf("Comenzi totale")], "5");
  assert.equal(valori[COLOANE_CSV_CLIENTI.indexOf("Anulate")], "2");
});

test("numele fisierului poarta data", () => {
  assert.equal(numeleFisieruluiDeClienti(new Date("2026-09-21T09:00:00Z")), "clienti-2026-09-21.csv");
});

test("numele propus pentru un segment vine din filtrul pus", () => {
  assert.equal(numePropusPentruSegment("vip", 12), "Clienți VIP (12)");
  assert.equal(numePropusPentruSegment("toti", 7), "Listă de 7");
});
