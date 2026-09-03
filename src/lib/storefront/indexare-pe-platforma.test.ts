import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { CacheScurt } from "@/lib/utils/cache-scurt";
import {
  ANTET_ROBOTS,
  NOINDEX_DESFASURARE,
  NOINDEX_VITRINA,
  NU_E_MAGAZIN,
  TTL_REZOLVARE,
  hotarasteVitrinaPePlatforma,
  rezolvaSlugPlatforma,
  rezolvareDinRand,
  ttlRezolvare,
  type RandMagazinPentruProxy,
  type RezolvareSlugPlatforma,
} from "./indexare-pe-platforma";

/*
  ═══ INVARIANTA SEO (03.09.2026) ═══

  Edinio.com indexeaza numai continutul platformei. Storefront-urile merchant
  sunt noindex pe host-ul platformei si devin indexabile doar pe custom domain.

  Probele de aici judeca HOTARAREA, pe toate ramurile ei, fara proxy si fara
  baza. Proxy-ul insusi, cu o baza de proba, e judecat in `src/proxy.test.ts`.
*/

const TTL = { gasit: 60_000, negasit: 15_000 };

const FARA_DOMENIU: RandMagazinPentruProxy = { custom_domain: null, custom_domain_healthy: null };
const CU_DOMENIU: RandMagazinPentruProxy = { custom_domain: "magazin-client.ro", custom_domain_healthy: true };
const NEVERIFICAT: RandMagazinPentruProxy = { custom_domain: "magazin-client.ro", custom_domain_healthy: null };
const DOMENIU_MORT: RandMagazinPentruProxy = { custom_domain: "mort.ro", custom_domain_healthy: false };

describe("antetul", () => {
  test("numele si valorile sunt cele pe care le citeste Google", () => {
    assert.equal(ANTET_ROBOTS, "X-Robots-Tag");
    // `follow` ramane pornit pe vitrine: doar indexarea e oprita.
    assert.equal(NOINDEX_VITRINA, "noindex, follow");
    assert.match(NOINDEX_DESFASURARE, /^noindex/);
  });
});

describe("traducerea randului din baza", () => {
  test("niciun rand = nu e magazin", () => {
    assert.deepEqual(rezolvareDinRand(null), { esteMagazin: false, tinta: null });
  });

  test("magazin fara domeniu propriu = magazin, fara tinta", () => {
    /* ⚠ Exact cazul pe care cache-ul vechi il confunda cu „nu e magazin". */
    assert.deepEqual(rezolvareDinRand(FARA_DOMENIU), { esteMagazin: true, tinta: null });
  });

  test("magazin cu domeniu = magazin, cu tinta si cu sanatatea ei", () => {
    assert.deepEqual(rezolvareDinRand(CU_DOMENIU), {
      esteMagazin: true,
      tinta: { domeniu: "magazin-client.ro", sanatos: true },
    });
    assert.deepEqual(rezolvareDinRand(DOMENIU_MORT).tinta, { domeniu: "mort.ro", sanatos: false });
  });

  test("domeniul gol sau cu spatii inseamna fara domeniu, si se normalizeaza", () => {
    assert.equal(rezolvareDinRand({ custom_domain: "   ", custom_domain_healthy: null }).tinta, null);
    assert.equal(rezolvareDinRand({ custom_domain: " Magazin.RO ", custom_domain_healthy: null }).tinta?.domeniu, "magazin.ro");
  });
});

