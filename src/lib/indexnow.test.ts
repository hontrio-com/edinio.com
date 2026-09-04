import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PLATFORM_ORIGIN } from "@/lib/seo";
import { NON_STORE_SEGMENTS } from "@/lib/segmente-rezervate";
import {
  adreseDeAnuntat, CALE_CHEIE, cheia, corpCerere, esteReusita, explicaCod, MAXIM_PE_CERERE,
} from "./indexnow";

/*
  ═══ CE APĂRĂ PROBA ═══

  Cea mai scumpă greșeală posibilă la IndexNow nu e o cerere picată — aceea se
  vede și se reia. E o cerere REUȘITĂ cu adrese greșite:

    * o vitrină `www.edinio.com/{slug}`, care poartă `X-Robots-Tag: noindex` —
      i-am spune lui Bing „indexează asta" despre o pagină care spune „nu mă
      indexa";
    * domeniul propriu al unui comerciant, care nu e al nostru: n-am putea dovedi
      proprietatea, iar cererea ar fi respinsă — dar după ce am trimis-o.

  Poarta e o CONSTRUCȚIE, nu o disciplină: `adreseDeAnuntat` nu primește adrese,
  primește intrări de sitemap. Probele de aici măsoară că nici măcar forțând nu
  se poate strecura ceva, și că nu retrimitem la nesfârșit.
*/

const AICI = dirname(fileURLToPath(import.meta.url));

