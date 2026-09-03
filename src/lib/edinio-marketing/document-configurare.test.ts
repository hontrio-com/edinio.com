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
  /*
    ⚠ ANCORA FARA NUMAR, dinadins. Scrisa „Cele 23 care se trag azi:", proba se
    rupea la fiecare eveniment nou instrumentat — si nu fiindca ceva se stricase,
    ci fiindca ea insasi imbatranise. Numarul e verificat oricum de proba
    urmatoare, care il confrunta cu cate trage codul.
  */
  const i = DOC.indexOf("care se trag azi:");
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

test("⚠ documentul avertizeaza despre ciocnirea cu Enhanced Measurement", () => {
  /*
    ⚠ CE APARA. GA4 trage singur `form_start` si `form_submit` pe orice `<form>`
    adevarat, daca „Form interactions" e pornit. Noi tragem manual evenimente cu
    EXACT aceleasi nume — fiindca alea sunt numele standard.

    Deci fiecare completare se numara de doua ori, si cele doua ajung pe acelasi
    rand. Nu e un defect de cod: e o setare din GA4, pe care numai proprietarul o
    poate apasa. Singurul lucru pe care il poate face codul e sa NU-L LASE SA
    UITE.

    ⚠ SI DE CE E O PROBA. Daca maine cineva redenumeste evenimentele noastre,
    avertismentul din document devine fals si trimite omul sa opreasca degeaba o
    masuratoare buna. Proba leaga cele doua: cat timp tragem numele alea, textul
    trebuie sa avertizeze.
  */
  const numeleNoastre = ["form_start", "form_submit"];
  const codSursa = [
    "src/components/website/ContactForm.tsx",
    "src/components/website/sections/migrare/FormularMigrare.tsx",
  ].map((f) => readFileSync(join(RAD, f), "utf8")).join("\n");

  const traseDeNoi = numeleNoastre.filter((n) => codSursa.includes(`name: "${n}"`));
  const doc = DOC;

  if (traseDeNoi.length === 0) {
    /* Daca nu le mai tragem, avertismentul trebuie SCOS — altfel minte in celalalt sens. */
    assert.ok(
      !doc.includes("Form interactions"),
      "documentul cere oprirea unei optiuni care nu se mai ciocneste cu nimic de-al nostru",
    );
    return;
  }

  assert.match(doc, /Form interactions/,
    "tragem `form_start`/`form_submit` dar documentul nu spune sa se opreasca optiunea din GA4");
  assert.match(doc, /Enhanced measurement/i, "documentul nu spune UNDE se apasa");
  assert.match(doc, /Data streams/, "documentul nu spune drumul pana la setare");
});

