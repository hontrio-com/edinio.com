import { strict as assert } from "node:assert";
import { test, describe, before, after } from "node:test";
import http from "node:http";
import type { AddressInfo } from "node:net";

/*
  ═══ PROXY-UL ADEVARAT, CU O BAZA DE PROBA ═══

  Invarianta SEO (03.09.2026): Edinio.com indexeaza numai continutul platformei.
  Storefront-urile merchant sunt noindex pe host-ul platformei si devin
  indexabile doar pe custom domain.

  Hotararea e probata in `indexare-pe-platforma.test.ts`. Dar hotararea buna,
  neaplicata, nu apara nimic: aici se ruleaza CHIAR `proxy()`, cu `NextRequest`
  adevarate, si se citeste antetul de pe raspunsul lui. Singurul lucru inlocuit
  e baza: un server HTTP local care vorbeste PostgREST atat cat il intreaba
  proxy-ul (`businesses` dupa `slug`, si dupa `custom_domain`). Asa proba vede
  si cate interogari se fac — deci si daca cache-ul chiar serveste a doua cerere.

  ⚠ Env-ul se pune INAINTE de a importa proxy-ul: clientii Supabase se fac la
  fiecare cerere din `process.env`, iar adresa bazei de proba se afla abia dupa
  ce serverul porneste.
*/

type Rand = { custom_domain: string | null; custom_domain_healthy: boolean | null; is_published: boolean };

/** Magazinele din baza de proba, dupa slug. */
const MAGAZINE: Record<string, Rand> = {
  "floraria-mea": { custom_domain: null, custom_domain_healthy: null, is_published: true },
  "cache-fara-domeniu": { custom_domain: null, custom_domain_healthy: null, is_published: true },
  "cu-domeniu": { custom_domain: "magazin-client.ro", custom_domain_healthy: true, is_published: true },
  "neverificat": { custom_domain: "proaspat.ro", custom_domain_healthy: null, is_published: true },
  "domeniu-mort": { custom_domain: "mort.ro", custom_domain_healthy: false, is_published: true },
  "nepublicat": { custom_domain: null, custom_domain_healthy: null, is_published: false },
  "nepublicat-cu-domeniu": { custom_domain: "nepublicat.ro", custom_domain_healthy: null, is_published: false },
  "baza-cazuta": { custom_domain: null, custom_domain_healthy: null, is_published: true },
};

/** Fiecare cerere primita de baza de proba: cale + interogare. */
const jurnal: string[] = [];
/** Cand e adevarat, baza raspunde 500 la orice. */
let bazaCazuta = false;

const baza = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://baza");
  jurnal.push(url.pathname + url.search);
  const json = (cod: number, corp: unknown) => {
    res.writeHead(cod, { "content-type": "application/json" });
    res.end(JSON.stringify(corp));
  };
  if (bazaCazuta) return json(500, { message: "baza a picat" });
  if (url.pathname !== "/rest/v1/businesses") return json(404, { message: "ruta de proba necunoscuta" });

  const slug = url.searchParams.get("slug");
  const domenii = url.searchParams.get("custom_domain");
  if (slug?.startsWith("eq.")) {
    const m = MAGAZINE[slug.slice(3)];
    // `is_published=eq.true` e in interogare; baza de proba il respecta.
    const publicat = url.searchParams.get("is_published") === "eq.true";
    const randuri = m && (!publicat || m.is_published)
      ? [{ custom_domain: m.custom_domain, custom_domain_healthy: m.custom_domain_healthy }]
      : [];
    return json(200, randuri);
  }
  if (domenii?.startsWith("in.(")) {
    const lista = domenii.slice(4, -1).split(",").map((d) => d.replace(/^"|"$/g, ""));
    const randuri = Object.entries(MAGAZINE)
      .filter(([, m]) => m.custom_domain && lista.includes(m.custom_domain))
      .map(([s, m]) => ({ slug: s, custom_domain: m.custom_domain, is_published: m.is_published }));
    return json(200, randuri);
  }
  return json(200, []);
});

let proxy: (typeof import("./proxy"))["proxy"];
let NextRequest: (typeof import("next/server"))["NextRequest"];

