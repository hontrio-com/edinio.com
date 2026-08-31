import { strict as assert } from "node:assert";
import { test } from "node:test";

import { indreaptaInchiderile } from "./inchideri-malformate";
import { sanitizeEmbedHtml } from "./sanitize-embed";
import { sanitizeHtml } from "./sanitize-html";

/*
  ═══════════════════════════════════════════════════════════════════════════
  ÎNCHIDEREA CU BARĂ TRECEA `onerror` ȘI `<script>` (31.08.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Măsurat pe pachetul instalat, cu opțiunile reale:

      <style>a{}</style/><img src=x onerror=alert(1)>
      → <style>a{}</style/><img src=x onerror=alert(1)></style>

  Neatins. `htmlparser2` nu socotește `</style/>` drept închidere, deci restul
  rămâne „text brut" și iese verbatim — dar browserul O socotește închidere, deci
  în pagină devine un `<img>` cu manipulator viu.

  ⚠ PROBELE TREC PRIN CURĂȚĂTOARELE ADEVĂRATE, nu prin `indreaptaInchiderile`
  singură. O probă care ar verifica doar că șirul s-a schimbat ar dovedi că un
  regex funcționează, nu că pagina omului e curată — și tocmai a doua contează.
*/

/** Markup VIU, nu text escapat: `&lt;img onerror=…&gt;` se afișează, nu rulează. */
function ceva_viu_periculos(iesire: string): boolean {
  const fara_entitati = iesire.replace(/&lt;/g, "").replace(/&gt;/g, "");
  return /<script|on(error|load|click|focus)\s*=/i.test(fara_entitati);
}

const ATACURI: [string, string][] = [
  ["style + bară", '<style>a{}</style/><img src=x onerror=alert(1)>'],
  ["style + script", '<style>a{}</style/><script>alert(1)</script>'],
  ["style cu majuscule", '<style>a{}</STYLE/><img src=x onerror=alert(1)>'],
  ["style cu spațiu înainte de bară", '<style>a{}</style /><img src=x onerror=alert(1)>'],
  ["textarea + bară", '<textarea></textarea/><img src=x onerror=alert(1)>'],
  ["xmp + bară", '<xmp></xmp/><img src=x onerror=alert(1)>'],
];

for (const [nume, sarcina] of ATACURI) {
  test(`„${nume}” nu lasă markup viu prin sanitizerul de încorporare`, () => {
    const out = sanitizeEmbedHtml(sarcina);
    assert.ok(!ceva_viu_periculos(out), `a trecut ceva viu: ${out}`);
  });

  test(`„${nume}” nu lasă markup viu prin sanitizerul comun`, () => {
    const out = sanitizeHtml(sarcina);
    assert.ok(!ceva_viu_periculos(out), `a trecut ceva viu: ${out}`);
  });
}

/*
  ⚠ MARTORII. Fără ei, probele de sus ar fi verzi și pe o funcție care întoarce
  mereu șirul gol — adică exact când curățătorul e cel mai stricat. Și tot ei
  păzesc ce s-ar putea pierde din greșeală: normalizarea atinge închiderile, iar
  o variantă prea lacomă ar strica CSS-ul comercianților.
*/

test("martor: textul obișnuit trece întreg", () => {
  const out = sanitizeEmbedHtml("<p>Salut <strong>lume</strong></p>");
  assert.match(out, /<p>Salut <strong>lume<\/strong><\/p>/);
});

test("martor: un bloc `style` scris corect rămâne", () => {
  const out = sanitizeEmbedHtml("<style>.a{color:red}</style><p>x</p>");
  assert.match(out, /<style>\.a\{color:red\}<\/style>/);
  assert.match(out, /<p>x<\/p>/);
});

test("martor: CSS care CONȚINE o închidere nu e stricat", () => {
  /*
    ⚠ Ăsta e motivul pentru care tiparul cere bara. Un tipar care ar îndrepta
    TOATE închiderile ar fi rescris și textul dinăuntrul CSS-ului, adică ar fi
    schimbat pagina comerciantului ca să repare o gaură care nici nu e aici.
  */
  const sursa = '<style>a::before{content:"</div>"}</style><p>x</p>';
  assert.equal(indreaptaInchiderile(sursa), sursa, "normalizarea a atins CSS nevinovat");
});

test("martor: tabelele și legăturile rămân", () => {
  assert.match(sanitizeEmbedHtml('<table><tr><td colspan="2">x</td></tr></table>'), /colspan="2"/);
  assert.match(sanitizeEmbedHtml('<a href="https://exemplu.ro">c</a>'), /href="https:\/\/exemplu\.ro"/);
});

/* ── Ce face normalizarea, luată singură ────────────────────────────────── */

test("îndreaptă doar închiderile cu bară, nu pe celelalte", () => {
  assert.equal(indreaptaInchiderile("<p>x</p>"), "<p>x</p>");
  assert.equal(indreaptaInchiderile("<style>a{}</style/>"), "<style>a{}</style>");
  assert.equal(indreaptaInchiderile("<style>a{}</style />"), "<style>a{}</style>");
  assert.equal(indreaptaInchiderile("<br/>"), "<br/>", "o eticheta care se inchide singura nu e o inchidere");
});

test("nu poate naște markup nou", () => {
  /* Înlocuirea scrie mereu `</nume>`, deci numărul de `<` nu poate crește. */
  for (const s of ["<style>a{}</style/><img src=x>", "</a /><b>", "</a onclick='x'/>"]) {
    const inainte = (s.match(/</g) ?? []).length;
    const dupa = (indreaptaInchiderile(s).match(/</g) ?? []).length;
    assert.ok(dupa <= inainte, `a crescut numarul de „<”: ${s} → ${indreaptaInchiderile(s)}`);
  }
});