describe("poarta: ce NU poate ieși niciodată", () => {
  test("o adresă de pe alt domeniu e refuzată, chiar dacă i se dă la intrare", () => {
    /* Nu se poate întâmpla cu ieșirea lui `intrariPlatforma()`, dar poarta se
       scrie oricum: e ultima linie dintre noi și o adresă străină trimisă în
       numele nostru. */
    const straine = [
      { url: "https://bricosmart.ro/" },
      { url: "https://bricosmart.ro/product/x" },
      { url: "https://www.edinio.com.atacator.ro/" },
      { url: "http://www.edinio.com/preturi" },
      { url: "https://notedinio.com/preturi" },
    ];
    assert.deepEqual(adreseDeAnuntat(straine, []), []);
  });

  test("adresele platformei trec", () => {
    const ale_noastre = [{ url: PLATFORM_ORIGIN }, { url: `${PLATFORM_ORIGIN}/preturi` }];
    assert.deepEqual(adreseDeAnuntat(ale_noastre, []), [PLATFORM_ORIGIN, `${PLATFORM_ORIGIN}/preturi`]);
  });

  test("o vitrină nu poate intra, fiindcă nu e în sitemap", () => {
    /*
      ⚠ ASTA E APĂRAREA ADEVĂRATĂ, și nu stă aici. `adreseDeAnuntat` primește
      DOAR ieșirea lui `intrariPlatforma()`, iar `sitemap.test.ts` probează deja
      că fiecare adresă de acolo începe cu un segment REZERVAT — adică nu poate
      fi un slug de magazin.

      Rândul de mai jos ține cele două legate: dacă cineva ar începe să
      construiască adresele de mână, ar trebui să treacă pe aici.
    */
    const sursa = readFileSync(join(AICI, "..", "app", "api", "cron", "indexnow", "route.ts"), "utf8");
    assert.match(sursa, /intrariPlatforma\(/, "cronul nu mai ia adresele din sitemapul platformei");
    assert.doesNotMatch(
      sursa.replace(/\/\*[\s\S]*?\*\//g, ""),
      /PLATFORM_ORIGIN\s*\}?\s*[`"']?\s*\/\$\{/,
      "cronul construiește adrese de mână în loc să le ia din sitemap",
    );
  });

  test("fișierul-cheie e pe o cale REZERVATĂ, nu pe un segment oarecare", () => {
    /*
      Protocolul îngăduie `/{cheie}.txt` la rădăcină. Am ales o cale fixă tocmai
      ca să poată fi rezervată: un segment cu nume imprevizibil ar trece prin
      proxy ca posibil slug de magazin și ar interoga baza la fiecare verificare
      a lui Bing.
    */
    const segment = CALE_CHEIE.replace(/^\//, "");
    assert.ok(
      NON_STORE_SEGMENTS.has(segment),
      `„${segment}" nu e rezervat: proxy-ul îl va căuta în baza de magazine la fiecare cerere`,
    );
  });
});

describe("ce se trimite și ce nu se retrimite", () => {
  const A = `${PLATFORM_ORIGIN}/blog/un-articol`;
  const B = `${PLATFORM_ORIGIN}/preturi`;

  test("o adresă nouă se trimite", () => {
    assert.deepEqual(adreseDeAnuntat([{ url: A }], []), [A]);
  });

  test("una deja anunțată, neschimbată, NU se retrimite", () => {
    const d = "2026-09-01T10:00:00.000Z";
    assert.deepEqual(adreseDeAnuntat([{ url: A, lastModified: d }], [{ url: A, lastmod: d }]), []);
  });

  test("una MODIFICATĂ se retrimite", () => {
    assert.deepEqual(
      adreseDeAnuntat(
        [{ url: A, lastModified: "2026-09-02T10:00:00.000Z" }],
        [{ url: A, lastmod: "2026-09-01T10:00:00.000Z" }],
      ),
      [A],
    );
  });

  test("una mai VECHE decât ce am trimis nu se retrimite", () => {
    /* Se poate întâmpla dacă cineva corectează o dată în urmă. Nu e o schimbare
       de conținut, deci n-are ce anunța. */
    assert.deepEqual(
      adreseDeAnuntat(
        [{ url: A, lastModified: "2026-08-01T10:00:00.000Z" }],
        [{ url: A, lastmod: "2026-09-01T10:00:00.000Z" }],
      ),
      [],
    );
  });

  test("una FĂRĂ dată se anunță O SINGURĂ DATĂ", () => {
    /*
      ⚠ ASTA E REGULA CARE NE ȚINE DEPARTE DE `429`. Paginile scrise în cod
      n-au dată adevărată în sitemap (o dată inventată pe 23 de adrese ieftinește
      adevărul de pe celelalte — vezi nota din `sitemap.ts`). Fără regula asta,
      toate ar fi retrimise la FIECARE rulare a cronului, adică exact
      retrimiterea pe care documentația IndexNow o descurajează.
    */
    assert.deepEqual(adreseDeAnuntat([{ url: B }], []), [B], "prima oară trebuie trimisă");
    assert.deepEqual(adreseDeAnuntat([{ url: B }], [{ url: B, lastmod: null }]), [], "a doua oară NU");
  });

  test("o dată stricată nu declanșează o retrimitere", () => {
    assert.deepEqual(
      adreseDeAnuntat([{ url: A, lastModified: "nu e o data" }], [{ url: A, lastmod: "2026-09-01T10:00:00.000Z" }]),
      [],
    );
  });
});

describe("cheia", () => {
  test("lipsă sau stricată înseamnă STINS, nu „mergem oricum”", () => {
    const original = process.env.INDEXNOW_KEY;
    try {
      for (const rea of [undefined, "", "   ", "prea-scurt", "nu-e-hexazecimal-xyz", "a".repeat(200)]) {
        if (rea === undefined) delete process.env.INDEXNOW_KEY;
        else process.env.INDEXNOW_KEY = rea;
        assert.equal(cheia(), null, `cheia „${rea}" a fost primită`);
      }
      process.env.INDEXNOW_KEY = "A1b2C3d4E5f6";
      assert.equal(cheia(), "A1b2C3d4E5f6");
    } finally {
      if (original === undefined) delete process.env.INDEXNOW_KEY;
      else process.env.INDEXNOW_KEY = original;
    }
  });
});

describe("corpul cererii și citirea răspunsului", () => {
  test("are exact câmpurile cerute de protocol, cu gazda noastră", () => {
    const c = corpCerere([`${PLATFORM_ORIGIN}/preturi`], "abc123ff");
    assert.deepEqual(Object.keys(c).sort(), ["host", "key", "keyLocation", "urlList"]);
    assert.equal(c.host, new URL(PLATFORM_ORIGIN).host);
    assert.equal(c.keyLocation, `${PLATFORM_ORIGIN}${CALE_CHEIE}`);
    assert.deepEqual(c.urlList, [`${PLATFORM_ORIGIN}/preturi`]);
  });

  test("`202` E O REUȘITĂ", () => {
    /*
      ⚠ Ușor de tratat greșit: `202` înseamnă „am primit, verific cheia" — deci
      adresa A INTRAT. Socotit eșec, cronul ar reîncerca la nesfârșit aceleași
      adrese, adică drumul drept către `429`.
    */
    assert.equal(esteReusita(202), true);
    assert.equal(esteReusita(200), true);
    for (const rau of [400, 403, 422, 429, 500, 0]) {
      assert.equal(esteReusita(rau), false, `${rau} a fost socotit reușită`);
    }
  });

  test("fiecare cod are o explicație în cuvinte", () => {
    for (const cod of [200, 202, 400, 403, 422, 429]) {
      assert.ok(explicaCod(cod).length > 3, `codul ${cod} n-are explicație`);
    }
    assert.match(explicaCod(418), /418/, "un cod necunoscut trebuie totuși numit");
  });

  test("lotul e mult sub plafonul protocolului", () => {
    /* Protocolul îngăduie 10.000 pe cerere. Stăm la 100 dinadins: cronul se
       întoarce oricum, iar loturile mari nu se pot relua pe bucăți. */
    assert.ok(MAXIM_PE_CERERE > 0 && MAXIM_PE_CERERE <= 1000, `lot nepotrivit: ${MAXIM_PE_CERERE}`);
  });
});

describe("nimic nu trimite pe altă cale", () => {
  test("`after()` nu anunță nimic — cronul e singura cale", () => {
    /*
      ⚠ Cablarea din acțiunea de salvare ar fi fost locul evident, și e greșit:
      `after()` rulează după ce răspunsul a plecat (un eșec nu se vede nicăieri),
      n-ar fi prins articolele PROGRAMATE, și ar fi anunțat CIORNELE. Motivul
      întreg e în `src/lib/indexnow.ts`.

      Proba se uită în tot `src/` după alți chemători, în afara cronului și a ei
      înseși.
    */
    const gasite: string[] = [];
    const cauta = (dir: string) => {
      for (const d of readdirSync(dir, { withFileTypes: true })) {
        const cale = join(dir, d.name);
        if (d.isDirectory()) {
          if (d.name === "node_modules" || d.name === ".next") continue;
          cauta(cale);
          continue;
        }
        if (!/\.tsx?$/.test(d.name)) continue;
        if (cale.includes(join("api", "cron", "indexnow"))) continue;
        if (cale.endsWith("indexnow.ts") || cale.endsWith("indexnow.test.ts")) continue;
        if (cale.includes("indexnow-key.txt")) continue;
        const sursa = readFileSync(cale, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
        if (/from "@\/lib\/indexnow"/.test(sursa)) gasite.push(cale);
      }
    };
    cauta(join(AICI, ".."));
    assert.deepEqual(
      gasite,
      [],
      "IndexNow e chemat și din altă parte decât cronul:\n  " + gasite.join("\n  "),
    );
  });
});