before(async () => {
  await new Promise<void>((r) => baza.listen(0, "127.0.0.1", () => r()));
  const { port } = baza.address() as AddressInfo;
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "cheie-anonima-de-proba";
  ({ proxy } = await import("./proxy"));
  ({ NextRequest } = await import("next/server"));
});

after(async () => {
  await new Promise<void>((r) => baza.close(() => r()));
});

/** O cerere GET catre `url`, cu antetul `Host` luat din ea — asa cum ajunge la proxy. */
function cerere(url: string) {
  const u = new URL(url);
  return new NextRequest(url, { headers: { host: u.host } });
}

const robots = (r: Response) => r.headers.get("x-robots-tag");
const interogariMagazine = () => jurnal.filter((p) => p.startsWith("/rest/v1/businesses")).length;

describe("vitrina servita pe www.edinio.com: fiecare ruta de sub /{slug} e noindex", () => {
  const CAI = [
    "/floraria-mea",
    "/floraria-mea/",
    "/floraria-mea/product/trandafiri",
    "/floraria-mea/magazin",
    "/floraria-mea/magazin/flori",
    "/floraria-mea/politici/retur",
    "/floraria-mea/despre-noi",
    "/floraria-mea/cautare?q=lalele",
    "/floraria-mea/o-ruta-scrisa-maine/x/y",
    /* ⚠ Slugul scris cu codificare procentuala: Next il decodifica si serveste
       aceeasi vitrina, deci si proxy-ul trebuie s-o recunoasca. Pana pe
       04.09.2026 segmentul brut `floraria%2Dmea` nu era gasit in baza si adresa
       iesea FARA antet. */
    "/floraria%2Dmea",
    "/floraria%2Dmea/product/trandafiri",
    "/%66loraria-mea",
  ];
  for (const cale of CAI) {
    test(`${cale} → X-Robots-Tag: noindex, follow`, async () => {
      const r = await proxy(cerere(`https://www.edinio.com${cale}`));
      assert.equal(r.status, 200, "vitrina trebuie servita, nu redirectata");
      assert.equal(robots(r), "noindex, follow");
      assert.equal(r.headers.get("location"), null);
    });
  }

  test("valoarea pastreaza `follow`: doar indexarea e oprita", async () => {
    const r = await proxy(cerere("https://www.edinio.com/floraria-mea"));
    assert.match(robots(r) ?? "", /\bnoindex\b/);
    assert.match(robots(r) ?? "", /\bfollow\b/);
    assert.doesNotMatch(robots(r) ?? "", /nofollow/);
  });

  test("baza e intrebata NUMAI dupa magazine publicate", async () => {
    await proxy(cerere("https://www.edinio.com/floraria-mea"));
    const ultima = jurnal.filter((p) => p.includes("slug=eq.floraria-mea")).at(-1) ?? "";
    assert.match(ultima, /is_published=eq\.true/, "interogarea nu filtreaza dupa is_published");
  });
});

describe("paginile platformei NU primesc noindex si nu intreaba baza", () => {
  const CAI = ["/", "/preturi", "/contact", "/blog", "/blog/un-articol", "/blog/categorie/x", "/ajutor/setari/un-ghid",
    "/integrari", "/integrari/fan-courier", "/vs/shopify", "/industrii/moda", "/termeni", "/cookies/setari", "/intrebari-frecvente"];
  for (const cale of CAI) {
    test(`${cale} ramane indexabila`, async () => {
      const inainte = interogariMagazine();
      const r = await proxy(cerere(`https://www.edinio.com${cale}`));
      assert.equal(r.status, 200);
      assert.equal(robots(r), null, `${cale} a primit X-Robots-Tag`);
      assert.equal(interogariMagazine(), inainte, `${cale} a facut o interogare de magazin degeaba`);
    });
  }
});

