import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  paginiDeSite,
  PUSE_SEPARAT,
  dataTaxonomiei,
  intrariPlatforma,
  intrariMagazin,
  type ArticolPentruSitemap,
  type DateMagazinPentruSitemap,
} from "./sitemap";
import {
  COMPETITORS,
  RESOURCES,
  SOLUTION_COLUMNS,
  TOP_NAV,
} from "@/lib/website/nav";
import { NON_STORE_SEGMENTS } from "@/lib/segmente-rezervate";
import { PLATFORM_ORIGIN } from "@/lib/seo";

/*
  ═══ DE CE EXISTA PROBELE ASTEA ═══

  Pe 30.08.2026 s-a descoperit ca ZECE pagini vii lipseau cu totul din sitemap:
  /blog, /integrari, /magazin-online, /optimizare, /mentenanta-gratuita, /vs,
  /intrebari-frecvente si /migrare. (Enumerarea e de la 30.08.2026; intre timp
  /start, /despre, /magazin-online au primit redirectare, iar /industrii
  raspunde 410. Ce a ramas se probeaza mai jos, pe nume.)

  Nu le observase nimeni luni de zile, si e usor de inteles de ce: o pagina
  lipsa dintr-un sitemap nu strica nimic, nu da nicio eroare si nu apare in
  niciun jurnal. Doar nu e gasita. E cel mai tacut fel de defect — si lovise
  tocmai paginile de comparatie, adica pe cele care aduc
  cautari cu intentie de cumparare.

  Probele de aici nu verifica forma listei, ci REGULA: tot ce se poate deschide
  din meniu trebuie sa fie anuntat. Asa, urmatoarea pagina adaugata in meniu si
  uitata aici nu mai trece tacut.
*/

const ANUNTATE = new Set(paginiDeSite());
const SEPARAT = new Set(PUSE_SEPARAT);

/** Tot ce se poate deschide dintr-un meniu, oriunde ar sta. */
function adreseDinMeniu(): string[] {
  const a = new Set<string>();
  for (const col of SOLUTION_COLUMNS) for (const it of col.items) a.add(it.href);
  for (const it of RESOURCES) a.add(it.href);
  for (const t of TOP_NAV) if ("href" in t) a.add(t.href);
  return [...a];
}

test("orice pagina din meniu e anuntata in sitemap", () => {
  for (const cale of adreseDinMeniu()) {
    assert.ok(
      ANUNTATE.has(cale) || SEPARAT.has(cale),
      `${cale} se poate deschide din meniu, dar nu e in sitemap`,
    );
  }
});

test("fiecare pagina de comparatie e anuntata", () => {
  // Sase pagini /vs/<concurent>, plus indexul lor.
  assert.ok(ANUNTATE.has("/vs"), "lipseste indexul /vs");
  for (const c of COMPETITORS) {
    assert.ok(ANUNTATE.has(c.href), `${c.href} lipseste din sitemap`);
  }
});

test("blogul e anuntat", () => {
  // Adaugat pe 30.08 odata cu restul. Sta aici pe nume, nu doar in bucata cu
  // meniul, fiindca e pagina de la care porneste tot ce urmeaza sa se scrie.
  assert.ok(ANUNTATE.has("/blog"), "/blog lipseste din sitemap");
});

test("nimic nu e anuntat de doua ori", () => {
  const toate = paginiDeSite();
  assert.equal(toate.length, new Set(toate).size, "sunt adrese duplicate");
  for (const cale of toate) {
    assert.ok(!SEPARAT.has(cale), `${cale} e si in lista separata, si aici: ar iesi de doua ori`);
  }
});

test("toate sunt cai, nu adrese intregi", () => {
  // Sitemapul le lipeste de `PLATFORM_ORIGIN`. O adresa intreaga ar da
  // „https://www.edinio.comhttps://..." si ar strica randul, fara sa cada nimic.
  for (const cale of paginiDeSite()) {
    assert.ok(cale.startsWith("/"), `${cale} nu incepe cu /`);
    assert.ok(!cale.includes("://"), `${cale} e adresa intreaga, nu cale`);
  }
});

