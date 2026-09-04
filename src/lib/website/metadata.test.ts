import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { OG_IMAGINE, SITE_URL, siteMetadata } from "./metadata";

/*
  ═══ FIECARE PAGINĂ ÎȘI SPUNE SINGURĂ CINE E ═══

  Next NU îmbină în adâncime `openGraph` și `twitter`: un segment care le
  declară înlocuiește integral ce a pus rădăcina. Măsurat în producție pe
  04.09.2026, asta însemna:

    * pe cele 24 de pagini care trec prin `siteMetadata` lipseau `og:image`,
      `og:site_name`, `og:locale` și `og:type` — helperul declara `openGraph`
      fără ele;
    * `twitter:title` și `twitter:description` erau ale PAGINII DE START pe
      fiecare pagină de prețuri, de comparație, de ajutor și pe fiecare articol,
      fiindcă helperul nu declara `twitter` deloc și se moștenea blocul rădăcinii.

  Nimic nu cădea: previzualizarea socială e singurul loc unde se vede, și numai
  când cineva chiar distribuie adresa.
*/

const AICI = dirname(fileURLToPath(import.meta.url));
const APP = join(AICI, "..", "..", "app");

const META = siteMetadata({ title: "Prețuri", description: "Descrierea paginii de prețuri.", path: "/preturi" });