describe("ce NU e magazin nu e tratat ca vitrina", () => {
  test("un slug inexistent (404 al platformei) nu primeste antetul, nici din cache", async () => {
    const inainte = interogariMagazine();
    const r = await proxy(cerere("https://www.edinio.com/nu-exista-asa-ceva/product/x"));
    assert.equal(r.status, 200);
    assert.equal(robots(r), null);
    assert.equal(interogariMagazine() - inainte, 1, "prima cerere trebuia sa intrebe baza");
    // A doua, din cache: tot fara antet, fara alta interogare.
    const aDoua = await proxy(cerere("https://www.edinio.com/nu-exista-asa-ceva"));
    assert.equal(robots(aDoua), null);
    assert.equal(interogariMagazine() - inainte, 1, "slugul inexistent n-a fost tinut in cache");
  });

  test("o secventa procentuala invalida nu arunca si nu e magazin", async () => {
    const r = await proxy(cerere("https://www.edinio.com/%E0%A4%A"));
    assert.equal(r.status, 200);
    assert.equal(robots(r), null);
  });

  test("un magazin NEPUBLICAT nu e magazin pentru proxy", async () => {
    /* Pagina lui e deja `noindex` din metadata („in curand disponibil"); aici
       doar nu-l confundam cu o vitrina vie. */
    const r = await proxy(cerere("https://www.edinio.com/nepublicat"));
    assert.equal(robots(r), null);
  });
});

describe("cache-ul deosebeste magazinul fara domeniu de ce nu e magazin", () => {
  test("a doua cerere vine din cache si POARTA antetul", async () => {
    /*
      ⚠ Defectul pe care l-ar fi avut cache-ul vechi: tinea `TintaProprie | null`,
      iar `null` insemna si „fara domeniu", si „nu e magazin". A doua cerere ar fi
      iesit fara `noindex`.
    */
    const inainte = interogariMagazine();
    const prima = await proxy(cerere("https://www.edinio.com/cache-fara-domeniu/product/a"));
    const aDoua = await proxy(cerere("https://www.edinio.com/cache-fara-domeniu/product/b"));
    assert.equal(interogariMagazine() - inainte, 1, "a doua cerere a intrebat baza din nou");
    assert.equal(robots(prima), "noindex, follow");
    assert.equal(robots(aDoua), "noindex, follow");
  });

  test("o citire picata raspunde 503, nu serveste vitrina fara antet, si nu se tine minte", async () => {
    /*
      ⚠ „ORICE cerere" inseamna si cea din timpul unei pene. Forma dinainte
      raspundea atunci ca pentru un 404 — adica servea vitrina FARA `noindex`.
      Acum: 503 „reveniti", fara cache, ca pe ramura domeniilor proprii; iar
      cererea urmatoare intreaba baza din nou si primeste antetul.
    */
    bazaCazuta = true;
    try {
      const r = await proxy(cerere("https://www.edinio.com/baza-cazuta"));
      assert.equal(r.status, 503);
      assert.equal(r.headers.get("retry-after"), "30");
      assert.equal(r.headers.get("cache-control"), "no-store");
      assert.equal(r.headers.get("x-middleware-next"), null, "vitrina a fost servita in timpul penei");
    } finally {
      bazaCazuta = false;
    }
    const inainte = interogariMagazine();
    const r = await proxy(cerere("https://www.edinio.com/baza-cazuta"));
    assert.equal(interogariMagazine() - inainte, 1, "esecul a fost pus in cache");
    assert.equal(r.status, 200);
    assert.equal(robots(r), "noindex, follow");
  });

  test("paginile platformei nu ajung la baza, deci o pana nu le da 503", async () => {
    bazaCazuta = true;
    try {
      for (const cale of ["/", "/preturi", "/blog", "/robots.txt", "/sitemap.xml", "/llms.txt"]) {
        const r = await proxy(cerere(`https://www.edinio.com${cale}`));
        assert.equal(r.status, 200, `${cale} a cazut odata cu baza`);
        assert.equal(robots(r), null);
      }
    } finally {
      bazaCazuta = false;
    }
  });
});

