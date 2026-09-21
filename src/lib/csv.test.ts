import test from "node:test";
import assert from "node:assert/strict";

import { SEPARATOR, caText, camp, foaie, numeCuData, suma } from "./csv";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * UN CSV SE DESCHIDE IN EXCEL, NU INTR-UN PARSER           (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Toate regulile de aici ar putea lipsi si fisierul ar ramane un CSV valid. Doar
 * ca s-ar deschide stricat la comerciant — sau, la una dintre ele, ar EXECUTA.
 */

test("⚠⚠ o celula nu poate deveni formula in Excel", () => {
  /*
   * ⚠ GASITA PE 21.09.2026 IN COD DEJA LIVRAT (exportul de cosuri abandonate).
   *
   * Un cumparator isi scrie la checkout numele
   * `=HYPERLINK("http://site-rau","Factura ta")`, comerciantul deschide fisierul,
   * si Excel executa. Ghilimelele NU apara: Excel le scoate la parsare si tot
   * vede semnul egal. Singura aparare e apostroful din fata.
   *
   * Cele patru semne sunt cele cunoscute: `=` (formula), `+` si `-` (tot
   * formula), `@` (referinta de nume).
   */
  for (const rau of [
    '=HYPERLINK("http://site-rau","Factura")',
    "=1+1",
    "+49123456",
    "-2+3",
    "@SUM(A1:A9)",
  ]) {
    const iesit = camp(rau);
    assert.ok(
      iesit.startsWith("'") || iesit.startsWith("\"'"),
      `„${rau}" iese din CSV ca formula: ${iesit}`,
    );
  }
});

test("⚠ apostroful se pune INAINTE de incadrare, nu dupa", () => {
  /*
   * Pus dupa, ar fi ramas in afara ghilimelelor (`"'=..."` devine `'"=..."`) si
   * Excel ar fi citit tot formula. Se verifica pe un text care cere si incadrare.
   */
  const iesit = camp('=SUM(1;2)');
  assert.equal(iesit, `"'=SUM(1;2)"`);
});

test("textul obisnuit NU se strica", () => {
  assert.equal(camp("Ionescu Gheorghiță"), "Ionescu Gheorghiță");
  assert.equal(camp("Str. Florilor 12"), "Str. Florilor 12");
  assert.equal(camp(42), "42");
  assert.equal(camp(null), "");
  assert.equal(camp(undefined), "");
});

test("⚠ ghilimelele si separatorul cer incadrare", () => {
  assert.equal(camp('Zice "da"'), '"Zice ""da"""');
  assert.equal(camp("unu;doi"), '"unu;doi"');
  assert.equal(camp("primul\nal doilea"), '"primul\nal doilea"');
});

test("⚠⚠ TELEFONUL NU-SI PIERDE ZEROUL DIN FATA", () => {
  /*
   * Fara apostrof, Excel vede „0722184305" ca pe un numar, taie zeroul si lasa
   * „722184305" — un numar la care nu suna nimeni. Exportul arata perfect pana
   * cand cineva incearca sa sune.
   */
  assert.equal(caText("0722184305"), "'0722184305");
  assert.equal(caText("  0722 184 305  "), "'0722 184 305");
  /* Gol ramane gol: un apostrof singur intr-o celula arata a defect. */
  assert.equal(caText(""), "");
  assert.equal(caText(null), "");
});

test("⚠ suma are virgula zecimala romaneasca", () => {
  assert.equal(suma(1234.5), "1234,50");
  assert.equal(suma("99"), "99,00");
  assert.equal(suma(null), "0,00");
});

test("⚠⚠ foaia are BOM si CRLF", () => {
  /*
   * Fara BOM, Excel deschide fisierul ca Latin-1 si toate diacriticele ies
   * „Gheorghiță" → „GheorghiÈ›Ä". Fara CRLF, unele versiuni pun tot pe un rand.
   */
  const f = foaie(["Client", "Telefon"], [[camp("Ana"), caText("0722111999")]]);
  assert.ok(f.startsWith("﻿"), "lipseste BOM-ul: diacriticele ies stricate");
  assert.ok(f.includes("\r\n"), "randurile nu se termina cu CRLF");
  assert.ok(f.endsWith("\r\n"), "ultimul rand n-are terminatie");

  const linii = f.replace("﻿", "").trimEnd().split("\r\n");
  assert.deepEqual(linii[0].split(SEPARATOR), ["Client", "Telefon"]);
  assert.deepEqual(linii[1].split(SEPARATOR), ["Ana", "'0722111999"]);
});

test("⚠ si ANTETUL trece prin aceleasi reguli", () => {
  /*
   * Un antet scris de om („Total; cu TVA") ar fi rupt coloanele daca n-ar fi
   * trecut prin `camp`. Pare imposibil pana cand cineva adauga o coloana.
   */
  const f = foaie(["Total; cu TVA"], []);
  assert.ok(f.includes('"Total; cu TVA"'));
});

test("numele fisierului poarta data de la Bucuresti", () => {
  /*
   * ⚠ Ora Bucurestiului, nu UTC: un export facut la 01:30 noaptea s-ar fi numit
   * cu ziua de ieri, si comerciantul ar fi crezut ca a descarcat alt fisier.
   */
  const n = numeCuData("clienti", new Date("2026-09-21T23:30:00Z"));
  assert.equal(n, "clienti-2026-09-22.csv");
});
