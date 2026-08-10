import { strict as assert } from "node:assert";
import { test } from "node:test";
import { cheieDocument, numeFisier } from "./documente";
import { cheieEticheta } from "@/lib/gls/eticheta";

/*
 * Documentele de transport contin numele, adresa si telefonul DESTINATARULUI —
 * date personale ale unui tert. Fisierele din R2 se servesc public prin CDN, deci
 * singurul lucru care le apara acolo e faptul ca adresa lor nu se poate ghici.
 */

const BIZ = "11111111-1111-1111-1111-111111111111";
const CMD = "22222222-2222-2222-2222-222222222222";

test("cheia e determinista: aceleasi date dau acelasi fisier", () => {
  assert.equal(cheieDocument(BIZ, CMD, "label"), cheieDocument(BIZ, CMD, "label"));
});

test("⚠ eticheta si avizul NU impart acelasi fisier", () => {
  /*
   * Fara `fel` in semnatura si in nume, al doilea document descarcat l-ar fi
   * suprascris pe primul — iar comerciantul ar fi lipit pe palet ce credea ca e
   * eticheta.
   */
  assert.notEqual(cheieDocument(BIZ, CMD, "label"), cheieDocument(BIZ, CMD, "note"));
});

test("⚠ cheia nu se poate compune din cele doua UUID-uri", () => {
  /*
   * Comerciantul isi stie ID-urile, si un fost angajat la fel. Fara semnatura,
   * oricine le are descarca avizul oricarei comenzi direct de pe CDN.
   */
  const cheie = cheieDocument(BIZ, CMD, "label");
  assert.ok(cheie.startsWith(`awb/pallex/${BIZ}/${CMD}-label-`), cheie);
  const semnatura = cheie.slice(`awb/pallex/${BIZ}/${CMD}-label-`.length, -".pdf".length);
  assert.equal(semnatura.length, 24);
  assert.match(semnatura, /^[0-9a-f]{24}$/);
});

test("comenzi diferite si magazine diferite dau chei diferite", () => {
  const altaComanda = "33333333-3333-3333-3333-333333333333";
  const altMagazin = "44444444-4444-4444-4444-444444444444";
  assert.notEqual(cheieDocument(BIZ, CMD, "label"), cheieDocument(BIZ, altaComanda, "label"));
  assert.notEqual(cheieDocument(BIZ, CMD, "label"), cheieDocument(altMagazin, CMD, "label"));
});

test("⚠ Pall-Ex si GLS nu se calca pe fisiere pe aceeasi comanda", () => {
  /*
   * Copiate de la GLS, prefixul si sirul semnat ar fi dus amandoua documentele la
   * aceeasi cheie: reemiterea la un curier ar fi suprascris eticheta celuilalt,
   * iar anularea uneia ar fi sters-o pe a celeilalte.
   */
  const pallex = cheieDocument(BIZ, CMD, "label");
  const gls = cheieEticheta(BIZ, CMD);
  assert.notEqual(pallex, gls);
  assert.ok(pallex.startsWith("awb/pallex/"), pallex);
  assert.ok(gls.startsWith("awb/gls/"), gls);
});

test("numele fisierului spune ce e si pentru care partida", () => {
  assert.equal(numeFisier("label", "C202012345678"), "eticheta-pallex-C202012345678.pdf");
  assert.equal(numeFisier("note", "C202012345678"), "aviz-pallex-C202012345678.pdf");
});

test("⚠ numele fisierului nu poate fi stricat de continutul comenzii", () => {
  /* Un AWB cu bara ar fi produs un nume de fisier pe care sistemul il refuza. */
  assert.equal(numeFisier("label", "C2020/12 34"), "eticheta-pallex-C20201234.pdf");
  assert.equal(numeFisier("label", ""), "eticheta-pallex-partida.pdf");
  assert.ok(!numeFisier("label", "../../etc/passwd").includes("/"));
});
