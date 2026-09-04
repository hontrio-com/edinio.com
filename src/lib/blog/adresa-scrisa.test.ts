import { strict as assert } from "node:assert";
import { test, describe } from "node:test";

/* Trebuie setat ÎNAINTE de import: `imagini.ts` și `curata.ts` citesc mediul la
   fiecare folosire, dar constanta de aici trebuie să existe deja la prima. */
process.env.R2_PUBLIC_URL = "https://pub-alnostru.r2.dev";

import { curataArticol, esteInAfara } from "./curata";
import { adresaDeImagine } from "./imagini";
import { adresaDeIndemn } from "./indemn";
import { adresaAbsoluta, adresaRezolvata, eCaleInterna, esteEdinio } from "./adresa-scrisa";

/*
  ═══ TREI PORȚI, O SINGURĂ REGULĂ ═══

  Blogul primește adrese scrise de un redactor în trei locuri, și fiecare le
  lăsa să treacă după propria copie a regulii:

    * curățătorul HTML  — `<img src>` din corpul articolului;
    * imaginile         — coperta, imaginea de partajare, avatarul autorului;
    * îndemnul          — `href`-ul butonului din articol.

  Toate trei numărau barele de la începutul șirului. Pe 04.09.2026 a fost reparat
  DOAR curățătorul; celelalte două au rămas deschise încă o rundă, până când o
  revizie adversarială le-a numit. De aceea proba asta trece ACELEAȘI intrări
  prin toate trei: o a patra poartă adăugată fără regulă se vede aici, nu peste
  două luni.

  ⚠ BARA INVERSĂ SE CONSTRUIEȘTE DIN COD. Scrisă ca atare, o poate înghiți orice
  unealtă care atinge fișierul — și atunci proba rămâne verde măsurând alt șir.
*/

const B = String.fromCharCode(92);

type Verdict = {
  /** Rămâne `<img>` în articolul curățat? */
  curata: "pastrata" | "aruncata";
  /** `adresaDeImagine` o primește? */
  imagine: "ok" | "refuz";
  /** `adresaDeIndemn` întoarce o adresă? */
  indemn: "adresa" | "null";
  /** Legătura duce în afară? */
  inAfara: boolean;
};

const CAZURI: [string, string, Verdict][] = [
  /* ─── ce trebuie să treacă ────────────────────────────────────────────── */
  ["cale din public", "/poza.png",
    { curata: "pastrata", imagine: "ok", indemn: "adresa", inAfara: false }],
  ["gazda noastră de imagini", "https://pub-alnostru.r2.dev/x.png",
    { curata: "pastrata", imagine: "ok", indemn: "adresa", inAfara: true }],
  ["edinio.com", "https://www.edinio.com/x.png",
    { curata: "pastrata", imagine: "ok", indemn: "adresa", inAfara: false }],

  /* ─── clasa reparată: bara inversă e o bară, pentru browser ───────────── */
  ["bară inversă după bară", "/" + B + "rau.example/x",
    { curata: "aruncata", imagine: "refuz", indemn: "null", inAfara: true }],
  ["două bare inverse", B + B + "rau.example/x",
    { curata: "aruncata", imagine: "refuz", indemn: "null", inAfara: true }],
  ["bară inversă și bară", B + "/rau.example/x",
    { curata: "aruncata", imagine: "refuz", indemn: "null", inAfara: true }],
  ["protocol moștenit", "//rau.example/x",
    { curata: "aruncata", imagine: "refuz", indemn: "null", inAfara: true }],

  /* ─── a doua clasă, găsită tot atunci: calea fără bară la început ─────── */
  ["relativă, fără bară", "poza.png",
    /* Browserul o cere față de adresa ARTICOLULUI (`/blog/{slug}/poza.png`),
       nu față de rădăcină — deci ca imagine e o adresă ruptă. Ca legătură,
       rămâne totuși la noi, deci nu e „în afară". */
    { curata: "aruncata", imagine: "refuz", indemn: "null", inAfara: false }],
  ["șir gol", "",
    /* ⚠ Un `<img src="">` păstrat ar fi „un cadru gol pe care nimeni nu-l
       observă" — chiar motivul pentru care ramura aruncă imaginea. La imagini,
       golul e ÎNGĂDUIT: amândouă câmpurile sunt opționale. */
    { curata: "aruncata", imagine: "ok", indemn: "null", inAfara: false }],
  ["numai spații", "   ",
    { curata: "aruncata", imagine: "ok", indemn: "null", inAfara: false }],

  /* ─── scheme care n-au ce căuta ───────────────────────────────────────── */
  ["http, nu https", "http://www.edinio.com/x",
    { curata: "aruncata", imagine: "refuz", indemn: "null", inAfara: false }],
  ["javascript:", "javascript:alert(1)",
    { curata: "aruncata", imagine: "refuz", indemn: "null", inAfara: true }],
  ["data:", "data:image/png;base64,iVBOR",
    { curata: "aruncata", imagine: "refuz", indemn: "null", inAfara: true }],
  ["ancoră", "#undeva",
    { curata: "aruncata", imagine: "refuz", indemn: "null", inAfara: false }],

  /* ─── capcana veche: se termină cu edinio.com fără să fie al nostru ───── */
  ["notedinio.com", "https://notedinio.com/x",
    /* ⚠ Îndemnul primește ORICE adresă https, dinadins: un buton poate trimite
       la un partener. Ce nu are voie e să treacă drept CALE INTERNĂ. */
    { curata: "aruncata", imagine: "refuz", indemn: "adresa", inAfara: true }],
  ["gazdă străină https", "https://rau.example/x",
    { curata: "aruncata", imagine: "refuz", indemn: "adresa", inAfara: true }],
];

