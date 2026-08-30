import { strict as assert } from "node:assert";
import { test } from "node:test";
import { curataArticol, esteInAfara } from "./curata";

/*
  Curățătorul blogului se deosebește de cel comun prin DOUĂ alegeri, și amândouă
  se pot pierde tăcut la o modificare viitoare:

  1. Legăturile INTERNE nu primesc `nofollow`. Dacă cineva le-o pune înapoi
     „ca la celelalte", blogul nu se strică vizibil — doar încetează să mai
     ajute paginile către care trimite, adică jumătate din motivul lui.

  2. Imaginile se acceptă, dar numai de la gazdele noastre. Slăbită, regula
     lasă orice pixel de urmărire într-un articol.

  Probele astea sunt paza acelor două alegeri.
*/

test("legatura interna ramane curata, fara nofollow", () => {
  const iesit = curataArticol('<p><a href="/preturi">preturi</a></p>');
  assert.ok(iesit.includes('href="/preturi"'));
  assert.ok(!iesit.includes("nofollow"), "legatura interna a primit nofollow");
  assert.ok(!iesit.includes("_blank"), "legatura interna se deschide in fila noua");
});

test("legatura catre edinio.com scrisa intreg e tot interna", () => {
  const iesit = curataArticol('<p><a href="https://www.edinio.com/preturi">x</a></p>');
  assert.ok(!iesit.includes("nofollow"));
});

test("legatura in afara primeste nofollow si se deschide separat", () => {
  const iesit = curataArticol('<p><a href="https://example.com">x</a></p>');
  assert.ok(iesit.includes("nofollow"), "lipseste nofollow pe o legatura straina");
  assert.ok(iesit.includes('target="_blank"'));
  // `noopener` nu e cosmetic: fara el, pagina tinta poate rescrie fila noastra.
  assert.ok(iesit.includes("noopener"));
});

test("mailto si tel nu sunt „in afara”", () => {
  assert.equal(esteInAfara("mailto:contact@edinio.com"), false);
  assert.equal(esteInAfara("tel:+40750456809"), false);
  assert.equal(esteInAfara("#o-ancora"), false);
  assert.equal(esteInAfara("/o-cale"), false);
  assert.equal(esteInAfara("https://google.com"), true);
});

test("imaginea de pe gazda noastra trece, si primeste incarcare amanata", () => {
  const iesit = curataArticol('<p><img src="https://ceva.r2.dev/blog/poza.webp" alt="o poza"></p>');
  assert.ok(iesit.includes("poza.webp"), "imaginea noastra a fost aruncata");
  assert.ok(iesit.includes('loading="lazy"'));
  assert.ok(iesit.includes('alt="o poza"'));
});

test("imaginea de pe alt domeniu se arunca intreaga", () => {
  const iesit = curataArticol('<p><img src="https://urmaritor.example/pixel.gif"></p>');
  assert.ok(!iesit.includes("urmaritor.example"), "a ramas o imagine straina");
  // Nu se lasa un `img` fara src: ar fi un cadru gol pe care nu-l observa nimeni.
  assert.ok(!iesit.includes("<img"), "a ramas un img stricat");
});

test("scriptul si stilul dispar, ca la curatatorul comun", () => {
  const iesit = curataArticol('<p>bun</p><script>alert(1)</script><style>p{x}</style>');
  assert.ok(!iesit.includes("<script"));
  assert.ok(!iesit.includes("alert"));
  assert.ok(!iesit.includes("<style"));
  assert.ok(iesit.includes("bun"));
});

test("javascript: intr-un href nu trece", () => {
  const iesit = curataArticol('<a href="javascript:alert(1)">x</a>');
  assert.ok(!iesit.includes("javascript:"));
});

test("`id` scris de om nu supravietuieste curatarii", () => {
  // Ancorele se pun DUPA, din `cuprins.ts`, cu valori facute de noi. Lasat aici,
  // un id scris de mana s-ar putea ciocni cu ceva din restul paginii.
  const iesit = curataArticol('<h2 id="ceva">Titlu</h2>');
  assert.ok(!iesit.includes('id="ceva"'));
});

test("titlurile si structura textului raman", () => {
  const iesit = curataArticol("<h2>T</h2><ul><li>a</li></ul><blockquote>c</blockquote><pre>cod</pre>");
  for (const eticheta of ["<h2>", "<ul>", "<li>", "<blockquote>", "<pre>"]) {
    assert.ok(iesit.includes(eticheta), `s-a pierdut ${eticheta}`);
  }
});
