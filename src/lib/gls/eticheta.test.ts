import { strict as assert } from "node:assert";
import { test } from "node:test";
import { cheieEticheta } from "./eticheta";

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
