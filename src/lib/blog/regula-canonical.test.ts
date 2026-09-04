import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { anuntabil } from "@/app/sitemap";

/*
  ═══ UN TEXT AL CĂRUI ORIGINAL E ÎN ALTĂ PARTE NU SE ANUNȚĂ CA AL NOSTRU ═══

  Regula: un articol cu `canonical_url` completat spune singur că originalul e la
  altcineva. Atunci nu are ce căuta în niciuna din listele prin care noi îl
  arătăm lumii ca fiind al nostru.

  ⚠ REGULA TRĂIEȘTE ÎN DOUĂ LIMBI, ȘI DE AICI VINE PRIMEJDIA.

  Pe 04.09.2026 a fost pusă în TypeScript, în `anuntabil()`, și cablată în sitemap
  și în `llms.txt`. Adică în DOUĂ din cele CINCI liste publice. Celelalte trei
  trăiesc în SQL, ca funcții în bază, și filtrau doar `noindex` — sau, la
  categorii, nici măcar atât. Urmarea, dacă rămânea așa: sitemapul retrăgea
  articolul, iar fluxul RSS îl publica mai departe cu `<guid isPermaLink="true">`
  pe adresa noastră, adică exact afirmația retrasă.

  ⚠ ȘI CELE DOUĂ LIMBI NU TĂIAU ACELAȘI SPAȚIU ALB. Prima scriere a migrației
  folosea `btrim(canonical_url)`, care în Postgres taie DOAR spațiul obișnuit, în
  timp ce `.trim()` din JavaScript taie tot spațiul alb. Un `canonical_url` format
  dintr-un TAB ar fi însemnat lucruri OPUSE în cele două locuri. Măsurat pe bază
  înainte de a fi lăsat așa; lista din SQL e acum chiar mulțimea lui `.trim()`.

  Probele de aici țin cele două limbi împreună: comportamentul, în TypeScript, și
  prezența regulii în FIECARE listă publică, citită din baseline-ul schemei —
  care e un dump al producției, nu o intenție.
*/

const AICI = dirname(fileURLToPath(import.meta.url));
const BASELINE = join(AICI, "..", "..", "..", "migrations", "000-schema-baseline.sql");

/** Corpul unei funcții din baseline, fără antet. */
function corpFunctie(nume: string): string {
  const tot = readFileSync(BASELINE, "utf8").replace(/\r\n/g, "\n");
  const inceput = tot.indexOf(`CREATE OR REPLACE FUNCTION public.${nume}(`);
  assert.notEqual(inceput, -1, `funcția ${nume} nu mai e în baseline`);
  const desch = tot.indexOf("$function$", inceput);
  const inch = tot.indexOf("$function$", desch + 10);
  assert.ok(desch !== -1 && inch !== -1, `corpul lui ${nume} nu se poate citi`);
  return tot.slice(desch + 10, inch);
}

/*
  ═══ CINE POARTĂ REGULA, ȘI CINE NU — CU MOTIVUL ═══

  Regula e despre ce ARĂTĂM MAȘINILOR ca fiind al nostru. Nu e despre ce vede un
  cititor: `noindex` înseamnă „nu indexa", nu „ascunde de oameni", iar un articol
  republicat rămâne o pagină adevărată pe site-ul nostru, pe care vrem s-o poată
  deschide cine ajunge la ea.

  ⚠ ÎMPĂRȚIREA ASTA A FOST ÎNVĂȚATĂ PE PIELEA MEA, în aceeași zi. Pusesem regula
  și pe cele două citiri de mai jos, cu motivul „o rubrică al cărei singur articol
  e `noindex` duce la o pagină goală". Motivul era FALS, verificat abia după ce
  aplicasem: `articoleleCategoriei`, `articoleleAutorului` și `articoleleEtichetei`
  nu filtrează `noindex`, deci pagina chiar arată articolul. Le-am dus înapoi.
*/

/** Citiri MAȘINĂ-facing: regula e obligatorie. */
const CU_REGULA = [
  ["blog_articole_pentru_feed", "fluxul RSS de la /blog/feed, cu guid isPermaLink pe adresa noastră"],
  ["blog_etichete_folosite", "paginile de etichetă din sitemap — nimeni altcineva n-o cheamă"],
] as const;

/**
 * Citiri VIZIBILE pentru cititori: regula NU se aplică, dinadins.
 *
 * Rândul de aici nu e o scutire tăcută — e o hotărâre scrisă. Dacă vreodată se
 * vrea altfel, e o schimbare de conținut cu urmare pe pagină, și se ia cu omul.
 */
const FARA_REGULA = [
  ["blog_categorii_folosite", "navigația rubricilor de pe /blog, văzută de cititori"],
  ["blog_subiectele_autorului", "rândul „Scrie despre: …\" de pe pagina autorului"],
] as const;

const LISTE_SQL = CU_REGULA;

