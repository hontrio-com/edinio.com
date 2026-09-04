import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { intrariPlatforma } from "@/app/sitemap";

/*
  ═══ O HOTĂRÂRE CU DOUĂ JUMĂTĂȚI ═══

  Pe 04.09.2026, după un audit SEO, etichetele blogului au primit
  `noindex, follow` și au ieșit din sitemap. Rubricile rămân indexabile: ele
  sunt o listă închisă, aleasă de noi; etichetele se scriu liber în editor, iar
  azi cele 7 stau toate pe ACELAȘI singur articol publicat — șapte adrese cu
  același conținut.

  Hotărârea trăiește în DOUĂ fișiere care nu se văd unul pe altul:

    1. `(website)/blog/eticheta/[slug]/page.tsx` — `robots: { index: false, follow: true }`;
    2. `app/sitemap.ts` — adresele de etichetă nu se mai anunță.

  Despărțite, se ceartă: un sitemap care anunță o adresă `noindex` e chiar
  contradicția pentru care s-a retras `sitemap-magazine.xml` pe 03.09. Proba
  asta e singurul loc unde cele două jumătăți se privesc.

  ⚠ JUMĂTATEA DE PAGINĂ NU SE POATE CHEMA. `generateMetadata` trăiește într-un
  `.tsx`, iar harnessul încarcă doar `.ts` („Unknown file extension .tsx",
  măsurat). Deci acolo se citește SURSA — cu comentariile scoase, fiindcă chiar
  nota de deasupra regulii citează forma căutată, și o scanare naivă s-ar agăța
  de propriile mele cuvinte. Ultimul test verifică unealta însăși.
*/

const AICI = dirname(fileURLToPath(import.meta.url));
const PAGINA_ETICHETA = join(AICI, "..", "..", "app", "(website)", "blog", "eticheta", "[slug]", "page.tsx");
const SITEMAP = join(AICI, "..", "..", "app", "sitemap.ts");

function faraComentarii(cale: string): string {
  return readFileSync(cale, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("jumătatea de PAGINĂ: eticheta se declară noindex", () => {
  const sursa = faraComentarii(PAGINA_ETICHETA);

  test("declară `index: false` ȘI `follow: true`", () => {
    /*
      ⚠ AMÂNDOUĂ, nu doar prima. `noindex, nofollow` ar rupe și legăturile către
      articole, care sunt tocmai motivul pentru care pagina rămâne vie: cititorul
      ajunge la ea din articol, iar motoarele merg mai departe de acolo.
    */
    assert.match(
      sursa,
      /robots\s*=\s*\{\s*index:\s*false\s*,\s*follow:\s*true\s*\}/,
      "pagina de etichetă nu mai declară `robots: { index: false, follow: true }`",
    );
  });

  test("nu se bizuie pe moștenire și nu o șterge", () => {
    /* ⚠ În Next, cheia prezentă cu `undefined` ȘTERGE moștenirea și nu emite
       nimic — deci pagina n-ar spune nici „indexează", nici „nu indexa". */
    assert.doesNotMatch(sursa, /robots\s*[:=]\s*undefined/, "`robots: undefined` șterge moștenirea");
  });
});

describe("jumătatea de SITEMAP: nicio adresă de etichetă", () => {
  /*
    Se cheamă generatorul ADEVĂRAT, cu articole care CHIAR au taxonomie, ca
    aserțiunea să nu fie vidă. Un fixture fără nimic ar face proba verde din
    lene: n-ar avea de unde să apară o adresă de etichetă nici dacă codul ar
    vrea.
  */
  const ARTICOLE = [
    {
      slug: "un-articol",
      published_at: "2026-09-01T10:00:00.000Z",
      content_updated_at: "2026-09-02T10:00:00.000Z",
      categorie: { slug: "ghiduri", content_updated_at: null },
      autor: { slug: "ana", content_updated_at: null },
    },
    {
      slug: "al-doilea",
      published_at: "2026-08-20T10:00:00.000Z",
      content_updated_at: null,
      categorie: { slug: "marketing", content_updated_at: null },
      autor: { slug: "bogdan", content_updated_at: null },
    },
  ];
  const IESIRE = intrariPlatforma(ARTICOLE);

  test("proba nu e vidă: generatorul chiar a produs adrese de blog", () => {
    /* Fără rândul ăsta, aserțiunea de mai jos ar trece și pe o listă goală. */
    assert.ok(IESIRE.some((e) => e.url.includes("/blog/un-articol")), "articolele nu mai intră în sitemap");
    assert.ok(IESIRE.some((e) => e.url.includes("/blog/categorie/ghiduri")), "rubricile nu mai intră");
    assert.ok(IESIRE.some((e) => e.url.includes("/blog/autor/ana")), "autorii nu mai intră");
  });

  test("nicio adresă `/blog/eticheta/`", () => {
    const etichete = IESIRE.filter((e) => e.url.includes("/blog/eticheta/"));
    assert.deepEqual(etichete, [], "sitemapul anunță adrese de etichetă, care sunt `noindex`");
  });

  test("generatorul nici nu mai primește etichete", () => {
    /*
      Aserțiunea de deasupra ar trece și dacă cineva ar readăuga parametrul fără
      să-l folosească — iar atunci următorul om l-ar folosi. Se cere ca sursa să
      nu mai construiască deloc adrese de etichetă.
    */
    assert.doesNotMatch(
      faraComentarii(SITEMAP),
      /\/blog\/eticheta\//,
      "sitemap.ts construiește din nou adrese de etichetă",
    );
  });
});

describe("uneltele probei chiar pot cădea", () => {
  /*
    ⚠ Amândouă jumătățile de mai sus se sprijină pe o scanare de sursă cu
    comentariile scoase. O scanare care nu se aprinde niciodată e verde din lene,
    iar una care se aprinde pe comentarii e alarmă falsă. Se verifică pe ambele
    fețe, pe cod scris aici.
  */
  const scoate = (t: string) =>
    t.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

  test("regula de `robots` prinde forma bună și numai pe ea", () => {
    const tipar = /robots\s*=\s*\{\s*index:\s*false\s*,\s*follow:\s*true\s*\}/;
    assert.match(scoate("meta.robots = { index: false, follow: true };"), tipar);
    assert.doesNotMatch(scoate("meta.robots = { index: false, follow: false };"), tipar, "a trecut `nofollow`");
    assert.doesNotMatch(scoate("meta.robots = { index: true, follow: true };"), tipar, "a trecut `index: true`");
    assert.doesNotMatch(scoate("/* meta.robots = { index: false, follow: true }; */"), tipar, "s-a aprins pe un comentariu");
  });

  test("regula de sitemap prinde codul, nu vorbele despre el", () => {
    const tipar = /\/blog\/eticheta\//;
    assert.match(scoate('url: `${O}/blog/eticheta/${e.slug}`,'), tipar);
    assert.doesNotMatch(scoate("/* etichetele de la /blog/eticheta/ au iesit */"), tipar, "s-a aprins pe un comentariu");
    assert.doesNotMatch(scoate("// nota despre /blog/eticheta/"), tipar, "s-a aprins pe un comentariu de rând");
  });
});