/*
  ═══════════════════════════════════════════════════════════════════════════
  DATA UNEI PAGINI DE RUBRICĂ SAU DE AUTOR (31.08.2026)
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ PÂNĂ ACUM SE LUA NUMAI DIN ARTICOLE. Dar pagina rubricii își arată
  descrierea, iar pagina autorului biografia, rolul și poza. Schimbi biografia —
  pagina chiar s-a schimbat — iar sitemapul rămânea la data ultimului articol,
  deci Google nu afla niciodată.

  ⚠ ȘI NU SE IA `updated_at`, care se mută la orice atingere administrativă.
  Taxonomiile au primit `content_updated_at`, mișcat doar de câmpuri pe care
  cititorul le vede. Regula stă în `blog_actualizeaza_taxonomia` și e probată în
  `scripts/tests/blog-integrare.sql`, secțiunea T.
*/

const ART = (content_updated_at: string, published_at: string) => ({ content_updated_at, published_at });

test("data taxonomiei o bate pe a articolelor când e mai nouă", () => {
  const d = dataTaxonomiei("2026-08-31T10:00:00.000Z", [ART("2026-08-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z")]);
  assert.equal(d?.toISOString(), "2026-08-31T10:00:00.000Z");
});

test("articolul mai nou o bate pe a taxonomiei", () => {
  const d = dataTaxonomiei("2026-08-01T00:00:00.000Z", [ART("2026-08-30T09:00:00.000Z", "2026-08-02T00:00:00.000Z")]);
  assert.equal(d?.toISOString(), "2026-08-30T09:00:00.000Z");
});

test("fără data taxonomiei se cade înapoi pe articole", () => {
  const d = dataTaxonomiei(null, [ART("2026-08-30T09:00:00.000Z", "2026-08-02T00:00:00.000Z")]);
  assert.equal(d?.toISOString(), "2026-08-30T09:00:00.000Z");
});

test("o dată stricată nu produce `Invalid Date` în sitemap", () => {
  /* ⚠ `lastModified` ajunge la `toISOString()` în XML. Un `Invalid Date` acolo
     ar arunca, deci ar strica sitemapul ÎNTREG pentru o singură rubrică. */
  const d = dataTaxonomiei("nu-e-o-data", [ART("2026-08-30T09:00:00.000Z", "2026-08-02T00:00:00.000Z")]);
  assert.ok(d && !Number.isNaN(d.getTime()), "a ieșit Invalid Date");
  assert.equal(d?.toISOString(), "2026-08-30T09:00:00.000Z");
});