describe("regula, în TypeScript", () => {
  test("un articol curat se anunță", () => {
    assert.equal(anuntabil({}), true);
    assert.equal(anuntabil({ noindex: false, canonical_url: null }), true);
    assert.equal(anuntabil({ canonical_url: undefined }), true);
  });

  test("`noindex` îl scoate", () => {
    assert.equal(anuntabil({ noindex: true }), false);
  });

  test("un canonical către altcineva îl scoate", () => {
    assert.equal(anuntabil({ canonical_url: "https://partener.ro/articolul-x" }), false);
    /* ⚠ Și un canonical care arată chiar spre noi îl scoate, dinadins: câmpul e
       completat DE MÂNĂ și înseamnă „originalul nu e aici". Dacă vreodată se
       vrea altfel, se schimbă în AMBELE limbi deodată. */
    assert.equal(anuntabil({ canonical_url: "https://www.edinio.com/blog/x" }), false);
  });

  test("spațiul alb NU e o adresă canonică — nicio formă a lui", () => {
    /*
      Formele sunt construite din cod: un tab sau un spațiu nedespărțit scris ca
      atare aici ar fi invizibil și l-ar putea pierde orice unealtă care atinge
      fișierul, iar proba ar rămâne verde măsurând alt șir.
    */
    const spatii = [32, 9, 10, 13, 12, 11, 160, 65279].map((c) => String.fromCharCode(c));
    for (const s of spatii) {
      assert.equal(
        anuntabil({ canonical_url: s }),
        true,
        `un canonical format doar din caracterul ${s.charCodeAt(0)} ar trebui socotit gol`,
      );
    }
    assert.equal(anuntabil({ canonical_url: spatii.join("") }), true);
  });
});

describe("aceeași regulă, în SQL, pe FIECARE listă publică", () => {
  for (const [nume, lalce] of LISTE_SQL) {
    test(`${nume} (${lalce})`, () => {
      const corp = corpFunctie(nume);
      assert.match(
        corp,
        /p\.noindex is not true/,
        `${nume} nu mai filtrează articolele scoase dinadins din Google`,
      );
      assert.match(
        corp,
        /p\.canonical_url is null or btrim\(p\.canonical_url,/,
        `${nume} nu mai filtrează articolele al căror original e în altă parte`,
      );
      /*
        ⚠ ȘI CU ACELAȘI SPAȚIU ALB. `btrim()` fără al doilea argument taie doar
        spațiul obișnuit, deci ar fi altă regulă decât `.trim()` din TypeScript.
        Cele trei `chr()` sunt tab vertical, spațiu nedespărțit și BOM — scrise
        așa fiindcă un caracter invizibil într-un `.sql` se pierde tăcut.
      */
      assert.match(
        corp,
        /chr\(11\) \|\| chr\(160\) \|\| chr\(65279\)/,
        `${nume} taie alt spațiu alb decât .trim() din TypeScript`,
      );
    });
  }

  test("nu s-a strecurat o citire publică NOUĂ fără regulă", () => {
    /*
      ⚠ CRITERIUL DEOSEBEȘTE CITIRILE DE SCRIERI, și e ales din ce am măsurat.

      „Citește `blog_posts` și filtrează `status = 'published'`" prinde și
      `blog_creste_citirile` (numărătorul de vizualizări), `blog_o_singura_vitrina`
      (un declanșator) și `blog_salveaza_articol` — toate trei SCRIU, deci n-au ce
      face cu regula asta. Ce le deosebește e antetul: citirile publice sunt
      `LANGUAGE sql` + `STABLE`, scrierile nu.

      O funcție NOUĂ care se potrivește criteriului și nu e în tabelul de sus face
      proba roșie și cere o hotărâre: ori primește regula, ori e trecută acolo cu
      motivul pentru care n-o are.
    */
    const tot = readFileSync(BASELINE, "utf8").replace(/\r\n/g, "\n");
    const publice: string[] = [];
    for (const m of tot.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)) {
      const nume = m[1];
      const antet = tot.slice(m.index!, tot.indexOf("$function$", m.index!));
      const eCitire = /\bLANGUAGE sql\b/.test(antet) && /\bSTABLE\b/.test(antet);
      if (!eCitire) continue;
      const corp = corpFunctie(nume);
      if (corp.includes("blog_posts") && corp.includes("status = 'published'")) publice.push(nume);
    }
    assert.ok(publice.length > 0, "criteriul nu mai găsește nicio citire publică — s-a rupt tăcut");
    const stiute = [...CU_REGULA.map(([n]) => n), ...FARA_REGULA.map(([n]) => n)];
    assert.deepEqual(
      publice.sort(),
      stiute.sort(),
      "s-a găsit o citire publică de articole care nu e nici în CU_REGULA, nici în FARA_REGULA: " +
        "hotărăște care din două și scrie motivul acolo",
    );
  });

  test("cele lăsate dinadins pe dinafară chiar sunt pe dinafară", () => {
    /*
      ⚠ ȘI PARTEA ASTA E O PROBĂ, nu un comentariu. Fără ea, cineva ar putea pune
      regula pe navigația rubricilor „ca la celelalte" — exact ce am făcut eu — și
      nimic n-ar cădea. Ar ascunde de cititori articole pe care le pot deschide.
    */
    for (const [nume, unde] of FARA_REGULA) {
      const corp = corpFunctie(nume);
      assert.doesNotMatch(
        corp,
        /canonical_url/,
        `${nume} (${unde}) a primit regula. E vizibilă pentru cititori: ascunderea ` +
          "unui articol de acolo e o hotărâre de conținut, nu o reparație tehnică.",
      );
    }
  });
});

describe("cele două liste din TypeScript chiar cheamă regula", () => {
  /* Aici scanarea sursei e destul: comportamentul lui `anuntabil` e probat mai
     sus, iar ce se verifică e CABLAREA. Comentariile se scot, ca proba să nu se
     agațe de propriile mele vorbe despre cod. */
  const faraComentarii = (cale: string) =>
    readFileSync(cale, "utf8")
      .replace(/\r\n/g, "\n")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");

  for (const [cale, unde] of [
    [join(AICI, "..", "..", "app", "sitemap.ts"), "sitemap"],
    [join(AICI, "..", "..", "app", "llms.txt", "route.ts"), "llms.txt"],
  ] as [string, string][]) {
    test(unde, () => {
      assert.match(faraComentarii(cale), /\.filter\(anuntabil\)/, `${unde} nu mai filtrează cu anuntabil`);
    });
  }
});