/** Sursa fără comentarii, ca proba să se agațe de cod, nu de vorbele despre el. */
function sursaFaraComentarii(cale: string): string {
  return readFileSync(cale, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

function fisiereSub(dir: string): string[] {
  const out: string[] = [];
  for (const nume of readdirSync(dir)) {
    const cale = join(dir, nume);
    if (statSync(cale).isDirectory()) out.push(...fisiereSub(cale));
    else if (/\.tsx?$/.test(nume) && !/\.test\.tsx?$/.test(nume)) out.push(cale);
  }
  return out;
}

describe("openGraph, întreg pe fiecare pagină", () => {
  test("titlul, descrierea și adresa sunt ale paginii", () => {
    const og = META.openGraph as Record<string, unknown>;
    assert.equal(og.title, "Prețuri | Edinio");
    assert.equal(og.description, "Descrierea paginii de prețuri.");
    assert.equal(og.url, `${SITE_URL}/preturi`);
  });

  test("imaginea, numele site-ului, limba și tipul NU se mai pierd", () => {
    const og = META.openGraph as Record<string, unknown>;
    assert.equal(og.siteName, "Edinio");
    assert.equal(og.locale, "ro_RO");
    assert.equal(og.type, "website");
    assert.deepEqual(og.images, [{ ...OG_IMAGINE }], "og:image lipsește sau nu mai are dimensiuni");
  });

  test("canonicalul rămâne absolut, pe www", () => {
    assert.equal((META.alternates as { canonical?: string }).canonical, `${SITE_URL}/preturi`);
  });
});

describe("twitter, cu textele paginii", () => {
  test("titlul și descrierea NU mai sunt ale paginii de start", () => {
    const tw = META.twitter as Record<string, unknown>;
    assert.equal(tw.title, "Prețuri | Edinio");
    assert.equal(tw.description, "Descrierea paginii de prețuri.");
    assert.notEqual(tw.title, "Creare magazin online rapid | Edinio");
  });

  test("cardul și imaginea sunt declarate, nu moștenite", () => {
    const tw = META.twitter as Record<string, unknown>;
    assert.equal(tw.card, "summary_large_image");
    assert.deepEqual(tw.images, [OG_IMAGINE.url]);
  });
});

describe("imaginea proprie a paginii", () => {
  const CU_POZA = siteMetadata({
    title: "Un articol",
    description: "Rezumatul lui.",
    path: "/blog/un-articol",
    imagine: "https://edinio-cdn.com/gallery/x/blog/coperta.webp",
  });

  test("intră și în og:image, și în twitter:image", () => {
    /* ⚠ Chiar defectul măsurat pe articole: og:image era coperta, iar
       twitter:image rămânea bannerul generic, deci pe X ieșea poza platformei. */
    const og = CU_POZA.openGraph as Record<string, unknown>;
    const tw = CU_POZA.twitter as Record<string, unknown>;
    assert.deepEqual(og.images, [{ url: "https://edinio-cdn.com/gallery/x/blog/coperta.webp" }]);
    assert.deepEqual(tw.images, ["https://edinio-cdn.com/gallery/x/blog/coperta.webp"]);
  });

  test("o imagine goală cade pe bannerul mărcii, nu pe „nicio imagine”", () => {
    for (const goala of [null, undefined, "", "   "]) {
      const m = siteMetadata({ title: "T", description: "D", path: "/x", imagine: goala });
      assert.deepEqual((m.openGraph as Record<string, unknown>).images, [{ ...OG_IMAGINE }], `imagine=${JSON.stringify(goala)}`);
    }
  });
});

describe("articolele se declară `article`", () => {
  const ARTICOL = siteMetadata({
    title: "Un articol",
    description: "Rezumat.",
    path: "/blog/un-articol",
    articol: { publicatLa: "2026-09-01T11:59:00Z", modificatLa: "2026-09-01T12:15:05Z", rubrica: "Marketing" },
  });

  test("tipul, datele și rubrica ajung în openGraph", () => {
    const og = ARTICOL.openGraph as Record<string, unknown>;
    assert.equal(og.type, "article");
    assert.equal(og.publishedTime, "2026-09-01T11:59:00Z");
    assert.equal(og.modifiedTime, "2026-09-01T12:15:05Z");
    assert.equal(og.section, "Marketing");
  });

  test("câmpurile lipsă nu se inventează", () => {
    const og = siteMetadata({ title: "T", description: "D", path: "/x", articol: {} }).openGraph as Record<string, unknown>;
    assert.equal(og.type, "article");
    for (const cheie of ["publishedTime", "modifiedTime", "section"]) {
      assert.ok(!(cheie in og), `„${cheie}" a fost emis gol`);
    }
  });

  test("un articol CU COPERTĂ păstrează și restul obiectului", () => {
    /*
      ⚠ COMBINAȚIA ASTA E CHIAR CEA DIN PRODUCȚIE, și până pe 04.09.2026 nu era
      probată de nimeni: `blog/[slug]/page.tsx` cheamă `siteMetadata({ imagine,
      articol })` — cu AMÂNDOUĂ. Probele de deasupra le încercau pe rând, deci
      ramura `articol` nu era niciodată citită pentru `images`, `siteName` și
      `locale`.

      Măsurat: scoțând `...comun` din ramura `articol`, toate cele 12 probe
      rămâneau verzi, iar fiecare articol ar fi ieșit pe Facebook FĂRĂ nicio
      poză — mai rău decât defectul reparat, fiindcă înainte coperta măcar
      ajungea pe `og:image`.
    */
    const m = siteMetadata({
      title: "Un articol",
      description: "Rezumatul lui.",
      path: "/blog/un-articol",
      imagine: "https://edinio-cdn.com/gallery/x/blog/coperta.webp",
      articol: { publicatLa: "2026-09-01T11:59:00Z", modificatLa: "2026-09-01T12:15:05Z", rubrica: "Marketing" },
    });
    const og = m.openGraph as Record<string, unknown>;
    const tw = m.twitter as Record<string, unknown>;

    /* Ce aduce ramura de articol. */
    assert.equal(og.type, "article");
    assert.equal(og.publishedTime, "2026-09-01T11:59:00Z");
    assert.equal(og.modifiedTime, "2026-09-01T12:15:05Z");
    assert.equal(og.section, "Marketing");

    /* Ce NU are voie să dispară odată cu ea. */
    assert.deepEqual(og.images, [{ url: "https://edinio-cdn.com/gallery/x/blog/coperta.webp" }], "articolul a rămas fără og:image");
    assert.equal(og.siteName, "Edinio", "articolul a rămas fără og:site_name");
    assert.equal(og.locale, "ro_RO", "articolul a rămas fără og:locale");
    assert.equal(og.title, "Un articol | Edinio");
    assert.equal(og.description, "Rezumatul lui.");
    assert.equal(og.url, `${SITE_URL}/blog/un-articol`);
    assert.deepEqual(tw.images, ["https://edinio-cdn.com/gallery/x/blog/coperta.webp"]);

    /* Aceleași chei ca pe ramura de pagină, plus cele patru ale articolului.
       Așa, o cheie pierdută pe o singură ramură nu poate trece neobservată. */
    const cheiPagina = Object.keys(siteMetadata({ title: "T", description: "D", path: "/x" }).openGraph as object).sort();
    const lipsa = cheiPagina.filter((c) => !(c in og));
    assert.deepEqual(lipsa, [], `ramura de articol a pierdut chei față de cea de pagină: ${lipsa.join(", ")}`);
  });
});

describe("nicio pagină nu-și pierde metadatele pe cont propriu", () => {
  const PAGINI = [...fisiereSub(join(APP, "(website)")), ...fisiereSub(join(APP, "(ajutor)"))];

  test("s-au găsit paginile (proba nu e goală)", () => {
    assert.ok(PAGINI.length >= 25, `doar ${PAGINI.length} fișiere sub (website) și (ajutor)`);
  });

  test("nicio pagină nu atinge `openGraph` sau `twitter` pe cont propriu", () => {
    /*
      ⚠ CE ERA GREȘIT AICI PÂNĂ PE 04.09.2026, ȘI DE CE E O LECȚIE.

      Regula veche căuta `openGraph:\s*\{([^}]*)\}` și cerea ca între acolade să
      apară `images`. Trei găuri, măsurate:

        1. Pe arborele de azi tiparul se potrivea de ZERO ori, pe toate cele 32
           de fișiere. Bucla nu se executa niciodată: probă verde care nu
           afirmă nimic.
        2. Vedea doar forma proprietate-de-obiect. Forma ATRIBUIRE
           (`meta.openGraph = { … }`) trecea neatinsă — chiar forma pe care o
           folosea `blog/[slug]/page.tsx` până în aceeași zi, și pe care o
           folosește și acum pentru `meta.robots`.
        3. `twitter` nu era privit deloc, deși se pierde exact la fel.

      Regula nouă e mai simplă și nu poate fi ocolită prin sintaxă: sub
      `(website)` și `(ajutor)`, NUMELE nu are ce căuta. Cine are nevoie de
      câmpuri proprii le cere lui `siteMetadata`, care le pune peste un obiect
      complet — sau, dacă helperul nu le poate da, se extinde HELPERUL, ca toate
      paginile să câștige deodată.
    */
    /*
      ⚠ SE CAUTA DECLARAREA, NU CUVANTUL. Prima scriere a regulii interzicea
      numele oriunde in sursa — deci s-ar fi aprins pe o adresa `twitter.com`
      dintr-o legatura de partajare sau pe un nume de variabila, adica alarma
      falsa pe cod nevinovat. Se cauta acum cele trei forme prin care o cheie
      chiar ajunge in metadate:

        openGraph: { … }        proprietate de obiect literal
        meta.openGraph = { … }  atribuire pe un obiect deja construit
        "og:title": …           ocolire prin `other`, care emite acelasi meta

      A treia e cea pe care o revizie a numit-o „portita": `other` NU inlocuieste
      `openGraph`, dar emite exact aceleasi etichete, deci pagina ar spune doua
      lucruri deodata.
    */
    const FORME: [string, RegExp][] = [
      ["openGraph ca proprietate", /\bopenGraph\s*:/],
      ["openGraph ca atribuire", /\bopenGraph\s*=/],
      ["twitter ca proprietate", /\btwitter\s*:/],
      ["twitter ca atribuire", /\btwitter\s*=/],
      ["etichete og: prin `other`", /["']og:[a-z_:]+["']\s*:/],
      ["etichete twitter: prin `other`", /["']twitter:[a-z_:]+["']\s*:/],
    ];

    const gresite: string[] = [];
    for (const cale of PAGINI) {
      const sursa = sursaFaraComentarii(cale);
      for (const [nume, tipar] of FORME) {
        if (tipar.test(sursa)) gresite.push(`${cale} → ${nume}`);
      }
    }
    assert.deepEqual(
      gresite,
      [],
      "pagini care își scriu singure metadatele sociale; ar înlocui integral obiectul rădăcinii " +
        "sau ar emite etichete duble:\n  " + gresite.join("\n  "),
    );
  });

  test("regula de mai sus chiar poate cădea", () => {
    /*
      ⚠ O PROBĂ CARE NU S-A EXECUTAT NICIODATĂ E VERDE DIN LENE, NU DIN ADEVĂR.
      Exact asta a fost regula veche: zero potriviri pe 32 de fișiere. Aici se
      verifică unealta însăși, pe cele trei forme care contează.
    */
    const TIPARE = [
      /\bopenGraph\s*:/, /\bopenGraph\s*=/, /\btwitter\s*:/, /\btwitter\s*=/,
      /["']og:[a-z_:]+["']\s*:/, /["']twitter:[a-z_:]+["']\s*:/,
    ];
    const prinde = (cod: string) => TIPARE.some((t) => t.test(cod));

    const VINOVATE = [
      'export const metadata = { openGraph: { title: "x" } };',
      "meta.openGraph = { title: 'x' };",
      'export const metadata: Metadata = { twitter: { card: "summary" } };',
      'meta.twitter = { card: "summary" };',
      'export const metadata = { other: { "og:image": "/x.png" } };',
      "export const metadata = { other: { 'twitter:card': 'summary' } };",
    ];
    for (const cod of VINOVATE) assert.ok(prinde(cod), `regula nu prinde forma: ${cod}`);

    /*
      ⚠ SI NU SE APRINDE PE COD NEVINOVAT. Fara randurile astea, regula ar putea
      fi oricat de lacoma — inclusiv „numele nu apare nicaieri", care era prima
      scriere si care ar fi cazut pe o legatura de partajare catre twitter.com.
    */
    const NEVINOVATE = [
      "meta.robots = { index: false };",
      'const share = `https://twitter.com/intent/tweet?url=${u}`;',
      'const openGraphExplicatie = "asa se cheama standardul";',
      'aria-label="Distribuie pe Twitter"',
      "import { siteMetadata } from '@/lib/website/metadata';",
    ];
    for (const cod of NEVINOVATE) assert.ok(!prinde(cod), `regula se aprinde pe cod nevinovat: ${cod}`);
  });

  test("bannerul mărcii e ACELAȘI ca în rădăcină, și există pe disc", () => {
    /*
      ⚠ `OG_IMAGINE` E A DOUA COPIE a bannerului din `src/app/layout.tsx`, iar
      probele de mai sus se compară cu ea însăși (`og.images` față de
      `OG_IMAGINE`), deci rămân verzi orice ar scrie rădăcina.

      Scenariul care trecea neobservat: cineva schimbă bannerul în locul evident
      — rădăcina — și șterge fișierul vechi. Pagina de start distribuie poza
      nouă, iar cele 24 de pagini care trec prin helper trimit mai departe către
      `/og-image.png`, care dă 404. Nici tsc, nici eslint, nici probele nu cad.
    */
    const radacina = sursaFaraComentarii(join(APP, "layout.tsx"));
    assert.ok(
      radacina.includes(OG_IMAGINE.url),
      `rădăcina nu mai pomenește „${OG_IMAGINE.url}": cele două copii ale bannerului s-au despărțit`,
    );
    for (const numar of [OG_IMAGINE.width, OG_IMAGINE.height]) {
      assert.ok(
        radacina.includes(String(numar)),
        `rădăcina nu mai are dimensiunea ${numar} a bannerului`,
      );
    }
    const peDisc = join(AICI, "..", "..", "..", "public", OG_IMAGINE.url.replace(/^\//, ""));
    assert.ok(existsSync(peDisc), `bannerul lipsește de pe disc: ${peDisc}`);
  });

  test("`keywords` nu se întoarce în rădăcină", () => {
    /* Se scurgeau pe domeniile comercianților, prin moștenire. Paginile proprii
       ale magazinelor își pun `keywords` ale lor, și acelea rămân. */
    const radacina = sursaFaraComentarii(join(APP, "layout.tsx"));
    assert.doesNotMatch(radacina, /\bkeywords:/, "au revenit cuvintele-cheie în metadata rădăcinii");
  });
});