/*
  ⚠ NICIUN `lastModified` INVENTAT (31.08.2026).

  Paginile scrise in cod aveau `lastModified: new Date()` — 23 de adrese care
  spuneau, la fiecare generare, ca s-au schimbat azi. Paguba nu e locala: un
  `lastmod` care se misca zilnic fara motiv il invata pe Google sa nu mai creada
  campul pe domeniul asta, deci ieftineste chiar datele adevarate de pe articole,
  rubrici si autori.

  ⚠ PROBA CITESTE SURSA, si aici e forma potrivita: invariantul E despre sursa —
  „nu se scrie o data inventata". Ce ARE data adevarata o ia dintr-un camp
  (`content_updated_at`, `updated_at`, `ultima`), deci nu se potriveste cu tiparul.

  Terminatiile de linie se normalizeaza: pe Windows fisierul are CRLF, iar o
  potrivire care nu tine cont de asta pica tacut.
*/
test("sitemapul nu inventeaza `lastModified` cu `new Date()`", () => {
  /*
    ⚠ SE SCOT COMENTARIILE ÎNTÂI, și am aflat-o pe pielea mea: proba a picat pe
    propriul meu comentariu — cel care CITEAZĂ tiparul ca să explice de ce l-am
    scos. O plasă care se agață de vorbele despre defect, nu de defect, e o plasă
    pe care al doilea om o dezactivează.

    Același tipar ca în `src/lib/domains/alarma-repetata.test.ts`.
  */
  const sursa = readFileSync("src/app/sitemap.ts", "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
  const inventate = [...sursa.matchAll(/lastModified:\s*new Date\(\s*\)/g)];
  assert.deepEqual(
    inventate.map((m) => m[0]),
    [],
    "s-a reintrodus o data inventata; foloseste un camp adevarat sau omite `lastModified`",
  );
});

test("când nu știm nimic, nu se inventează o dată", () => {
  /*
    ⚠ ÎNAINTE IEȘEA `new Date()` — adică „nu știu, deci spun că e azi". Era forma
    mai mică a aceleiași minciuni pentru care am scos `lastModified` de pe cele 23
    de pagini scrise în cod. Acum întoarce `null`, iar cine cheamă omite câmpul.
  */
  assert.equal(dataTaxonomiei(null, []), null);
  assert.equal(dataTaxonomiei(undefined, []), null);
});

/*
  ═══════════════════════════════════════════════════════════════════════════
  INVARIANTA SEO (03.09.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Edinio.com indexeaza numai continutul platformei. Storefront-urile merchant
  sunt noindex pe host-ul platformei si devin indexabile doar pe custom domain.

  Pentru sitemap asta inseamna doua lucruri, probate separat:
    - sitemapul PLATFORMEI (www.edinio.com) contine NUMAI adresele platformei:
      niciun /{slug}, nicio pagina de magazin, niciun produs;
    - sitemapul de pe DOMENIUL PROPRIU contine NUMAI adresele acelui magazin,
      toate pe domeniul lui — si e cel care se pastreaza intreg.
*/

const ARTICOLE: ArticolPentruSitemap[] = [
  {
    slug: "primul-articol",
    content_updated_at: "2026-08-30T09:00:00.000Z",
    published_at: "2026-08-02T00:00:00.000Z",
    categorie: { slug: "ghiduri", content_updated_at: "2026-08-01T00:00:00.000Z" },
    autor: { slug: "ana", content_updated_at: null },
  },
  {
    slug: "articol-ascuns",
    noindex: true,
    published_at: "2026-08-02T00:00:00.000Z",
    categorie: { slug: "doar-ascunse" },
    autor: { slug: "autor-doar-ascuns" },
  },
];
const ETICHETE = [{ slug: "seo", ultima: "2026-08-30T09:00:00.000Z" }];

const PLATFORMA = intrariPlatforma(ARTICOLE, ETICHETE);
const primulSegmentAl = (url: string) => new URL(url).pathname.split("/")[1] ?? "";

test("sitemapul platformei: fiecare adresa e pe www.edinio.com", () => {
  for (const e of PLATFORMA) {
    assert.ok(e.url === PLATFORM_ORIGIN || e.url.startsWith(`${PLATFORM_ORIGIN}/`), `${e.url} nu e pe platforma`);
  }
});

test("sitemapul platformei: fiecare adresa incepe cu un segment REZERVAT platformei", () => {
  /*
    Asta e chiar invarianta „niciun magazin": un slug de magazin nu poate fi
    niciodata unul din `NON_STORE_SEGMENTS` (createBusiness le refuza), deci o
    adresa al carei prim segment e acolo nu poate fi o vitrina. Radacina n-are
    segment si e a platformei prin definitie.
  */
  for (const e of PLATFORMA) {
    const seg = primulSegmentAl(e.url);
    assert.ok(seg === "" || NON_STORE_SEGMENTS.has(seg), `${e.url} incepe cu „${seg}", care nu e rezervat platformei: ar putea fi un magazin`);
  }
});

test("sitemapul platformei nu contine nicio forma de pagina de magazin", () => {
  for (const e of PLATFORMA) {
    const cale = new URL(e.url).pathname;
    assert.ok(!/\/product\//.test(cale), `${e.url} e o pagina de produs`);
    assert.ok(!/\/magazin(\/|$)/.test(cale), `${e.url} e un catalog de magazin`);
    assert.ok(!/\/politici\//.test(cale), `${e.url} e o politica de magazin`);
  }
});

test("sitemapul platformei e SINCRON, deci nu poate intreba baza de magazine", () => {
  /*
    ⚠ Garda structurala. O functie fara `await` nu poate face nicio interogare,
    deci nimeni nu poate strecura inapoi un `businesses` sau un `custom_pages`
    „doar pentru vitrine" fara sa o faca asincrona — si atunci cade randul asta.
  */
  assert.equal(intrariPlatforma.constructor.name, "Function", "intrariPlatforma a devenit asincrona: poate citi baza");
  assert.ok(Array.isArray(PLATFORMA), "rezultatul nu e o lista, ci probabil o promisiune");
});

test("sitemapul platformei pastreaza tot ce e al platformei", () => {
  const urluri = new Set(PLATFORMA.map((e) => e.url));
  for (const cale of ["", "/preturi", "/contact", "/termeni", "/confidentialitate", "/cookies", "/gdpr", "/ajutor", "/vs", "/blog", "/integrari"]) {
    assert.ok(urluri.has(`${PLATFORM_ORIGIN}${cale}`), `lipseste ${cale || "/"}`);
  }
  assert.ok(urluri.has(`${PLATFORM_ORIGIN}/blog/primul-articol`), "lipseste articolul");
  assert.ok(urluri.has(`${PLATFORM_ORIGIN}/blog/categorie/ghiduri`), "lipseste rubrica");
  assert.ok(urluri.has(`${PLATFORM_ORIGIN}/blog/autor/ana`), "lipseste autorul");
  assert.ok(urluri.has(`${PLATFORM_ORIGIN}/blog/eticheta/seo`), "lipseste eticheta");
  for (const c of COMPETITORS) assert.ok(urluri.has(`${PLATFORM_ORIGIN}${c.href}`), `lipseste ${c.href}`);
});

test("un articol noindex nu intra, si nu trage dupa el rubrica sau autorul", () => {
  const urluri = new Set(PLATFORMA.map((e) => e.url));
  assert.ok(!urluri.has(`${PLATFORM_ORIGIN}/blog/articol-ascuns`));
  assert.ok(!urluri.has(`${PLATFORM_ORIGIN}/blog/categorie/doar-ascunse`));
  assert.ok(!urluri.has(`${PLATFORM_ORIGIN}/blog/autor/autor-doar-ascuns`));
});

/* ─── Domeniul propriu ─────────────────────────────────────────────────── */

const BAZA = "https://magazin-client.ro";
/*
  Design publicat cu pagina de catalog: varianta `toolbar` are `surface: "page"`.
  ⚠ `version`, `chrome` si `home` sunt obligatorii: fara ele `parseStoreDesign`
  vede un design GOL si cade pe cel clasic, unde pagina de catalog e `none` —
  si atunci proba ar fi verificat altceva decat crede.
*/
const DESIGN_CU_CATALOG = { version: 1, chrome: {}, home: [], shop: { page: { id: "shop_page", kind: "shop_page", variant: "toolbar", settings: {} } } };
const DESIGN_FARA_CATALOG = { version: 1, chrome: {}, home: [], shop: { page: { id: "shop_page", kind: "shop_page", variant: "none", settings: {} } } };

function magazin(pageContent: Record<string, unknown> = {}, design: unknown = DESIGN_CU_CATALOG) {
  return {
    updated_at: "2026-09-01T10:00:00.000Z",
    store_settings: { page_content: pageContent, storefront_design: design, store_policies: { return: { enabled: false } } },
  };
}

const DATE: DateMagazinPentruSitemap = {
  categorii: [
    { id: "c1", name: "Flori", parent_id: null, is_active: true },
    { id: "c2", name: "Stinsa", parent_id: null, is_active: false },
    { id: "c3", name: "Flori", parent_id: null, is_active: true }, // acelasi segment ca „Flori"
  ],
  produse: [
    { slug: "trandafiri", updated_at: "2026-08-20T00:00:00.000Z" },
    { slug: null, updated_at: null },
  ],
  pagini: [
    { slug: "despre-noi", updated_at: "2026-08-10T00:00:00.000Z", seo: {} },
    { slug: "ascunsa", updated_at: null, seo: { noindex: true } },
  ],
};

test("sitemapul domeniului propriu: fiecare adresa e pe acel domeniu, si numai pe el", () => {
  const intrari = intrariMagazin(BAZA, magazin(), DATE);
  assert.ok(intrari.length > 0);
  for (const e of intrari) {
    assert.ok(e.url === BAZA || e.url.startsWith(`${BAZA}/`), `${e.url} nu e pe domeniul magazinului`);
    assert.ok(!e.url.includes("edinio.com"), `${e.url} trimite la platforma`);
  }
});

test("sitemapul domeniului propriu are: start, catalog, categorii vizibile, produse, politici indexabile, pagini proprii", () => {
  const urluri = intrariMagazin(BAZA, magazin(), DATE).map((e) => e.url);
  assert.deepEqual(urluri, [
    BAZA,
    `${BAZA}/magazin`,
    `${BAZA}/magazin/flori`,
    `${BAZA}/product/trandafiri`,
    `${BAZA}/politici/termeni`,
    `${BAZA}/politici/livrare`,
    `${BAZA}/politici/confidentialitate`,
    `${BAZA}/politici/gdpr`,
    `${BAZA}/politici/anulare`,
    `${BAZA}/despre-noi`,
  ]);
});

test("pagina principala e indexabila implicit, si iese doar la noindex de comerciant", () => {
  assert.equal(intrariMagazin(BAZA, magazin(), DATE)[0]?.url, BAZA);
  const cuNoindex = intrariMagazin(BAZA, magazin({ seo: { noindex: true } }), DATE).map((e) => e.url);
  assert.ok(!cuNoindex.includes(BAZA), "pagina principala noindex a ramas in sitemap");
  /* Produsele si paginile proprii raman: pagina lor nu asculta de `noindex`-ul
     de magazin. Catalogul, categoriile si politicile ies: `pagina-magazin.tsx`
     si `politici/[type]` le pun `noindex` in acelasi caz, iar un sitemap care
     le-ar anunta ar fi contradictia pe care Search Console o raporteaza. */
  assert.ok(cuNoindex.includes(`${BAZA}/product/trandafiri`));
  assert.ok(cuNoindex.includes(`${BAZA}/despre-noi`));
  assert.ok(!cuNoindex.some((u) => /\/magazin(\/|$)/.test(u)), "catalogul sau o categorie au ramas desi magazinul e noindex");
  assert.ok(!cuNoindex.some((u) => u.includes("/politici/")), "politicile au ramas desi magazinul e noindex");
});

test("politicile scoase anume de comerciant nu intra", () => {
  const urluri = intrariMagazin(BAZA, magazin({ seo: { politiciNoindex: ["termeni"] } }), DATE).map((e) => e.url);
  assert.ok(!urluri.includes(`${BAZA}/politici/termeni`));
  assert.ok(urluri.includes(`${BAZA}/politici/livrare`));
});

test("fara pagina de catalog nu intra nici catalogul, nici categoriile", () => {
  const urluri = intrariMagazin(BAZA, magazin({}, DESIGN_FARA_CATALOG), DATE).map((e) => e.url);
  assert.ok(!urluri.some((u) => /\/magazin(\/|$)/.test(u)));
  assert.ok(urluri.includes(`${BAZA}/product/trandafiri`));
});

test("magazinul cu un singur produs nu-si anunta paginile de produs", () => {
  const urluri = intrariMagazin(BAZA, magazin({ store_mode: "one_product", one_product_id: "p1" }), DATE).map((e) => e.url);
  assert.ok(!urluri.some((u) => u.includes("/product/")));
  assert.ok(urluri.includes(`${BAZA}/despre-noi`), "paginile proprii raman");
});

test("datele sunt cele adevarate, nu inventate", () => {
  const intrari = intrariMagazin(BAZA, magazin(), DATE);
  const produs = intrari.find((e) => e.url.endsWith("/product/trandafiri"));
  assert.ok(produs?.lastModified instanceof Date, "data produsului lipseste sau nu e Date");
  assert.equal(produs.lastModified.toISOString(), "2026-08-20T00:00:00.000Z");
  const paginaFaraData = intrariMagazin(BAZA, magazin(), { ...DATE, pagini: [{ slug: "x", updated_at: null, seo: {} }] })
    .find((e) => e.url.endsWith("/x"));
  assert.ok(paginaFaraData && !("lastModified" in paginaFaraData), "o pagina fara data a primit una inventata");
});
