import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { amprentaCombinatie, idArticol } from "@/lib/pepita/identitate";
import { cuUid, desparteTitlu, identitateCombinatie, redenumesteValoare } from "./variante-identitate";

/* ══════════════════════════════════════════════════════════════════════════
   IDENTITATEA UNEI COMBINATII, CARE NU SE SCHIMBA CU NUMELE (08.09.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ CE CERE PEPITA, TEXTUAL: `<Id>` „nem változik" — nu se schimba cand se schimba datele
   produsului. Pana azi el se deriva din TITLUL combinatiei, deci o redenumire nastea alt articol la
   ei, cu istoricul pierdut.

   ⚠ SI CE FACEA EDINIO ERA MAI RAU DECAT ATAT: redenumirea nici nu exista ca operatie. Se stergea
   valoarea si se adauga alta, iar `generateCombinations` potriveste dupa titlu — deci combinatia
   veche era ARUNCATA si se nastea una goala, fara pret, SKU, EAN, stoc si imagine. Un identificator
   stabil pus pe un rand care oricum moare n-ar fi reparat nimic. De-aia cele doua se livreaza
   impreuna.
*/

const OPT = (name: string, values: string[]) => ({ id: name, name, values });
/* ⚠ `uid` e declarat ANUME in tip, desi `cuUid` il pune: fara el, tipul dedus n-ar avea campul si
   probele n-ar mai putea sa-l citeasca — iar `tsc` ar cadea acolo unde probele trec. */
interface ComboProba {
  id: string; title: string; uid?: string; price: string; compare_at_price: string;
  sku: string; gtin: string; stock_quantity: string; image: string; enabled: boolean;
}
const COMBO = (title: string, peste: Partial<ComboProba> = {}): ComboProba => ({
  id: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  title, price: "99", compare_at_price: "", sku: "SKU-1", gtin: "5901234123457",
  stock_quantity: "7", image: "poza.webp", enabled: true, ...peste,
});

/* ══════════════════════════════════════════════════════════════════════════
   PROBA PE CARE A CERUT-O AUDITUL, CUVANT CU CUVANT
   ══════════════════════════════════════════════════════════════════════════ */

test("⚠ „Roșu / XL” redenumit in „Roșu aprins / XL” pastreaza ACELASI `<Id>`", () => {
  const PRODUS = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
  const optiuni = [OPT("Culoare", ["Roșu", "Albastru"]), OPT("Marime", ["XL", "M"])];
  const combinatii = cuUid([COMBO("Roșu / XL"), COMBO("Albastru / XL"), COMBO("Roșu / M")]);

  const inainte = idArticol(PRODUS, combinatii[0]);

  const r = redenumesteValoare(optiuni, combinatii, 0, "Roșu aprins", "Roșu");
  const dupa = r.combinatii.find((c) => c.title === "Roșu aprins / XL");

  assert.ok(dupa, "combinatia redenumita nu se mai gaseste");
  assert.equal(idArticol(PRODUS, dupa), inainte, "`<Id>`-ul s-a schimbat odata cu numele");

  /* ⚠ Si randul a SUPRAVIETUIT, cu tot ce era pe el. Asta lipsea de fapt. */
  assert.equal(dupa.price, "99");
  assert.equal(dupa.sku, "SKU-1");
  assert.equal(dupa.gtin, "5901234123457");
  assert.equal(dupa.stock_quantity, "7");
  assert.equal(dupa.image, "poza.webp");

  /* Cealalta combinatie cu aceeasi culoare se redenumeste si ea; cele de pe alta axa, nu. */
  assert.ok(r.combinatii.some((c) => c.title === "Roșu aprins / M"));
  assert.ok(r.combinatii.some((c) => c.title === "Albastru / XL"));
  assert.deepEqual(r.optiuni[0].values, ["Roșu aprins", "Albastru"]);
  assert.equal(r.neatinse, 0);
});

test("⚠ trecerea nu MISCA niciun `<Id>` deja trimis", () => {
  /*
   * ⚠ ASTA E CONDITIA CARE FACE REPARATIA POSIBILA FARA MIGRATIE. `uid`-ul se SEAMANA din amprenta
   * titlului de acum, iar amprenta e chiar ce folosea `<Id>`-ul pana azi. Deci in ziua trecerii
   * fiecare articol iese cu exact acelasi identificator, la Pepita si oriunde altundeva. Semanat
   * altfel (un uuid nou), cele 47.431 de combinatii ar fi aparut la ei ca oferte disparute si
   * altele noi, cu istoricul pierdut.
   */
  const PRODUS = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
  for (const titlu of ["S / Roșu", "XL", "Alb / Crem / 42"]) {
    const vechi = COMBO(titlu);
    const [nou] = cuUid([vechi]);
    assert.equal(idArticol(PRODUS, nou), idArticol(PRODUS, titlu), titlu);
    assert.equal(nou.uid, amprentaCombinatie(titlu));
  }
});

test("un `uid` odata pus nu se mai schimba", () => {
  const cu = cuUid([COMBO("S / Roșu", { uid: "0123456789abcdef" })]);
  assert.equal(cu[0].uid, "0123456789abcdef");
  /* Si o forma stricata se inlocuieste, ca sa nu ramana o identitate pe care n-o recunoaste nimeni. */
  const stricat = cuUid([COMBO("S / Roșu", { uid: "NU-E-HEXA" })]);
  assert.equal(stricat[0].uid, amprentaCombinatie("S / Roșu"));
});

