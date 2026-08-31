import { strict as assert } from "node:assert";
import { test } from "node:test";

import { sanitizeHtml } from "./sanitize-html";

/*
  ═══════════════════════════════════════════════════════════════════════════
  CURĂȚĂTORUL COMUN N-AVEA NICIO PROBĂ (31.08.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Un audit extern cerea probe de regresie pentru curățătorul BLOGULUI. Căutându-le,
  am găsit ceva mai supărător: `curata.test.ts` există și are 17 probe, iar
  `sanitize-html.ts` — cel prin care trece textul scris de COMERCIANȚI — n-avea
  niciun fișier de probă, nicăieri.

  ⚠ ORDINEA E PE DOS FAȚĂ DE RISC. Articolele de blog le scriem noi, dintr-un
  panou la care ajung doi oameni. Descrierile de produse și paginile de magazin le
  scriu sute de comercianți, iar unii importă text de la furnizori pe care nu i-am
  văzut niciodată. Autorul cu adevărat necunoscut scrie prin funcția asta.

  Ce iese de aici ajunge în `dangerouslySetInnerHTML` pe vitrine publice.
*/

const CURAT = (html: string) => sanitizeHtml(html);

/* ── Ce trebuie să treacă: text obișnuit de magazin ─────────────────────── */

test("textul obisnuit de descriere trece intreg", () => {
  const out = CURAT("<p>Bumbac <strong>100%</strong>, spalare la <em>30°</em>.</p>");
  assert.match(out, /Bumbac/);
  assert.match(out, /<strong>100%<\/strong>/);
  assert.match(out, /<em>30°<\/em>/);
});

test("listele si titlurile raman", () => {
  const out = CURAT("<h3>Marimi</h3><ul><li>S</li><li>M</li></ul>");
  assert.match(out, /<h3>Marimi<\/h3>/);
  assert.match(out, /<li>S<\/li>/);
});

/* ── Ce nu are voie să treacă ───────────────────────────────────────────── */

test("scriptul dispare cu tot cu continut", () => {
  const out = CURAT('<p>bun</p><script>fetch("/api/x")</script>');
  assert.ok(!/script/i.test(out), out);
  assert.ok(!/fetch/.test(out), out);
});

test("un manuitor de eveniment nu supravietuieste", () => {
  const out = CURAT('<p onclick="alert(1)">text</p>');
  assert.ok(!/onclick/i.test(out), out);
  assert.match(out, /text/);
});

test("javascript: intr-un href nu trece", () => {
  const out = CURAT('<a href="javascript:alert(1)">apasa</a>');
  assert.ok(!/javascript:/i.test(out), out);
});

test("iframe-ul nu trece prin curatatorul comun", () => {
  const out = CURAT('<iframe src="https://exemplu.ro"></iframe>');
  assert.ok(!/iframe/i.test(out), out);
});

/*
  ── Sarcinile din 2026 ───────────────────────────────────────────────────

  `sanitize-html` 2.17.6 a reparat două ocoliri care cer ca `svg`/`math` ori
  `textarea`/`xmp` să fie PERMISE în configurație. Ale noastre nu le permit —
  am numărat toate cele patru configurații din depozit și niciuna nu le are.

  ⚠ PROBELE ASTEA NU PAZESC O GAURĂ DESCHISĂ, PAZESC O ALEGERE. „Nu suntem
  atinși fiindcă nu permitem etichetele alea" e adevărat azi și e o presupunere
  mâine: cineva adaugă `svg` pentru o iconiță și nimic nu-l oprește. Atunci
  probele astea cad, înainte ca sanitizerul să fie slăbit în tăcere.

  ⚠ CE VERIFICĂ E REZULTATUL, NU LISTA. O probă care ar citi `allowedTags` și ar
  spune „nu conține svg" ar fi tautologică: ar confirma ce scrie în listă, nu că
  sarcina chiar moare. Astea trec sarcina prin funcție și se uită la ce iese.
*/

const SARCINI_2026: [string, string][] = [
  ["svg + textarea", '<svg><textarea><img src=x onerror=alert(1)></textarea></svg>'],
  ["textarea inchis gresit", '<textarea></textarea/><img src=x onerror=alert(1)>'],
  ["math + mglyph", '<math><mglyph><style><img src=x onerror=alert(1)></style></mglyph></math>'],
  ["xmp", '<xmp><img src=x onerror=alert(1)></xmp>'],
];

for (const [nume, sarcina] of SARCINI_2026) {
  test(`sarcina 2026 „${nume}” nu lasa nimic executabil`, () => {
    const out = CURAT(sarcina);
    assert.ok(!/onerror/i.test(out), `a ramas un manuitor: ${out}`);
    assert.ok(!/<svg/i.test(out), `a ramas svg: ${out}`);
    assert.ok(!/<math/i.test(out), `a ramas math: ${out}`);
    assert.ok(!/<textarea/i.test(out), `a ramas textarea: ${out}`);
    assert.ok(!/<xmp/i.test(out), `a ramas xmp: ${out}`);
  });
}

/*
  ⚠ MARTORUL. Fără el, probele de mai sus ar trece și pe o funcție care întoarce
  mereu șirul gol — adică ar fi verzi tocmai când sanitizerul e cel mai stricat.
  Rândul ăsta cere ca funcția să lase CEVA în urmă când e text bun.
*/
test("martor: curatatorul nu inghite tot", () => {
  const out = CURAT("<p>ramane</p>");
  assert.match(out, /ramane/);
});
