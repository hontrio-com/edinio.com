import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CONVERSII } from "./evenimente";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  DOCUMENTUL DE CONFIGURARE NU ARE VOIE SA IMBATRANEASCA IN TACERE
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DE CE EXISTA PROBA ASTA. `EDINIO_MARKETING_ANALYTICS_SETUP.md` e citit de om
  cu interfata GA4 deschisa alaturi. El spune cate evenimente se trag si care sunt
  conversiile — adica exact ce bifeaza omul acolo.

  Iar prima forma a documentului spunea „34 de nume, trimise din cod". Numarul era
  al TAXONOMIEI; trase erau 23. Unsprezece nume erau declarate si netrase de
  nicaieri, iar cine ar fi urmat documentul si-ar fi ocupat locuri din cele 50 de
  dimensiuni personalizate cu parametri care nu sosesc niciodata.

  L-am prins numarand, nu citind. De aici incolo il numara proba.
*/

const RAD = process.cwd();
const DOC = readFileSync(join(RAD, "EDINIO_MARKETING_ANALYTICS_SETUP.md"), "utf8");

/** Numele evenimentelor pe care le trage cineva, chiar, din cod. */
function evenimenteTrase(): Set<string> {
  const gasite = new Set<string>();
  const mers = (dir: string) => {
    for (const it of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, it.name);
      if (it.isDirectory()) { mers(p); continue; }
      if (!/\.tsx?$/.test(it.name) || /\.test\.tsx?$/.test(it.name)) continue;
      const s = readFileSync(p, "utf8");
      for (const m of s.matchAll(/urmareste\(\{\s*name:\s*"([a-z_]+)"/g)) gasite.add(m[1]);
    }
  };
  mers(join(RAD, "src"));
  return gasite;
}

test("⚠ documentul spune cate evenimente se trag, si numarul e adevarat", () => {
  const trase = evenimenteTrase();

  const m = DOC.match(/\|\s*Evenimente\s*\|\s*\*\*(\d+)\*\*\s*de nume/);
  assert.ok(m, "documentul nu mai spune cate evenimente se trag");
  assert.equal(
    Number(m[1]), trase.size,
    `documentul spune ${m[1]} evenimente, codul trage ${trase.size}. ` +
    "Actualizeaza tabelul din capitolul 0 si lista de sub el.",
  );
});

/**
 * Lista de evenimente trase, asa cum o scrie documentul.
 *
 * ⚠ SE TAIE EXACT BUCATA AIA. O cautare in tot documentul ar fi trecut verde
 * peste chiar mutantul pe care proba e scrisa sa-l prinda: am pus codul sa traga
 * `faq_open` in loc de `landing_view`, si proba n-a cazut — fiindca `faq_open`
 * e pomenit mai jos, tocmai pe lista celor care NU se trag.
 *
 * „E scris undeva in document" nu e acelasi lucru cu „e scris unde trebuie".
 */
function listaDinDocument(): Set<string> {
  const i = DOC.indexOf("Cele 23 care se trag azi:");
  const j = DOC.indexOf("nume declarate dar netrase");
  assert.ok(i > 0 && j > i, "nu mai gasesc lista de evenimente trase din document");
  return new Set((DOC.slice(i, j).match(/`([a-z_]+)`/g) ?? []).map(x => x.replace(/`/g, "")));
}

test("⚠ fiecare eveniment tras e si numit in LISTA din document", () => {
  /*
    Numarul singur nu e de ajuns: doua schimbari care se anuleaza (unul scos,
    altul adaugat) l-ar lasa neatins, iar lista ar fi gresita pe doua randuri.
  */
  const inDocument = listaDinDocument();
  const trase = evenimenteTrase();

  for (const nume of trase) {
    assert.ok(inDocument.has(nume), `evenimentul "${nume}" se trage din cod dar nu e in lista din document`);
  }
  for (const nume of inDocument) {
    assert.ok(trase.has(nume), `documentul spune ca "${nume}" se trage, dar nimeni nu-l trage`);
  }
});

test("⚠ nota despre evenimentele NEtrase nu numeste unul care se trage", () => {
  /*
    Nota aia spune „nu le face dimensiuni in GA4, n-ar aduna nimic". Daca vreunul
    din ele incepe intre timp sa se traga, sfatul devine gresit exact pe dos: omul
    ar rata o dimensiune care chiar aduna date.
  */
  const i = DOC.indexOf("nume declarate dar netrase");
  const nota = DOC.slice(i, i + 400);
  const trase = evenimenteTrase();
  for (const m of nota.match(/`([a-z_]+)`/g) ?? []) {
    const nume = m.replace(/`/g, "");
    assert.ok(!trase.has(nume), `"${nume}" e dat ca netras in document, dar codul il trage`);
  }
});

test("⚠ conversiile din document sunt CHIAR cele din cod", () => {
  /*
    Alea patru se bifeaza de mana in GA4 ca „key event". O nepotrivire aici
    inseamna ca cineva bifeaza gresit — iar optimizarea campaniilor invata pe
    semnalul gresit, si costa bani pana observa cineva.
  */
  const capitol = DOC.slice(DOC.indexOf("## 2."), DOC.indexOf("## 3."));
  for (const c of CONVERSII) {
    assert.ok(capitol.includes(`\`${c}\``), `conversia "${c}" lipseste din capitolul de evenimente-cheie`);
  }
  const numite = new Set(capitol.match(/`([a-z_]+)`/g)?.map(x => x.replace(/`/g, "")) ?? []);
  for (const n of numite) {
    assert.ok(
      (CONVERSII as readonly string[]).includes(n),
      `documentul cere bifat "${n}" ca eveniment-cheie, dar codul nu-l socoteste conversie`,
    );
  }
});
