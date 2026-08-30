import { strict as assert } from "node:assert";
import { test } from "node:test";

/*
 * ⚠ Se pune INAINTE de import: `cheieEticheta` cere acum un secret si ARUNCA
 * daca nu-l gaseste. Pana acum cadea pe sirul gol, iar semnatura iesea tot 24 de
 * caractere hexazecimale — deci nimic nu deosebea o cheie neghicibila de una
 * calculabila de oricine. Proba de mai jos dovedeste mecanic ca secretul chiar
 * intra in cheie.
 */
process.env.SHIPPING_QUOTE_SECRET ||= "secret-de-proba";

const { cheieEticheta, cheiEticheta } = await import("./eticheta");

/*
 * O eticheta AWB contine numele, adresa si telefonul CUMPARATORULUI — date
 * personale ale unui tert. Fisierele din R2 se servesc public prin CDN, deci
 * cheia e prima paza: daca s-ar putea ghici, oricine stie doua UUID-uri
 * (comerciantul le stie pe ale lui, un fost angajat la fel) ar descarca
 * eticheta oricui.
 */

const BIZ = "11111111-1111-1111-1111-111111111111";
const CMD = "22222222-2222-2222-2222-222222222222";

test("cheia sta in dosarul de AWB-uri GLS, sub magazin", () => {
  const cheie = cheieEticheta(BIZ, CMD);
  assert.ok(cheie.startsWith(`awb/gls/${BIZ}/`), cheie);
  assert.ok(cheie.endsWith(".pdf"), cheie);
});

test("aceleasi date dau aceeasi cheie", () => {
  /* Trebuie sa fie determinista: ruta de descarcare o recompune, fara sa se fi
     salvat nimic in plus pe comanda. */
  assert.equal(cheieEticheta(BIZ, CMD), cheieEticheta(BIZ, CMD));
});

test("⚠ cheia NU se poate compune din cele doua UUID-uri", () => {
  /*
   * Partea de dupa id-ul comenzii e o semnatura din secretul serverului. Fara
   * ea, `awb/gls/<business>/<comanda>.pdf` ar fi o adresa publica pe care o
   * poate scrie oricine stie comanda.
   */
  const cheie = cheieEticheta(BIZ, CMD);
  const naiva = `awb/gls/${BIZ}/${CMD}.pdf`;
  assert.notEqual(cheie, naiva);

  const semnatura = cheie.slice(`awb/gls/${BIZ}/${CMD}-`.length, -".pdf".length);
  assert.equal(semnatura.length, 24, "semnatura trebuie sa aiba lungime fixa");
  assert.match(semnatura, /^[0-9a-f]{24}$/, "semnatura e hexazecimala");
});

test("comenzi diferite dau chei diferite", () => {
  const alta = "33333333-3333-3333-3333-333333333333";
  assert.notEqual(cheieEticheta(BIZ, CMD), cheieEticheta(BIZ, alta));
});

test("acelasi id de comanda la alt magazin da alta cheie", () => {
  /* Altfel un magazin ar putea citi eticheta altuia doar schimband business-ul
     din adresa — iar ruta n-ar mai fi singura paza. */
  const altBiz = "44444444-4444-4444-4444-444444444444";
  assert.notEqual(cheieEticheta(BIZ, CMD), cheieEticheta(altBiz, CMD));
});

test("semnatura depinde de AMANDOUA id-urile, nu doar de comanda", () => {
  const altBiz = "44444444-4444-4444-4444-444444444444";
  const s1 = cheieEticheta(BIZ, CMD).split("-").pop();
  const s2 = cheieEticheta(altBiz, CMD).split("-").pop();
  assert.notEqual(s1, s2);
});

test("⚠ secretul CHIAR intra in cheie — dovedit mecanic", () => {
  /*
   * Proba care lipsea, si fara de care „cheia e neghicibila" era doar o afirmatie
   * din comentariu. Cu secretul cazut pe sirul gol, semnatura arata la fel — 24
   * de caractere hexazecimale — deci nimic nu tradea degradarea.
   */
  const cuUnul = cheieEticheta(BIZ, CMD);
  const vechi = process.env.SHIPPING_QUOTE_SECRET;
  process.env.SHIPPING_QUOTE_SECRET = "cu-totul-alt-secret";
  const cuAltul = cheieEticheta(BIZ, CMD);
  process.env.SHIPPING_QUOTE_SECRET = vechi;

  assert.notEqual(cuUnul, cuAltul, "semnatura nu depinde de secret");
  assert.equal(cheieEticheta(BIZ, CMD), cuUnul, "secretul s-a restaurat");
});

test("⚠ formatele Zebra au cheie si extensie proprii", () => {
  /*
   * ZPL-ul nu e PDF. Salvate sub aceeasi cheie, o schimbare de format ar
   * suprascrie fisierul vechi cu unul de alt fel, iar cititorul de PDF ar spune
   * „fisier deteriorat" fara ca nimeni sa lege asta de configurare.
   */
  const pdf = cheieEticheta(BIZ, CMD, "pdf");
  const zpl = cheieEticheta(BIZ, CMD, "zpl");
  assert.ok(pdf.endsWith(".pdf"), pdf);
  assert.ok(zpl.endsWith(".zpl"), zpl);
  assert.notEqual(
    pdf.replace(/\.pdf$/, ""),
    zpl.replace(/\.zpl$/, ""),
    "extensia trebuie sa intre si in SEMNATURA, nu doar in nume",
  );
  assert.equal(cheieEticheta(BIZ, CMD), pdf, "implicitul ramane PDF");
});

test("⚠ stergerea acopera si cheia VECHE, nesemnata cu extensia", () => {
  /*
   * Etichetele emise pana la schimbarea asta stau sub cheia fara extensie in
   * semnatura. Scoase din lista, n-ar mai putea fi sterse de nicio cale din cod:
   * nici la anularea AWB-ului, nici la stergerea comenzii, nici la o cerere GDPR.
   */
  const chei = cheiEticheta(BIZ, CMD);
  assert.equal(chei.length, 3);
  assert.ok(chei.includes(cheieEticheta(BIZ, CMD, "pdf")));
  assert.ok(chei.includes(cheieEticheta(BIZ, CMD, "zpl")));
  assert.equal(new Set(chei).size, 3, "cele trei chei trebuie sa fie DIFERITE");
  for (const k of chei) assert.ok(k.startsWith(`awb/gls/${BIZ}/`), k);
});