describe("aceleași intrări, prin toate cele trei porți", () => {
  for (const [eticheta, valoare, astept] of CAZURI) {
    test(eticheta, () => {
      const iesit = curataArticol(`<p><img src="${valoare}" width="1" height="1"></p>`);
      assert.equal(
        iesit.includes("<img") ? "pastrata" : "aruncata",
        astept.curata,
        `curățătorul: ${iesit}`,
      );
      if (astept.curata === "aruncata" && valoare.includes("rau.example")) {
        assert.ok(!iesit.includes("rau.example"), `a rămas gazda străină în articol: ${iesit}`);
      }

      const img = adresaDeImagine(valoare, "Coperta");
      assert.equal(img.ok ? "ok" : "refuz", astept.imagine, `imagini: ${JSON.stringify(img)}`);

      const ind = adresaDeIndemn(valoare);
      assert.equal(ind === null ? "null" : "adresa", astept.indemn, `îndemn: ${JSON.stringify(ind)}`);

      assert.equal(esteInAfara(valoare), astept.inAfara, "esteInAfara");
    });
  }
});

describe("premisa pe care stau toate cele de sus", () => {
  test("browserul chiar duce formele cu bară inversă la gazda străină", () => {
    /* Fără rândul ăsta, probele de mai sus ar apăra o regulă pe care n-o cere
       nimeni. Se măsoară chiar parserul, nu se presupune. */
    for (const forma of ["/" + B, B + B, B + "/"]) {
      const u = new URL(forma + "rau.example/x", "https://www.edinio.com/blog/un-articol");
      assert.equal(u.hostname, "rau.example", `forma ${JSON.stringify(forma)} nu mai duce în afară`);
    }
  });
});

describe("regulile scoase la vedere", () => {
  test("eCaleInterna cere ȘI bară la început, ȘI gazda noastră", () => {
    assert.equal(eCaleInterna("/x"), true);
    assert.equal(eCaleInterna("/" + B + "rau.example"), false, "bara inversă a trecut");
    assert.equal(eCaleInterna("//rau.example"), false);
    assert.equal(eCaleInterna("poza.png"), false, "calea fără bară nu e fără ambiguitate");
    assert.equal(eCaleInterna(""), false);
    assert.equal(eCaleInterna("https://www.edinio.com/x"), false, "o adresă întreagă nu e o cale");
  });

  test("adresaAbsoluta cere schemă proprie, adresaRezolvata nu", () => {
    assert.equal(adresaAbsoluta("poza.png"), null);
    assert.equal(adresaAbsoluta("https://x.ro/y")?.hostname, "x.ro");
    assert.equal(adresaRezolvata("poza.png")?.hostname, "www.edinio.com");
    assert.equal(adresaRezolvata("/" + B + "rau.example")?.hostname, "rau.example");
  });

  test("esteEdinio nu se lasă păcălit de sufix", () => {
    assert.equal(esteEdinio("edinio.com"), true);
    assert.equal(esteEdinio("www.edinio.com"), true);
    assert.equal(esteEdinio("EDINIO.COM"), true);
    assert.equal(esteEdinio("notedinio.com"), false);
    assert.equal(esteEdinio("edinio.com.atacator.ro"), false);
  });
});
