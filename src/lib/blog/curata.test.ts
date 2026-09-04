import { strict as assert } from "node:assert";
import { test } from "node:test";

import { curataArticol, esteInAfara, relPentruExtern } from "./curata";

/*
  Gazda noastră de imagini vine din mediu, iar `curata` o citește la fiecare
  folosire — tocmai ca rândul de mai jos să însemne ceva. Dacă cineva o mută
  înapoi într-o constantă de modul, probele de aici cad, fiindcă `import` se
  ridică deasupra acestei linii.
*/
process.env.R2_PUBLIC_URL = "https://pub-alnostru.r2.dev";

/*
  Curățătorul blogului se deosebește de cel comun prin TREI alegeri, și fiecare
  se poate pierde tăcut la o modificare viitoare:

  1. Legăturile INTERNE nu primesc `nofollow` — și nici `target`. Dacă cineva le
     pune înapoi „ca la celelalte", blogul nu se strică vizibil, doar încetează
     să mai ajute paginile către care trimite, adică jumătate din motivul lui.

  2. Legăturile din AFARĂ nu mai primesc `nofollow` automat (04.09.2026). O
     trimitere editorială către o sursă contează; `sponsored`, `ugc` și
     `nofollow` se pun doar când le cere redactorul.

  3. Imaginile se acceptă, dar numai de la gazdele noastre. Slăbită, regula
     lasă orice pixel de urmărire într-un articol.

  Probele astea sunt paza acelor trei alegeri.
*/

test("legatura interna ramane curata, fara nofollow", () => {
  const iesit = curataArticol('<p><a href="/preturi">preturi</a></p>');
  assert.ok(iesit.includes('href="/preturi"'));
  assert.ok(!iesit.includes("nofollow"), "legatura interna a primit nofollow");
  assert.ok(!iesit.includes("_blank"), "legatura interna se deschide in fila noua");
});

test("legatura interna scrisa de editor cu nofollow si _blank e CURATATA", () => {
  /*
    ⚠ CHIAR DEFECTUL GASIT PE 04.09.2026. @tiptap/extension-link stampileaza
    implicit `target="_blank" rel="noopener noreferrer nofollow"` pe ORICE
    legatura, inclusiv pe cele interne, iar curatatorul le lasa sa treaca
    neatinse: regula de mai sus era anulata inainte sa ajunga la el.
  */
  const iesit = curataArticol(
    '<p><a target="_blank" rel="noopener noreferrer nofollow" href="/preturi">x</a></p>',
  );
  assert.ok(!iesit.includes("nofollow"), "nofollow-ul editorului a trecut pe o legatura interna");
  assert.ok(!iesit.includes("_blank"), "_blank-ul editorului a trecut pe o legatura interna");
  assert.ok(iesit.includes('href="/preturi"'));
});

test("legatura catre edinio.com scrisa intreg e tot interna", () => {
  const iesit = curataArticol('<p><a href="https://www.edinio.com/preturi">x</a></p>');
  assert.ok(!iesit.includes("nofollow"));
});

test("legatura editoriala in afara: noopener noreferrer, FARA nofollow", () => {
  const iesit = curataArticol('<p><a href="https://example.com">x</a></p>');
  assert.ok(iesit.includes('target="_blank"'));
  // `noopener` nu e cosmetic: fara el, pagina tinta poate rescrie fila noastra.
  assert.ok(iesit.includes("noopener"), "lipseste noopener pe o legatura straina");
  assert.ok(iesit.includes("noreferrer"));
  assert.ok(!iesit.includes("nofollow"), "nofollow s-a intors pe toate legaturile din afara");
});

test("redactorul poate cere sponsored, ugc sau nofollow, si i se pastreaza", () => {
  for (const semnal of ["sponsored", "ugc", "nofollow"]) {
    const iesit = curataArticol(`<p><a rel="${semnal}" href="https://partener.ro/x">x</a></p>`);
    assert.ok(iesit.includes(semnal), `„${semnal}" a fost sters de curatator`);
    assert.ok(iesit.includes("noopener") && iesit.includes("noreferrer"), "baza a disparut");
  }
});

test("un `rel` inventat nu trece; `noopener noreferrer` raman oricum", () => {
  const iesit = curataArticol('<p><a rel="me dofollow orice" href="https://example.com">x</a></p>');
  assert.ok(!iesit.includes("dofollow") && !iesit.includes('rel="me'), "un rel scris la intamplare a trecut");
  assert.match(iesit, /rel="noopener noreferrer"/);
});

test("relPentruExtern: baza mereu, semnalele doar cand sunt cerute, ordine stabila", () => {
  assert.equal(relPentruExtern(undefined), "noopener noreferrer");
  assert.equal(relPentruExtern(""), "noopener noreferrer");
  assert.equal(relPentruExtern("SPONSORED"), "noopener noreferrer sponsored");
  assert.equal(relPentruExtern("nofollow  ugc"), "noopener noreferrer ugc nofollow");
  assert.equal(relPentruExtern("ugc nofollow"), relPentruExtern("nofollow ugc"), "ordinea de scriere schimba iesirea");
  assert.equal(relPentruExtern("noopener noopener"), "noopener noreferrer", "baza s-a dublat");
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
  /* Semnul ca a fost socotita „in afara" nu mai e `nofollow` (nu se mai pune
     automat), ci fila noua plus `noopener`. */
  assert.ok(iesit.includes('target="_blank"'), "a plecat ca legatura interna catre alt domeniu");
  assert.ok(iesit.includes("noopener"));
});

