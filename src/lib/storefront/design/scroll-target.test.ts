import test from "node:test";
import assert from "node:assert/strict";
import { primaCutie, type ElementCuCutie } from "./scroll-target";

/**
 * Gasirea tintei de derulare cand invelisul sectiunii n-are cutie.
 *
 * Rulare: `npm test`.
 */

interface Nod extends ElementCuCutie {
  nume: string;
  getClientRects(): { length: number };
  querySelectorAll(selector: string): Nod[];
}

/** Un element de test: `cutii` spune cate dreptunghiuri raporteaza. */
function el(nume: string, cutii: number, descendenti: Nod[] = []): Nod {
  return {
    nume,
    getClientRects: () => ({ length: cutii }),
    // Ordinea din document: fiecare descendent, apoi descendentii lui.
    querySelectorAll: () => descendenti.flatMap((d) => [d, ...d.querySelectorAll("*")]),
  };
}

test("un element cu cutie se intoarce pe el insusi", () => {
  const sectiune = el("section", 1, [el("h2", 1)]);
  assert.equal(primaCutie(sectiune)?.nume, "section");
});

test("⚠⚠ invelisul `display: contents` trimite mai departe, la primul copil cu cutie", () => {
  // Exact cazul real: `<div data-st-section class="contents">` nu genereaza
  // cutie, deci `scrollIntoView()` pe el returneaza imediat si nu deruleaza
  // nimic. Cat timp a fost asa, „Du-ma la sectiune" selecta in lista si lasa
  // previzualizarea pe loc.
  const inveli = el("div.contents", 0, [el("section", 1, [el("h2", 1)])]);
  assert.equal(primaCutie(inveli)?.nume, "section");
});

test("sare peste descendentii care n-au nici ei cutie", () => {
  // Doua invelisuri unul in altul, apoi continutul: se coboara pana la primul
  // element care chiar ocupa loc pe ecran.
  const inveli = el("div.contents", 0, [el("div.contents", 0, [el("section", 1)])]);
  assert.equal(primaCutie(inveli)?.nume, "section");
});

test("ordinea din document decide: primul cu cutie, nu cel mai adanc", () => {
  const inveli = el("div.contents", 0, [el("header", 1), el("section", 1)]);
  assert.equal(primaCutie(inveli)?.nume, "header");
});

test("o sectiune care n-a randat nimic da `null`, nu o eroare", () => {
  // Sectiune stinsa: nu exista unde sa derulezi, si asta nu e un caz de crapat.
  assert.equal(primaCutie(el("div.contents", 0, [el("span", 0)])), null);
  assert.equal(primaCutie(el("div.contents", 0)), null);
});

test("lipsa elementului nu e o eroare", () => {
  assert.equal(primaCutie(null), null);
  assert.equal(primaCutie(undefined), null);
});