describe("magazin cu domeniu propriu", () => {
  test("domeniu sanatos: 307 catre domeniul lui, pastrand calea si interogarea", async () => {
    const r = await proxy(cerere("https://www.edinio.com/cu-domeniu/product/x?a=1"));
    assert.equal(r.status, 307);
    assert.equal(r.headers.get("location"), "https://magazin-client.ro/product/x?a=1");
    assert.equal(robots(r), null, "redirectul nu are ce sa poarte");
  });

  test("si cand slugul e scris cu codificare procentuala", async () => {
    const r = await proxy(cerere("https://www.edinio.com/cu%2Ddomeniu/product/x"));
    assert.equal(r.status, 307);
    assert.equal(r.headers.get("location"), "https://magazin-client.ro/product/x");
  });

  test("radacina magazinului merge la radacina domeniului", async () => {
    const r = await proxy(cerere("https://www.edinio.com/cu-domeniu"));
    assert.equal(r.status, 307);
    assert.equal(r.headers.get("location"), "https://magazin-client.ro/");
  });

  test("domeniu inca neverificat: tot redirect", async () => {
    const r = await proxy(cerere("https://www.edinio.com/neverificat/magazin"));
    assert.equal(r.status, 307);
    assert.equal(r.headers.get("location"), "https://proaspat.ro/magazin");
  });

  test("domeniu DOVEDIT stricat: servit pe platforma, cu noindex", async () => {
    const r = await proxy(cerere("https://www.edinio.com/domeniu-mort/magazin"));
    assert.equal(r.status, 200);
    assert.equal(robots(r), "noindex, follow");
  });

  test("previzualizarea nu se redirecteaza, dar e noindex", async () => {
    const r = await proxy(cerere("https://www.edinio.com/cu-domeniu?preview=1"));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("location"), null);
    assert.equal(robots(r), "noindex, follow");
  });

  test("si previzualizarea unui magazin fara domeniu e noindex", async () => {
    const r = await proxy(cerere("https://www.edinio.com/floraria-mea?preview=1"));
    assert.equal(robots(r), "noindex, follow");
  });
});

describe("pe domeniul propriu magazinul e indexabil", () => {
  test("cererea e rescrisa pe /{slug}/... FARA X-Robots-Tag", async () => {
    const r = await proxy(cerere("https://magazin-client.ro/product/x"));
    assert.equal(r.status, 200);
    assert.equal(robots(r), null, "platforma a pus noindex pe domeniul propriu");
    const rescriere = r.headers.get("x-middleware-rewrite") ?? "";
    assert.match(rescriere, /\/cu-domeniu\/product\/x/, "cererea nu a fost rescrisa pe magazin");
  });

  test("radacina domeniului e vitrina magazinului", async () => {
    const r = await proxy(cerere("https://magazin-client.ro/"));
    assert.match(r.headers.get("x-middleware-rewrite") ?? "", /\/cu-domeniu$/);
    assert.equal(robots(r), null);
  });

  test("/sitemap.xml si /robots.txt raman ale domeniului: nu se rescriu, nu poarta antetul", async () => {
    for (const cale of ["/sitemap.xml", "/robots.txt"]) {
      const r = await proxy(cerere(`https://magazin-client.ro${cale}`));
      assert.equal(r.status, 200);
      assert.equal(r.headers.get("x-middleware-rewrite"), null, `${cale} a fost rescris`);
      assert.equal(robots(r), null);
    }
  });

  test("www.domeniu/sitemap.xml e trimis la apex, ca sitemapul sa nu iasa gol", async () => {
    const r = await proxy(cerere("https://www.magazin-client.ro/sitemap.xml"));
    assert.equal(r.status, 308);
    assert.equal(r.headers.get("location"), "https://magazin-client.ro/sitemap.xml");
  });

  test("pe un domeniu necunoscut, /sitemap.xml si /robots.txt raspund 404, nu un sitemap gol cu 200", async () => {
    /*
      ⚠ Pana pe 04.09.2026 cele doua adrese ieseau din proxy INAINTE de cautarea
      domeniului, deci un domeniu strain indreptat catre noi primea de la
      `sitemap.ts` un `<urlset>` gol cu 200 — forma pe care Google o tine minte.
    */
    for (const cale of ["/sitemap.xml", "/robots.txt"]) {
      const r = await proxy(cerere(`https://strain.ro${cale}`));
      assert.equal(r.status, 404, `${cale} pe un domeniu strain n-a dat 404`);
      assert.equal(r.headers.get("x-middleware-next"), null, `${cale} a fost servit pe un domeniu strain`);
    }
  });

  test("pe domeniul unui magazin NEPUBLICAT, /sitemap.xml raspunde 404", async () => {
    const r = await proxy(cerere("https://nepublicat.ro/sitemap.xml"));
    assert.equal(r.status, 404);
    assert.equal(r.headers.get("x-middleware-next"), null);
  });

  test("cand baza pica, /sitemap.xml pe domeniu propriu raspunde 503, nu gol", async () => {
    bazaCazuta = true;
    try {
      const r = await proxy(cerere("https://domeniu-neintrebat-inca.ro/sitemap.xml"));
      assert.equal(r.status, 503);
      assert.equal(r.headers.get("cache-control"), "no-store");
    } finally {
      bazaCazuta = false;
    }
  });

  test("cand baza pica, /robots.txt pe domeniu propriu se serveste totusi (robots.ts e pur)", async () => {
    /*
      Un robots.txt cu 5xx il face pe Google sa trateze TOT hostul ca interzis la
      crawlare pana la un raspuns bun. `robots.ts` decide doar dupa gazda, deci
      n-are de ce sa astepte baza — spre deosebire de sitemap, care chiar
      citeste magazinul. Domeniul e „rece" (neintrebat inca), ca sa nu iasa
      din cache.
    */
    bazaCazuta = true;
    try {
      const r = await proxy(cerere("https://alt-domeniu-rece.ro/robots.txt"));
      assert.equal(r.status, 200);
      assert.equal(r.headers.get("x-middleware-next"), "1", "robots.txt n-a fost servit in timpul penei");
      assert.equal(r.headers.get("x-middleware-rewrite"), null);
    } finally {
      bazaCazuta = false;
    }
  });
});

