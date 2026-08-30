import { strict as assert } from "node:assert";
import { test } from "node:test";

import { curataArticol, esteInAfara } from "./curata";

/*
  Gazda noastră de imagini vine din mediu, iar `curata` o citește la fiecare
  folosire — tocmai ca rândul de mai jos să însemne ceva. Dacă cineva o mută
  înapoi într-o constantă de modul, probele de aici cad, fiindcă `import` se
  ridică deasupra acestei linii.
*/
process.env.R2_PUBLIC_URL = "https://pub-alnostru.r2.dev";

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
  const iesit = curataArticol('<p><img src="https://pub-alnostru.r2.dev/blog/poza.webp" alt="o poza"></p>');
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

/*
  ═══ GĂURILE GĂSITE LA AUDITUL DIN 30.08.2026 ═══

  Trei constatări, toate confirmate de un verificator advers care a citit codul.
  Fiecare era o linie greșită cu urmări reale.
*/

test("o adresa cu protocol mostenit nu e „a noastra”", () => {
  // `//gazda.straina/pixel.png` incepe cu "/" si trecea de verificarea care se
  // uita doar la primul caracter. Adica un pixel de urmarire scris asa intra in
  // articol si incarca adresa IP a fiecarui cititor la cine il serveste.
  const iesit = curataArticol('<p><img src="//urmaritor.example/pixel.gif"></p>');
  assert.ok(!iesit.includes("urmaritor.example"), "a trecut un pixel de urmarire");
  assert.ok(!iesit.includes("<img"));
});

test("o legatura cu protocol mostenit e socotita in afara", () => {
  assert.equal(esteInAfara("//google.com/ceva"), true);
  const iesit = curataArticol('<a href="//google.com">x</a>');
  assert.ok(iesit.includes("nofollow"), "a plecat fara nofollow catre alt domeniu");
});

test("un domeniu care se TERMINA cu edinio.com nu e al nostru", () => {
  // `notedinio.com`.endsWith("edinio.com") e adevarat. Verificarea dinainte il
  // socotea intern: legatura pleca dofollow, si o imagine de acolo ramanea.
  assert.equal(esteInAfara("https://notedinio.com/x"), true);
  assert.equal(esteInAfara("https://edinio.com.atacator.ro/x"), true);
  const iesit = curataArticol('<a href="https://notedinio.com">x</a>');
  assert.ok(iesit.includes("nofollow"), "notedinio.com a fost socotit intern");
});

test("domeniul nostru si subdomeniile lui raman interne", () => {
  assert.equal(esteInAfara("https://edinio.com/preturi"), false);
  assert.equal(esteInAfara("https://www.edinio.com/preturi"), false);
  assert.equal(esteInAfara("https://ajutor.edinio.com/x"), false);
});

test("h1 din corpul articolului coboara la h2", () => {
  // Bara editorului are un buton „Titlu mare" care punea `h1`. Cuprinsul citeste
  // doar h2 si h3, deci autorul care isi structura firesc articolul cu el ramanea
  // fara cuprins, fara niciun semn. Si pagina are deja un h1, pus de PageHero.
  const iesit = curataArticol("<h1>Titlu mare</h1><p>text</p>");
  assert.ok(iesit.includes("<h2>Titlu mare</h2>"), `n-a coborat: ${iesit}`);
  assert.ok(!iesit.includes("<h1"), "a ramas un al doilea h1 in pagina");
});

/*
  ⚠ ACEASTA E PROBA CARE ÎNLOCUIEȘTE O UȘĂ DESCHISĂ, nu una care descrie codul.

  Până pe 30.08.2026 regula era `hostname.endsWith(".r2.dev")`. `r2.dev` e
  domeniul public pe care Cloudflare îl dă ORICĂREI găleți, a oricui — deci
  regula spunea, de fapt, „imaginile oricui are cont de Cloudflare". Proba de
  deasupra trecea vesel, fiindcă folosea chiar o gazdă străină drept „a noastră".

  Aceasta cade dacă metacaracterul se întoarce.
*/
test("o galeata R2 straina NU e a noastra, desi se termina in .r2.dev", () => {
  const iesit = curataArticol('<p><img src="https://pub-alcuiva.r2.dev/pixel.gif"></p>');
  assert.ok(!iesit.includes("pub-alcuiva"), "a trecut o galeata R2 straina");
  assert.ok(!iesit.includes("<img"), "a ramas un img stricat");
});

test("un domeniu care se termina in edinio.com nu e edinio.com", () => {
  assert.equal(esteInAfara("https://notedinio.com/ceva"), true);
  assert.equal(esteInAfara("https://blog.edinio.com/ceva"), false);
});