describe("hotararea pentru o vitrina de pe gazda platformei", () => {
  test("nu e magazin: nimic — paginile platformei si 404-urile nu primesc antetul", () => {
    assert.deepEqual(hotarasteVitrinaPePlatforma(NU_E_MAGAZIN, false), { fel: "nimic" });
    assert.deepEqual(hotarasteVitrinaPePlatforma(NU_E_MAGAZIN, true), { fel: "nimic" });
  });

  test("magazin fara domeniu: noindex", () => {
    assert.deepEqual(hotarasteVitrinaPePlatforma(rezolvareDinRand(FARA_DOMENIU), false), { fel: "noindex" });
  });

  test("magazin cu domeniu sanatos: redirect, ca inainte", () => {
    const h = hotarasteVitrinaPePlatforma(rezolvareDinRand(CU_DOMENIU), false);
    assert.equal(h.fel, "redirect");
    if (h.fel === "redirect") assert.equal(h.tinta.domeniu, "magazin-client.ro");
  });

  test("domeniu inca neverificat (null) se trateaza ca sanatos: redirect", () => {
    /* Un domeniu tocmai conectat nu asteapta cronul de sanatate. */
    assert.equal(hotarasteVitrinaPePlatforma(rezolvareDinRand(NEVERIFICAT), false).fel, "redirect");
  });

  test("domeniu DOVEDIT stricat: vitrina e servita pe platforma, deci noindex", () => {
    assert.deepEqual(hotarasteVitrinaPePlatforma(rezolvareDinRand(DOMENIU_MORT), false), { fel: "noindex" });
  });

  test("previzualizarea nu se redirecteaza, dar e tot noindex", () => {
    /* Editorul o incarca intr-un cadru de pe aceeasi origine; un 307 spre alt
       domeniu ar fi blocat de X-Frame-Options. Ramane pe platforma — si atunci
       e o vitrina pe platforma, ca oricare alta. */
    assert.deepEqual(hotarasteVitrinaPePlatforma(rezolvareDinRand(CU_DOMENIU), true), { fel: "noindex" });
    assert.deepEqual(hotarasteVitrinaPePlatforma(rezolvareDinRand(FARA_DOMENIU), true), { fel: "noindex" });
  });
});

describe("cat se tine minte", () => {
  test("fara tinta se tine scurt, cu tinta se tine lung — aceeasi regula ca inainte", () => {
    assert.equal(ttlRezolvare(NU_E_MAGAZIN, TTL), TTL.negasit);
    assert.equal(ttlRezolvare(rezolvareDinRand(FARA_DOMENIU), TTL), TTL.negasit);
    assert.equal(ttlRezolvare(rezolvareDinRand(CU_DOMENIU), TTL), TTL.gasit);
  });

  test("valorile din sursa unica: negasit e MAI SCURT decat gasit, si sunt cele folosite implicit", () => {
    /* O inversare a lor in proxy ar fi trecut prin toate probele (niciuna nu
       masoara timpul). Aici sta invarianta care conteaza. */
    assert.ok(TTL_REZOLVARE.negasit < TTL_REZOLVARE.gasit, "un magazin tocmai publicat ar astepta mai mult decat unul cunoscut");
    assert.ok(TTL_REZOLVARE.negasit > 0 && TTL_REZOLVARE.gasit > 0, "un TTL zero ar dezactiva cache-ul");
    assert.equal(ttlRezolvare(NU_E_MAGAZIN), TTL_REZOLVARE.negasit);
    assert.equal(ttlRezolvare(rezolvareDinRand(CU_DOMENIU)), TTL_REZOLVARE.gasit);
  });
});

describe("cand nu se stie", () => {
  test("null (baza a picat) da indisponibil, nu nimic si nu noindex", () => {
    assert.deepEqual(hotarasteVitrinaPePlatforma(null, false), { fel: "indisponibil" });
    assert.deepEqual(hotarasteVitrinaPePlatforma(null, true), { fel: "indisponibil" });
  });
});

