import test from "node:test";
import assert from "node:assert/strict";
import {
  afisat, conversia, descrieIntervalul, dinText, eStricat, textulDeAratat,
} from "./camp-numar";

const CM = conversia("cm");
const MM = conversia("mm");
const M = conversia("m");
const KG = conversia("kg");
const G = conversia("g");
const BUC = conversia("buc");
const FARA = conversia(undefined);

/* ── Conversia ───────────────────────────────────────────────────────────── */

test("lungimile se aduc in MILIMETRI, in amandoua sensurile", () => {
  assert.equal(CM.catreBaza(1.5), 15);
  assert.equal(CM.dinBaza(15), 1.5);
  assert.equal(M.catreBaza(2.4), 2400);
  assert.equal(M.dinBaza(2400), 2.4);
  assert.equal(MM.catreBaza(7), 7);
});

test("SI MASELE, in GRAME", () => {
  /*
   * ⚠ Prima forma a campului stia doar de lungimi. Un camp in `kg` scria kilogramele de-a
   * dreptul acolo unde motorul astepta grame: o greutate de o mie de ori mai mica, fara nicio
   * eroare pe ecran si fara ca cineva sa aiba de unde afla.
   */
  assert.equal(KG.catreBaza(2.5), 2500);
  assert.equal(KG.dinBaza(2500), 2.5);
  assert.equal(G.catreBaza(300), 300);
});

test("„buc” si campurile fara unitate nu converteste nimic", () => {
  assert.equal(BUC.catreBaza(3), 3);
  assert.equal(BUC.dinBaza(3), 3);
  assert.equal(FARA.catreBaza(3), 3);
});

/* ── Citirea textului ────────────────────────────────────────────────────── */

test("VIRGULA e la fel de buna ca punctul", () => {
  // In Romania asa se scriu zecimalele; un camp care le refuza arata „gresit” pentru cine
  // tasteaza corect.
  assert.equal(dinText("1,5", CM), 15);
  assert.equal(dinText("1.5", CM), 15);
});

test("spatiile din jur nu conteaza", () => {
  assert.equal(dinText("  12  ", MM), 12);
});

test("din ce nu e numar nu iese numar", () => {
  for (const t of ["", "   ", "abc", "12 cm", "--3", "1,2,3"]) {
    assert.equal(dinText(t, MM), undefined, `„${t}” n-ar trebui sa dea un numar`);
  }
});

test("nici infinitul nu trece", () => {
  // `Number("Infinity")` e finit ca tip, dar nu ca valoare — iar motorul lucreaza numai cu
  // numere bune.
  assert.equal(dinText("Infinity", MM), undefined);
  assert.equal(dinText("-Infinity", MM), undefined);
  assert.equal(dinText("NaN", MM), undefined);
});

test("afisat: nimic inseamna sir gol, nu zero", () => {
  // ⚠ „0” intr-un camp gol ar fi aratat ca o valoare aleasa de om.
  assert.equal(afisat(undefined, CM), "");
  assert.equal(afisat(0, CM), "0");
  assert.equal(afisat(150, CM), "15");
});

/* ── Tastarea, adica tot rostul fisierului ───────────────────────────────── */

test("VIRGULA NU SE MANANCA SUB DEGETE", () => {
  /*
   * Drumul dus-intors text → numar → baza → numar → text: „1,” nu e un numar, valoarea se
   * goleste, campul se redeseneaza cu „1” — si virgula dispare exact cand omul apasa a doua
   * cifra. Asa nu se poate scrie nicio zecimala.
   */
  assert.equal(textulDeAratat("1", 10, CM), "1");
  assert.equal(textulDeAratat("1,", 10, CM), "1,", "virgula tocmai apasata trebuie sa ramana");
  assert.equal(textulDeAratat("1,5", 15, CM), "1,5");
});

test("nici zeroul de la coada", () => {
  // „0,30” pe drumul spre „0,305”: canonic ar fi „0,3”, si zeroul ar fi disparut.
  assert.equal(textulDeAratat("0,30", 3, CM), "0,30");
  assert.equal(textulDeAratat("0,305", 3.05, CM), "0,305");
});

test("si nici punctul din capat", () => {
  assert.equal(textulDeAratat("12.", 120, CM), "12.");
});

test("MOTORUL CASTIGA cand valoarea vine din alta parte", () => {
  /*
   * O regula a limitat latimea la 10 cm in timp ce in camp scria „150”. Textul nu mai inseamna
   * acelasi lucru cu valoarea, deci pe ecran apare ce a hotarat motorul.
   */
  assert.equal(textulDeAratat("150", 100, CM), "10");
});

test("o resetare goleste campul", () => {
  assert.equal(textulDeAratat("15", undefined, CM), "");
});

test("textul din care nu iese niciun numar RAMANE pe ecran", () => {
  /*
   * ⚠ Sters pe tacute, omul ar fi vazut campul golindu-se singur si n-ar fi stiut de ce. Se
   * pastreaza, si se spune alaturi ca nu e un numar.
   */
  assert.equal(textulDeAratat("douazeci", undefined, CM), "douazeci");
  assert.ok(eStricat("douazeci", CM));
  assert.ok(!eStricat("", CM), "un camp gol nu e stricat, e doar gol");
  assert.ok(!eStricat("   ", CM), "nici spatiile");
  assert.ok(!eStricat("12,5", CM));
});

test("un camp gol la pornire arata gol", () => {
  assert.equal(textulDeAratat("", undefined, CM), "");
});

test("acelasi drum si pe masa", () => {
  assert.equal(textulDeAratat("2,", 2000, KG), "2,");
  assert.equal(textulDeAratat("2,5", 2500, KG), "2,5");
  assert.equal(textulDeAratat("2,5", 1000, KG), "1", "limitarea din motor castiga si aici");
});

/* ── Intervalul scris ────────────────────────────────────────────────────── */

test("intervalul se scrie in unitatea de pe ecran, nu in cea de baza", () => {
  // ⚠ „Intre 100 si 3000 cm” pe un camp in centimetri ar fi fost o minciuna de zece ori.
  assert.equal(descrieIntervalul(100, 3000, CM, "cm"), "Intre 10 si 300 cm");
  assert.equal(descrieIntervalul(100, undefined, CM, "cm"), "Cel putin 10 cm");
  assert.equal(descrieIntervalul(undefined, 3000, CM, "cm"), "Cel mult 300 cm");
  assert.equal(descrieIntervalul(undefined, undefined, CM, "cm"), null);
});

test("fara unitate, intervalul nu inventeaza una", () => {
  assert.equal(descrieIntervalul(1, 10, FARA, undefined), "Intre 1 si 10");
});

test("ZERO e o limita ca oricare alta", () => {
  // ⚠ Scris cu `||`, un minim de zero ar fi disparut din text.
  assert.equal(descrieIntervalul(0, 100, MM, "mm"), "Intre 0 si 100 mm");
  assert.equal(descrieIntervalul(0, undefined, MM, "mm"), "Cel putin 0 mm");
});
