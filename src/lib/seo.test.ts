import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isPlatformHost as dinSeo, robotsVitrinaPeGazda, storeBaseUrl, verificareGooglePentru } from "./seo";
import { isPlatformHost as dinGazde } from "./platform-hosts";

const AICI = dirname(fileURLToPath(import.meta.url));
const VITRINA = join(AICI, "..", "app", "(public)", "[slug]");

/** Toate fisierele .ts/.tsx de sub un director, fara probe. */
function fisiereSub(dir: string): string[] {
  const out: string[] = [];
  for (const nume of readdirSync(dir)) {
    const cale = join(dir, nume);
    if (statSync(cale).isDirectory()) out.push(...fisiereSub(cale));
    else if (/\.(ts|tsx)$/.test(nume) && !/\.test\.(ts|tsx)$/.test(nume)) out.push(cale);
  }
  return out;
}

/** Sursa fara comentarii si cu CRLF normalizat, ca proba sa se agate de cod, nu de vorbele despre cod. */
function sursaFaraComentarii(cale: string): string {
  return readFileSync(cale, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

/*
  ═══ INVARIANTA SEO (03.09.2026) ═══

  Edinio.com indexeaza numai continutul platformei. Storefront-urile merchant
  sunt noindex pe host-ul platformei si devin indexabile doar pe custom domain.
*/

describe("verificarea Search Console", () => {
  const MAGAZIN = { custom_domain: "magazin-client.ro" };
  const FARA_DOMENIU = { custom_domain: null };

  test("se injecteaza NUMAI cand cererea vine de pe domeniul propriu", () => {
    assert.equal(verificareGooglePentru("magazin-client.ro", MAGAZIN, "abc123"), "abc123");
    assert.equal(verificareGooglePentru("Magazin-Client.RO:443", MAGAZIN, "abc123"), "abc123");
  });

  test("absenta pe www.edinio.com/{slug}, chiar daca magazinul ARE domeniu", () => {
    /* Pe platforma vitrina e `noindex`; o eticheta de verificare acolo ar lasa
       un comerciant sa revendice o bucata din site-ul platformei. */
    assert.equal(verificareGooglePentru("www.edinio.com", MAGAZIN, "abc123"), null);
    assert.equal(verificareGooglePentru("edinio.com", MAGAZIN, "abc123"), null);
    assert.equal(verificareGooglePentru("edinio-git-x.vercel.app", MAGAZIN, "abc123"), null);
  });

  test("absenta pentru un magazin fara domeniu, pe orice gazda", () => {
    assert.equal(verificareGooglePentru("www.edinio.com", FARA_DOMENIU, "abc123"), null);
    assert.equal(verificareGooglePentru("magazin-client.ro", FARA_DOMENIU, "abc123"), null);
  });

  test("absenta pe domeniul ALTUI magazin", () => {
    assert.equal(verificareGooglePentru("alt-magazin.ro", MAGAZIN, "abc123"), null);
  });

  test("fara cod configurat nu se injecteaza nimic, nici pe domeniul propriu", () => {
    assert.equal(verificareGooglePentru("magazin-client.ro", MAGAZIN, ""), null);
    assert.equal(verificareGooglePentru("magazin-client.ro", MAGAZIN, "   "), null);
    assert.equal(verificareGooglePentru("magazin-client.ro", MAGAZIN, undefined), null);
  });

  test("gazda lipsa nu inseamna domeniu propriu", () => {
    assert.equal(verificareGooglePentru(null, MAGAZIN, "abc123"), null);
    assert.equal(verificareGooglePentru("", MAGAZIN, "abc123"), null);
  });
});

describe("eticheta <meta name=robots> a vitrinei, dupa gazda", () => {
  const MAGAZIN = { custom_domain: "magazin-client.ro" };

  test("pe domeniul propriu nu se atinge: paginile mostenesc `index` si isi pun singure noindex-ul comerciantului", () => {
    assert.equal(robotsVitrinaPeGazda("magazin-client.ro", MAGAZIN), undefined);
    assert.equal(robotsVitrinaPeGazda("Magazin-Client.RO:443", MAGAZIN), undefined);
  });

  test("pe platforma, pe *.vercel.app si pe localhost e noindex, follow — al doilea strat sub antet", () => {
    for (const gazda of ["www.edinio.com", "edinio.com", "edinio-git-x.vercel.app", "localhost:3000", "", null]) {
      assert.deepEqual(robotsVitrinaPeGazda(gazda, MAGAZIN), { index: false, follow: true }, `gazda ${JSON.stringify(gazda)}`);
    }
  });

  test("un magazin fara domeniu e noindex pe orice gazda", () => {
    assert.deepEqual(robotsVitrinaPeGazda("www.edinio.com", { custom_domain: null }), { index: false, follow: true });
    assert.deepEqual(robotsVitrinaPeGazda("oricare.ro", { custom_domain: null }), { index: false, follow: true });
  });

  test("pe domeniul ALTUI magazin e noindex", () => {
    assert.deepEqual(robotsVitrinaPeGazda("alt-magazin.ro", MAGAZIN), { index: false, follow: true });
  });

  /*
    ═══ CABLAREA celui de-al doilea strat, nu doar functia ═══

    Functia de mai sus poate fi corecta si nefolosita. Probele de aici citesc
    SURSA paginilor vitrinei (cu comentariile scoase intai — vezi
    `sitemap.test.ts` pentru de ce) si tin trei reguli care, incalcate, ar fi
    trecut prin toate probele, tsc si eslint (verificat pe build, 04.09.2026):
      1. layout-ul magazinului chiar pune rezultatul in `meta.robots`;
      2. nicio pagina nu scrie `robots: { index: true }` explicit — ar contrazice
         antetul `X-Robots-Tag` pe www.edinio.com/{slug}; mostenirea vine din
         layout (index pe domeniul propriu, noindex in rest);
      3. nicio pagina nu scrie `robots: ... undefined` — in Next cheia prezenta
         cu `undefined` STERGE mostenirea si nu emite nicio eticheta.
  */
  test("layout-ul magazinului cableaza robotsVitrinaPeGazda in metadata", () => {
    const sursa = sursaFaraComentarii(join(VITRINA, "layout.tsx"));
    assert.match(sursa, /robotsVitrinaPeGazda\(/, "layout-ul nu mai cheama robotsVitrinaPeGazda");
    assert.match(sursa, /meta\.robots\s*=/, "layout-ul nu mai pune rezultatul in meta.robots");
  });

  test("layout-ul magazinului inchide TOATE cheile care se scurg de la radacina", () => {
    /*
      ⚠ NEXT CONTOPESTE PE CHEI DE NIVEL INTAI: o cheie pe care layout-ul
      magazinului n-o numeste pastreaza valoarea radacinii. Masurat in productie
      pe 04.09.2026, pe bricosmart.ro, INAINTE de reparatie:

          <link rel="manifest" href="/site.webmanifest">   -> 404 pe domeniul lor
          <meta name="author" content="Edinio">            + creator, publisher
          <link rel="author" href="https://www.edinio.com">

      Iar pe `www.edinio.com/{slug}` manifestul raspundea 200 cu al PLATFORMEI,
      deci vitrina comerciantului se instala pe telefon sub numele „Edinio".

      ⚠ `icons` A FOST SCAPAT LA PRIMA REPARATIE, si l-a gasit o revizie: era
      pus doar `if (favicon)`, deci un magazin fara favicon si fara logo mostenea
      setul de pictograme Edinio pe PROPRIUL domeniu. De aceea proba cere fiecare
      cheie pe nume, nu „reparatia in general".

      Ce se cere de la fiecare: sa fie NUMITA. `manifest`/`icons` pe `undefined`
      sting mostenirea fara sa emita nimic; `authors`/`creator`/`publisher` sunt
      puse pe numele magazinului, fiindca acolo asta e adevarul.
    */
    const sursa = sursaFaraComentarii(join(VITRINA, "layout.tsx"));
    for (const cheie of ["manifest", "authors", "creator", "publisher", "icons"]) {
      assert.match(
        sursa,
        new RegExp("\\b" + cheie + "\\s*[:=]"),
        `layout-ul magazinului nu mai numeste \`${cheie}\`, deci valoarea radacinii (Edinio) ` +
          "se scurge pe domeniul comerciantului",
      );
    }
    /* `icons` numit doar sub un `if` e chiar defectul gasit: se cere atribuire
       neconditionata, cu `undefined` cand magazinul n-are pictograma. */
    assert.doesNotMatch(
      sursa,
      /if \(favicon\) meta\.icons/,
      "`icons` e pus doar cand magazinul are pictograma; fara `else`, se mosteneste setul Edinio",
    );
  });

  test("nicio pagina a vitrinei nu forteaza `index: true` si nu foloseste `robots: undefined`", () => {
    const fisiere = fisiereSub(VITRINA);
    assert.ok(fisiere.length >= 10, `doar ${fisiere.length} fisiere sub ${VITRINA}`);
    for (const cale of fisiere) {
      const sursa = sursaFaraComentarii(cale);
      assert.doesNotMatch(sursa, /robots:\s*\{\s*index:\s*true/, `${cale} forteaza index: true — pe platforma ar contrazice X-Robots-Tag; lasa mostenirea din layout`);
      assert.doesNotMatch(sursa, /robots:\s*[^,\n]*\?\s*[^:\n]*:\s*undefined/, `${cale} foloseste robots: ... undefined, care sterge mostenirea in loc s-o pastreze; foloseste spread conditionat`);
      assert.doesNotMatch(sursa, /robots:\s*undefined/, `${cale} foloseste robots: undefined`);
    }
  });
});

describe("o singura lista de gazde", () => {
  test("`isPlatformHost` din seo.ts E cea din platform-hosts.ts, nu o copie", () => {
    /* Doua liste care raspund la aceeasi intrebare se despart la prima gazda
       adaugata intr-una singura. Re-exportul e identitatea functiei. */
    assert.equal(dinSeo, dinGazde);
  });
});

describe("adresa publica a magazinului", () => {
  test("domeniul propriu cand exista, altfel calea de pe platforma", () => {
    assert.equal(storeBaseUrl({ slug: "floraria-mea", custom_domain: "floraria.ro" }), "https://floraria.ro");
    assert.equal(storeBaseUrl({ slug: "floraria-mea", custom_domain: null }), "https://www.edinio.com/floraria-mea");
    assert.equal(storeBaseUrl({ slug: "floraria-mea" }), "https://www.edinio.com/floraria-mea");
  });
});