test("⚠ documentul avertizeaza si despre ciocnirea cu «Site search»", () => {
  /*
    ═══ ⚠ MASURAT IN PRODUCTIE PE 03.09.2026, DUPA CE DOCUMENTUL A MINTIT ═══

    Tabelul din capitolul 3 spunea, pe un rand, ca *Site search* „nu se ciocneste
    cu nimic de-al nostru". E fals in doua feluri:

      1. Enhanced Measurement trage `view_search_results` — chiar numele pe care
         il tragem si noi. Fiecare cautare se numara de doua ori.
      2. Hitul lui poarta `ep.search_term` cu textul brut, plus `dl` si `dt`
         NECURATATE. Adica ocoleste `curataAdresa` si `curataTitlu`, care se
         aplica numai la ce trimitem NOI.

    ⚠ SI DE CE E CEA MAI IMPORTANTA DINTRE AVERTIZARI. Am scos dinadins
    `search_term` din evenimentele noastre. Cat timp comutatorul e pornit,
    scoaterea aia nu apara nimic: Google aduna textul oricum, pe langa codul
    nostru. O reparatie care pare facuta si nu apara nimic e mai rea decat una
    lipsa, fiindca nimeni nu se mai uita la ea.
  */
  const doc = DOC;
  const tragemCautarea = evenimenteTrase().has("view_search_results");

  if (!tragemCautarea) {
    assert.ok(!doc.includes("Site search"),
      "documentul cere oprirea unei optiuni care nu se mai ciocneste cu nimic de-al nostru");
    return;
  }

  assert.match(doc, /Site search/, "tragem `view_search_results` dar documentul nu cere oprirea optiunii GA4");

  /*
    ═══ ⚠ SE TAIE CHIAR SECTIUNEA, nu se cauta in tot documentul ═══

    Prima forma cerea `/Enhanced measurement/i` pe intreg textul — si trecea verde
    peste mutantul pe care era scrisa: am scos drumul pana la setare din sectiunea
    asta, iar potrivirea a cazut pe sectiunea despre *Form interactions*, aflata
    mai sus.

    E aceeasi lectie pe care fisierul asta o are deja scrisa la `listaDinDocument`:
    „e scris undeva in document" nu e acelasi lucru cu „e scris unde trebuie".
  */
  const iSectiune = doc.indexOf("Căutarea pe site");
  assert.ok(iSectiune > 0, "sectiunea despre cautarea pe site a disparut din document");
  const urmatoare = doc.indexOf(String.fromCharCode(10) + "---", iSectiune);
  const sectiune = doc.slice(iSectiune, urmatoare > 0 ? urmatoare : doc.length);

  assert.match(sectiune, /oprește|pe OFF/i, "sectiunea pomeneste optiunea dar nu spune ce sa faca cu ea");
  assert.match(sectiune, /Enhanced measurement/i, "sectiunea nu spune UNDE se apasa");
  assert.match(sectiune, /Data streams/, "sectiunea nu spune drumul pana la setare");

  /*
    ⚠ SI CA MOTIVUL E SCRIS, cu numele campului. Un comutator cerut fara motiv se
    reporneste peste sase luni de cine „face curat prin setari".

    ⚠ PRIMA FORMA CEREA `/ep\.search_term|search_term/` — si trecea verde peste
    chiar mutantul pe care era scrisa: am scos numele campului din motiv, iar
    alternativa `search_term` s-a potrivit pe alt rand al aceluiasi document.
    O alternativa larga intr-un regex e un fel de a nu cere nimic.
  */
  assert.ok(doc.includes("ep.search_term"),
    "documentul nu spune CE camp aduna Google pe langa noi, deci sfatul pare o toana");

  /*
    ═══ ⚠ SI TABELUL NU ARE VOIE SA SPUNA PE DOS ═══

    Avertizarea de mai sus a fost scrisa TOCMAI fiindca un rand din tabel spunea
    „nu se ciocneste cu nimic de-al nostru". Daca randul se intoarce, documentul
    se contrazice singur — iar cine citeste tabelul si nu ajunge la sectiune
    pleaca exact cu sfatul gresit.
  */
  const iTabel = doc.indexOf("| *Site search*");
  assert.ok(iTabel > 0, "randul din tabel a disparut cu totul");
  const randul = doc.slice(iTabel, doc.indexOf(String.fromCharCode(10), iTabel));
  assert.ok(!/[Nn]u se ciocne/.test(randul),
    "tabelul spune ca *Site search* nu se ciocneste, desi trage chiar numele nostru cu textul brut");
});

test("⚠ si codul NOSTRU chiar nu mai trimite textul cautat", () => {
  /*
    ⚠ CUTITUL TAIE IN AMANDOUA PARTILE. Daca maine cineva pune la loc
    `search_term` in evenimentul nostru, avertizarea de mai sus devine
    incompleta — si probele n-ar spune nimic.
  */
  const sursa = ["src/components/edinio-marketing/UrmaCautare.tsx",
                 "src/components/website/ajutor/CautareGhiduri.tsx"]
    .map((f) => readFileSync(join(RAD, f), "utf8")).join(String.fromCharCode(10));
  assert.ok(!sursa.includes("search_term"),
    "un component a inceput iar sa trimita textul cautat catre furnizori");
});