describe("gazdele de desfasurare (*.vercel.app) sunt noindex in intregime", () => {
  /*
    ⚠ Slugurile de aici sunt alese ca proba sa nu poata trece VACUU:
      - `cu-domeniu` ARE domeniu sanatos, deci pe platforma ar fi fost 307 —
        aici trebuie sa ramana 200 cu `noindex`, fara redirect;
      - `doar-pe-vercel` n-a fost cerut NICIODATA, deci nu e in cache: daca
        proxy-ul ar cauta magazine pe *.vercel.app, jurnalul bazei l-ar arata.
    Cu `floraria-mea` (cald in cache, fara domeniu) amandoua asertiunile ar fi
    trecut si daca proxy-ul ar fi cautat si redirectat.
  */
  for (const cale of ["/", "/preturi", "/cu-domeniu", "/cu-domeniu/product/x", "/doar-pe-vercel", "/blog"]) {
    test(`${cale} pe o previzualizare Vercel`, async () => {
      const r = await proxy(cerere(`https://edinio-git-ramura.vercel.app${cale}`));
      assert.equal(r.status, 200);
      assert.equal(robots(r), "noindex");
      assert.equal(r.headers.get("location"), null, "o previzualizare nu redirecteaza catre domeniile clientilor");
    });
  }

  test("pe *.vercel.app nu se cauta magazine deloc", async () => {
    await proxy(cerere("https://edinio-git-ramura.vercel.app/doar-pe-vercel"));
    assert.ok(!jurnal.some((p) => p.includes("slug=eq.doar-pe-vercel")), "proxy-ul a intrebat baza pe *.vercel.app");
  });
});

describe("gazdele platformei care nu primesc antetul", () => {
  test("localhost nu cauta magazine, nu redirecteaza si nu pune nimic", async () => {
    const r = await proxy(cerere("http://localhost:3000/cu-domeniu/product/x"));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("location"), null, "pe localhost s-a redirectat catre domeniul clientului");
    assert.equal(robots(r), null);
    await proxy(cerere("http://localhost:3000/doar-pe-localhost"));
    assert.ok(!jurnal.some((p) => p.includes("slug=eq.doar-pe-localhost")), "proxy-ul a intrebat baza pe localhost");
  });

  test("apexul edinio.com e trimis la www inainte de orice", async () => {
    const r = await proxy(cerere("https://edinio.com/floraria-mea"));
    assert.equal(r.status, 301);
    assert.equal(r.headers.get("location"), "https://www.edinio.com/floraria-mea");
  });
});
