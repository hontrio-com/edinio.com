import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { CAI_INTERZISE, caiInterziseStraine, robotsPentru } from "./robots";

/*
  ═══ INVARIANTA SEO (03.09.2026) ═══

  Edinio.com indexeaza numai continutul platformei. Storefront-urile merchant
  sunt noindex pe host-ul platformei si devin indexabile doar pe custom domain.

  Pentru robots.txt asta inseamna trei lucruri, fiecare cu proba lui:
    1. pe platforma se anunta NUMAI sitemapul platformei (nu si indexul retras);
    2. pe domeniul propriu se anunta sitemapul acelui domeniu, si numai el;
    3. NU exista `Disallow` pentru vitrine: `noindex` cere ca pagina sa poata fi
       CITITA, iar un `Disallow` i-ar interzice lui Googlebot tocmai citirea.
*/

const PLATFORMA = ["www.edinio.com", "edinio.com", "localhost:3000", "edinio-git-main.vercel.app", "", null, undefined];

describe("pe platforma", () => {
  for (const gazda of PLATFORMA) {
    test(`${JSON.stringify(gazda)} anunta numai sitemapul platformei`, () => {
      const r = robotsPentru(gazda);
      assert.equal(r.sitemap, "https://www.edinio.com/sitemap.xml");
      assert.ok(!JSON.stringify(r).includes("sitemap-magazine"), "indexul retras e anuntat din nou");
    });
  }

  test("sitemapul e unul singur, nu o lista", () => {
    /* Forma veche dadea o LISTA de doua: sitemapul si indexul. O lista cu un
       singur element ar fi tot corecta pentru Google, dar ar lasa loc sa se
       strecoare al doilea inapoi. */
    assert.equal(typeof robotsPentru("www.edinio.com").sitemap, "string");
  });
});

describe("pe domeniul propriu", () => {
  test("anunta sitemapul de pe acel domeniu, si numai pe el", () => {
    const r = robotsPentru("magazin-client.ro");
    assert.equal(r.sitemap, "https://magazin-client.ro/sitemap.xml");
    assert.ok(!JSON.stringify(r).includes("edinio.com"), "robots-ul unui domeniu propriu trimite la platforma");
  });

  test("gazda se normalizeaza: fara port, cu minuscule", () => {
    assert.equal(robotsPentru("Magazin-Client.RO:443").sitemap, "https://magazin-client.ro/sitemap.xml");
  });
});

describe("regulile", () => {
  test("o singura regula, pentru toti, cu `allow: /`", () => {
    for (const gazda of ["www.edinio.com", "magazin-client.ro"]) {
      const r = robotsPentru(gazda);
      const reguli = Array.isArray(r.rules) ? r.rules : [r.rules];
      assert.equal(reguli.length, 1);
      assert.equal(reguli[0].userAgent, "*");
      assert.equal(reguli[0].allow, "/");
    }
  });

  test("Disallow acopera NUMAI aplicatia — nicio vitrina, niciun /{slug}", () => {
    /*
      ⚠ INSTANTANEU DINADINS. Orice rand nou aici trebuie sa treaca pe la proba
      asta, si intrebarea pe care o pune e una singura: e o cale a APLICATIEI
      (panou, admin, autentificare, API), sau e o incercare de a „ascunde"
      vitrinele prin robots? A doua ar fi pe dos: Googlebot n-ar mai putea citi
      `noindex`, si adresele ar putea ramane in index fara continut.
    */
    assert.deepEqual([...CAI_INTERZISE], [
      "/dashboard/",
      "/admin/",
      "/onboarding/",
      "/api/",
      "/auth/",
      "/login",
      "/register",
      "/reset-password",
      "/forgot-password",
    ]);
    const r = robotsPentru("www.edinio.com");
    const reguli = Array.isArray(r.rules) ? r.rules : [r.rules];
    assert.deepEqual(reguli[0].disallow, [...CAI_INTERZISE]);
    for (const cale of CAI_INTERZISE) {
      assert.ok(!/[*$]/.test(cale), `„${cale}" e un tipar cu joker, nu o cale a aplicatiei`);
      assert.notEqual(cale, "/", "un Disallow pe / ar scoate tot site-ul din Google");
    }
  });

  test("aceleasi reguli pe domeniul propriu: vitrina comerciantului nu e interzisa", () => {
    const r = robotsPentru("magazin-client.ro");
    const reguli = Array.isArray(r.rules) ? r.rules : [r.rules];
    assert.deepEqual(reguli[0].disallow, [...CAI_INTERZISE]);
  });
});

describe("caiInterziseStraine: ce citeste santinela din robots.txt-ul servit", () => {
  /* Exact forma in care Next scrie fisierul din `robotsPentru` (verificat pe
     build): o linie `Disallow: <cale>` pentru fiecare intrare. */
  const TEXT_REAL = [
    "User-Agent: *",
    "Allow: /",
    ...CAI_INTERZISE.map((c) => `Disallow: ${c}`),
    "",
    "Sitemap: https://www.edinio.com/sitemap.xml",
    "",
  ].join("\n");

  test("robots.txt-ul nostru, asa cum e servit, nu are nicio cale straina — inclusiv /login si /register", () => {
    /*
      ⚠ Prima forma a probei din santinela rescria lista intr-un regex si acuza
      chiar `/login`, `/register`, `/reset-password` si `/forgot-password` — cai
      de un singur segment fara slash final — la FIECARE rulare. De aceea se
      compara cu chiar `CAI_INTERZISE`, nu cu o copie.
    */
    assert.deepEqual(caiInterziseStraine(TEXT_REAL), []);
  });

  test("un Disallow strecurat pe o vitrina e prins, oricum ar fi scris", () => {
    assert.deepEqual(caiInterziseStraine(`${TEXT_REAL}Disallow: /floraria-mea\n`), ["/floraria-mea"]);
    assert.deepEqual(caiInterziseStraine(`${TEXT_REAL}disallow:   /floraria-mea/  \n`), ["/floraria-mea/"]);
    assert.deepEqual(caiInterziseStraine(`${TEXT_REAL}Disallow: /*\r\nDisallow: /magazin-x\r\n`), ["/*", "/magazin-x"]);
  });

  test("CRLF si spatiile nu produc cai fantoma", () => {
    assert.deepEqual(caiInterziseStraine(TEXT_REAL.replace(/\n/g, "\r\n")), []);
  });
});