describe("rezolvarea prin cache", () => {
  /** O baza de proba care numara cate ori e intrebata si raspunde dupa slug. */
  function baza(randuri: Record<string, RandMagazinPentruProxy | "eroare">) {
    let intrebari = 0;
    const cauta = async (slug: string) => {
      intrebari++;
      const r = randuri[slug];
      if (r === "eroare") return { data: null, error: new Error("baza a picat") };
      return { data: r ?? null, error: null };
    };
    return { cauta, intrebari: () => intrebari };
  }

  test("magazin fara domeniu e recunoscut ca magazin SI la cache hit", async () => {
    /*
      ⚠ CHIAR DEFECTUL PE CARE L-AR FI AVUT FORMA VECHE. Cache-ul tinea
      `TintaProprie | null`; la a doua cerere, `null` ar fi insemnat „nu e
      magazin" si vitrina ar fi iesit fara `noindex` din secunda a doua.
    */
    const cache = new CacheScurt<RezolvareSlugPlatforma>(TTL.gasit);
    const b = baza({ "floraria-mea": FARA_DOMENIU });
    const prima = await rezolvaSlugPlatforma("floraria-mea", cache, b.cauta, TTL);
    const aDoua = await rezolvaSlugPlatforma("floraria-mea", cache, b.cauta, TTL);
    assert.equal(b.intrebari(), 1, "a doua cerere trebuia servita din cache");
    assert.deepEqual(prima, { esteMagazin: true, tinta: null });
    assert.deepEqual(aDoua, prima);
    assert.equal(hotarasteVitrinaPePlatforma(aDoua, false).fel, "noindex");
  });

  test("slug inexistent nu e tratat ca vitrina, nici la cache hit", async () => {
    const cache = new CacheScurt<RezolvareSlugPlatforma>(TTL.gasit);
    const b = baza({});
    await rezolvaSlugPlatforma("nu-exista", cache, b.cauta, TTL);
    const aDoua = await rezolvaSlugPlatforma("nu-exista", cache, b.cauta, TTL);
    assert.equal(b.intrebari(), 1);
    assert.deepEqual(aDoua, { esteMagazin: false, tinta: null });
    assert.equal(hotarasteVitrinaPePlatforma(aDoua, false).fel, "nimic");
  });

  test("magazin cu domeniu sanatos continua redirectul, si din cache", async () => {
    const cache = new CacheScurt<RezolvareSlugPlatforma>(TTL.gasit);
    const b = baza({ "cu-domeniu": CU_DOMENIU });
    await rezolvaSlugPlatforma("cu-domeniu", cache, b.cauta, TTL);
    const aDoua = await rezolvaSlugPlatforma("cu-domeniu", cache, b.cauta, TTL);
    assert.equal(b.intrebari(), 1);
    assert.equal(hotarasteVitrinaPePlatforma(aDoua, false).fel, "redirect");
  });

  test("magazin cu domeniu stricat, servit prin Edinio, primeste noindex", async () => {
    const cache = new CacheScurt<RezolvareSlugPlatforma>(TTL.gasit);
    const b = baza({ "domeniu-mort": DOMENIU_MORT });
    const r = await rezolvaSlugPlatforma("domeniu-mort", cache, b.cauta, TTL);
    assert.equal(hotarasteVitrinaPePlatforma(r, false).fel, "noindex");
  });

  test("esecul citirii se intoarce ca necunoscut, nu se tine minte, si cererea urmatoare intreaba din nou", async () => {
    /*
      Daca am retine esecul ca „nu e magazin", o pana de o clipa a bazei ar face
      15 secunde in care fiecare vitrina ar fi servita fara `noindex` si fara
      redirect. Si nici pe moment nu raspundem „nu e magazin": `null` inseamna
      „nu se stie", iar proxy-ul face din el 503.
    */
    const cache = new CacheScurt<RezolvareSlugPlatforma>(TTL.gasit);
    const b = baza({ "floraria-mea": "eroare" });
    const laEroare = await rezolvaSlugPlatforma("floraria-mea", cache, b.cauta, TTL);
    assert.equal(laEroare, null);
    assert.equal(hotarasteVitrinaPePlatforma(laEroare, false).fel, "indisponibil");
    await rezolvaSlugPlatforma("floraria-mea", cache, b.cauta, TTL);
    assert.equal(b.intrebari(), 2, "esecul a fost pus in cache");
    assert.equal(cache.marime, 0);
  });

  test("fara tinta se tine scurt: dupa TTL-ul negativ se intreaba din nou", async () => {
    /* Un magazin tocmai publicat, sau un domeniu tocmai conectat, trebuie sa se
       vada in secunde, nu peste un minut. */
    const cache = new CacheScurt<RezolvareSlugPlatforma>(60_000);
    const b = baza({ "proaspat": FARA_DOMENIU });
    await rezolvaSlugPlatforma("proaspat", cache, b.cauta, { gasit: 60_000, negasit: 1 });
    await new Promise((r) => setTimeout(r, 5));
    await rezolvaSlugPlatforma("proaspat", cache, b.cauta, { gasit: 60_000, negasit: 1 });
    assert.equal(b.intrebari(), 2, "rezolvarea fara tinta a fost tinuta cu TTL-ul lung");
  });
});
