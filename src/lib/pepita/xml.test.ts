import assert from "node:assert/strict";
import { test } from "node:test";
import { XMLValidator } from "fast-xml-parser";
import { ANTET, INCHEIERE, el, escapeXml, grup, numar } from "./xml";

/*
 * ⚠ CE APARA PROBELE DE AICI: un singur caracter prost scris intr-o descriere de
 * produs face TOT feedul neparsabil, deci Pepita nu ia niciun produs, nu doar
 * acela. Escaparea nu e o curatenie, e poarta prin care trece sau nu trece
 * catalogul intreg.
 */

test("escapeaza cele cinci caractere ale XML-ului", () => {
  assert.equal(escapeXml('Tom & Jerry <Special> "Edition"'), "Tom &amp; Jerry &lt;Special&gt; &quot;Edition&quot;");
  assert.equal(escapeXml("A&B > C < D"), "A&amp;B &gt; C &lt; D");
  assert.equal(escapeXml("l'apostrof"), "l&apos;apostrof");
});

test("⚠ `&` se escapeaza PRIMUL, altfel se escapeaza propria escapare", () => {
  /* Invers, `<` ar deveni `&lt;` si apoi `&amp;lt;`, adica textul „&lt;" pe ecranul lor. */
  assert.equal(escapeXml("<"), "&lt;");
  assert.equal(escapeXml("&lt;"), "&amp;lt;");
});

test("pastreaza diacriticele romanesti si ungaresti neatinse", () => {
  assert.equal(escapeXml("Șosetă cu Țepi, Ăsta"), "Șosetă cu Țepi, Ăsta");
  assert.equal(escapeXml("Játékos babafejlesztés őrült"), "Játékos babafejlesztés őrült");
});

test("⚠ scoate octetii de control, care fac XML-ul neparsabil oricat i-ai escapa", () => {
  const cuControl = `Produs${String.fromCharCode(0)}bun${String.fromCharCode(8)}`;
  assert.equal(escapeXml(cuControl), "Produsbun");
  /* Tab, linie noua si retur de car sunt VALIDE in XML 1.0 si raman. */
  assert.equal(escapeXml("a\tb\nc\rd"), "a\tb\nc\rd");
});

test("⚠ scoate surogatele orfane, ramase dintr-un emoji taiat la mijloc", () => {
  const emoji = "🎁";
  assert.equal(escapeXml(`cadou ${emoji}`), `cadou ${emoji}`, "un emoji intreg trece");
  /* Prima jumatate a perechii, singura: exact ce ramane dintr-un `slice()` prost. */
  assert.equal(escapeXml(`rupt ${emoji.charAt(0)}`), "rupt ");
});

test("elementul lipseste cand valoarea e goala, si exista cand e zero", () => {
  assert.equal(el("Brand", ""), "");
  assert.equal(el("Brand", "   "), "");
  assert.equal(el("Brand", null), "");
  assert.equal(el("Brand", undefined), "");
  assert.equal(el("Quantity", 0), "<Quantity>0</Quantity>");
  assert.equal(el("Name", "Scaun"), "<Name>Scaun</Name>");
});

test("grupul gol nu se scrie", () => {
  assert.equal(grup("Photos", ""), "");
  assert.equal(grup("Photos", "<Photo/>"), "<Photos><Photo/></Photos>");
});

test("⚠ numarul se scrie cu PUNCT zecimal si fara notatie stiintifica", () => {
  assert.equal(numar(1234.5), "1234.5");
  assert.equal(numar(19), "19");
  assert.equal(numar(0.5), "0.5");
  /* 0,0001 kg e un gram. `String(0.0000001)` ar da „1e-7", pe care nu-l citeste nimeni. */
  assert.equal(numar(0.0001, 4), "0.0001");
  assert.equal(numar(1000000.005), "1000000.01");
  assert.equal(numar(Number.NaN), "");
  assert.equal(numar(Number.POSITIVE_INFINITY), "");
});

test("⚠ un feed inchis e valid, unul intrerupt NU e", () => {
  const intreg = ANTET + "<Product><Id>1</Id></Product>\n" + INCHEIERE;
  assert.equal(XMLValidator.validate(intreg), true);

  /*
   * ⚠ ASTA E CHIAR ATOMICITATEA FEEDULUI. Daca generatorul ar scrie incheierea intr-un
   * `finally`, un flux taiat de o pana de baza ar deveni un feed VALID cu jumatate de
   * catalog, adica jumatate de magazin scos de la vanzare fara ca nimeni sa afle.
   */
  const taiat = ANTET + "<Product><Id>1</Id></Product>\n";
  assert.notEqual(XMLValidator.validate(taiat), true);
});

test("antetul declara UTF-8 si namespace-ul lor, si nu are BOM", () => {
  assert.match(ANTET, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(ANTET, /<Catalog xmlns="https:\/\/pepita\.hu\/feed\/1\.0">/);
  assert.notEqual(ANTET.charCodeAt(0), 0xfeff);
});