/*
  ═══ BARA INVERSA E O BARA, PENTRU BROWSER ═══

  Parserul WHATWG trateaza `\` exact ca `/` pentru schemele obisnuite, deci
  `/\gazda`, `\\gazda` si `\/gazda` ajung TOATE la `https://gazda/`. Verificarea
  dinainte numara barele de la inceput, iar `/\gazda` nu incepe cu `//`: trecea
  drept adresa locala.

  ⚠ BARA SE CONSTRUIESTE DIN COD, NU SE SCRIE IN SURSA. O bara inversa scrisa
  aici poate fi inghitita de orice unealta care atinge fisierul (o conducta de
  shell, un heredoc, un codemod) — si atunci proba ramane verde masurand alt
  sir decat cel care conteaza. `String.fromCharCode(92)` nu poate fi confundat.
*/
const BARA = String.fromCharCode(92);

const FORME_CU_BARA: [string, string][] = [
  ["/" + BARA, "/" + BARA + "urmaritor.example/pixel.gif"],
  [BARA + BARA, BARA + BARA + "urmaritor.example/pixel.gif"],
  [BARA + "/", BARA + "/urmaritor.example/pixel.gif"],
];

for (const [nume, adresa] of FORME_CU_BARA) {
  test(`o adresa care incepe cu „${nume}” duce in alta parte, deci nu e a noastra`, () => {
    /* Intai se dovedeste PREMISA: browserul chiar o duce la gazda straina.
       Fara randul asta, proba ar apara o regula pe care n-o cere nimeni. */
    assert.equal(
      new URL(adresa, "https://www.edinio.com/blog/un-articol").hostname,
      "urmaritor.example",
      "premisa a cazut: adresa nu mai duce in afara",
    );

    const iesit = curataArticol(`<p><img src="${adresa}" width="1" height="1"></p>`);
    assert.ok(!iesit.includes("urmaritor.example"), `a trecut un pixel de urmarire: ${iesit}`);
    assert.ok(!iesit.includes("<img"), `a ramas un cadru gol: ${iesit}`);

    assert.equal(esteInAfara(adresa), true, "legatura a fost socotita interna");
    const legatura = curataArticol(`<a href="${adresa}">x</a>`);
    assert.ok(
      legatura.includes("noopener") && legatura.includes("noreferrer"),
      `legatura catre alta gazda a plecat fara noopener/noreferrer: ${legatura}`,
    );
  });
}

test("un domeniu care se TERMINA cu edinio.com nu e al nostru", () => {
  // `notedinio.com`.endsWith("edinio.com") e adevarat. Verificarea dinainte il
  // socotea intern: legatura pleca fara `noopener`, si o imagine de acolo ramanea.
  assert.equal(esteInAfara("https://notedinio.com/x"), true);
  assert.equal(esteInAfara("https://edinio.com.atacator.ro/x"), true);
  const iesit = curataArticol('<a href="https://notedinio.com">x</a>');
  assert.ok(iesit.includes('target="_blank"') && iesit.includes("noopener"), "notedinio.com a fost socotit intern");
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

/*
  ── Sarcinile din 2026 ───────────────────────────────────────────────────

  `sanitize-html` 2.17.6 a reparat doua ocoliri care cer ca `svg`/`math` ori
  `textarea`/`xmp` sa fie PERMISE in configuratie. Configuratia articolului nu le
  permite, deci nu suntem atinsi — dar asta e o ALEGERE, nu o lege, si nimic n-o
  pazea. Cineva adauga `svg` pentru o iconita in editor si nimic nu-l opreste.

  ⚠ SE VERIFICA CE IESE, nu ce scrie in lista. O proba care ar citi `allowedTags`
  si ar spune „nu contine svg" ar confirma lista, nu ca sarcina chiar moare.

  ⚠ FRATELE LOR STA IN `src/lib/utils/sanitize-html.test.ts`, si acolo conteaza
  mai mult: prin curatatorul comun trece textul scris de COMERCIANTI.
*/
const SARCINI_2026: [string, string][] = [
  ["svg + textarea", '<svg><textarea><img src=x onerror=alert(1)></textarea></svg>'],
  ["textarea inchis gresit", '<textarea></textarea/><img src=x onerror=alert(1)>'],
  ["math + mglyph", '<math><mglyph><style><img src=x onerror=alert(1)></style></mglyph></math>'],
  ["xmp", '<xmp><img src=x onerror=alert(1)></xmp>'],
];

for (const [nume, sarcina] of SARCINI_2026) {
  test(`sarcina 2026 „${nume}” nu lasa nimic executabil in articol`, () => {
    const out = curataArticol(sarcina);
    assert.ok(!/onerror/i.test(out), `a ramas un manuitor: ${out}`);
    assert.ok(!/<svg/i.test(out), `a ramas svg: ${out}`);
    assert.ok(!/<math/i.test(out), `a ramas math: ${out}`);
    assert.ok(!/<textarea/i.test(out), `a ramas textarea: ${out}`);
    assert.ok(!/<xmp/i.test(out), `a ramas xmp: ${out}`);
  });
}