test("identitatea cade pe amprenta cand combinatia n-are inca `uid`", () => {
  assert.equal(identitateCombinatie({ title: "S / Roșu" }), amprentaCombinatie("S / Roșu"));
  assert.equal(identitateCombinatie({ title: "S / Roșu", uid: "0123456789abcdef" }), "0123456789abcdef");
});

/* ══════════════════════════════════════════════════════════════════════════
   CAPCANA SEPARATORULUI
   ══════════════════════════════════════════════════════════════════════════ */

test("⚠ o valoare care CONTINE separatorul nu rupe despartirea", () => {
  /*
   * In productie exista „Alb / Crem" ca valoare de sine statatoare. Un `title.split(" / ")` orb ar
   * fi rupt „Alb / Crem / 42" in TREI bucati, iar redenumirea ar fi rescris alta axa decat cea
   * ceruta: acolo se scade stocul de pe alta marime.
   */
  const optiuni = [OPT("Culoare", ["Alb / Crem", "Alb"]), OPT("Marime", ["42", "43"])];
  assert.deepEqual(desparteTitlu("Alb / Crem / 42", optiuni), ["Alb / Crem", "42"]);
  assert.deepEqual(desparteTitlu("Alb / 43", optiuni), ["Alb", "43"]);
});

test("⚠ si redenumirea o face corect, pe AXA ei", () => {
  const optiuni = [OPT("Culoare", ["Alb / Crem", "Alb"]), OPT("Marime", ["42"])];
  const combinatii = cuUid([COMBO("Alb / Crem / 42"), COMBO("Alb / 42")]);
  const r = redenumesteValoare(optiuni, combinatii, 0, "Ivoriu", "Alb / Crem");

  assert.ok(r.combinatii.some((c) => c.title === "Ivoriu / 42"), "combinatia cu separator in valoare");
  assert.ok(r.combinatii.some((c) => c.title === "Alb / 42"), "cealalta culoare a fost atinsa");
  assert.equal(r.neatinse, 0);
});

test("ce nu se poate desparti se lasa in pace SI se numara", () => {
  /*
   * ⚠ Mai bine o combinatie ramasa cu numele vechi, pe care omul o vede in lista, decat una legata
   * gresit. Numarul iese in fata comerciantului, nu intr-un jurnal.
   */
  const optiuni = [OPT("Culoare", ["Roșu"]), OPT("Marime", ["XL"])];
  const combinatii = cuUid([COMBO("Roșu / XL"), COMBO("Roșu / MARIME-STEARSA")]);
  const r = redenumesteValoare(optiuni, combinatii, 0, "Bordo", "Roșu");

  assert.ok(r.combinatii.some((c) => c.title === "Bordo / XL"));
  assert.ok(r.combinatii.some((c) => c.title === "Roșu / MARIME-STEARSA"), "s-a atins ce nu se putea desparti");
  assert.equal(r.neatinse, 1);
});

test("redenumirea intr-un nume gol sau in acelasi nume nu face nimic", () => {
  const optiuni = [OPT("Culoare", ["Roșu"])];
  const combinatii = cuUid([COMBO("Roșu")]);
  for (const nou of ["", "   ", "Roșu"]) {
    const r = redenumesteValoare(optiuni, combinatii, 0, nou, "Roșu");
    assert.deepEqual(r.optiuni[0].values, ["Roșu"], nou);
    assert.equal(r.neatinse, 0);
  }
});

/* ══════════════════════════════════════════════════════════════════════════
   SI CA FORMULARUL CHIAR LE FOLOSESTE
   ══════════════════════════════════════════════════════════════════════════ */

test("⚠ formularul de produs redenumeste, nu sterge-si-adauga", () => {
  /*
   * Regula de mai sus e o functie; ce apara cu adevarat e ca ecranul o cheama. Fara operatia din
   * formular, comerciantul tot ar fi sters valoarea si ar fi adaugat alta — si atunci combinatia,
   * cu `uid` cu tot, ar fi murit exact ca inainte.
   */
  const sursa = readFileSync("src/components/dashboard/ProductForm.tsx", "utf8");
  assert.match(sursa, /function renameOptionValue\(/, "operatia de redenumire lipseste din formular");
  assert.match(sursa, /redenumesteValoare\(/);
  assert.match(sursa, /onBlur=\{e => renameOptionValue\(idx, vi, e\.target\.value\)\}/,
    "valoarea nu se mai poate edita pe loc");
  /* ⚠ Si fiecare combinatie generata primeste identitate, altfel prima redenumire ar pierde-o. */
  assert.match(sursa, /return cuUid\(cartesian\(/, "combinatiile nu mai primesc `uid`");
});

test("⚠ feedul deriva `<Id>` din COMBINATIE, nu din titlul ei", () => {
  const sursa = readFileSync("src/lib/pepita/articole.ts", "utf8");
  assert.match(sursa, /idArticol\(p\.id, combo\)/, "feedul a revenit la titlu, deci `<Id>` sare la redenumire");
  /* Si potrivirea comenzii intoarse foloseste aceeasi identitate. */
  const ingest = readFileSync("src/lib/pepita/ingest.ts", "utf8");
  assert.match(ingest, /identitateCombinatie\(c\) === desfacut!\.amprenta/);
});
