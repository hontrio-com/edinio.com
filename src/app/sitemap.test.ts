import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { paginiDeSite, PUSE_SEPARAT, dataTaxonomiei } from "./sitemap";
import {
  COMPETITORS,
  INDUSTRIES,
  RESOURCES,
  SOLUTION_COLUMNS,
  TOP_NAV,
} from "@/lib/website/nav";

/*
  ═══ DE CE EXISTA PROBELE ASTEA ═══

  Pe 30.08.2026 s-a descoperit ca ZECE pagini vii lipseau cu totul din sitemap:
  /blog, /integrari, /magazin-online, /optimizare, /mentenanta-gratuita, /vs,
  /industrii, /intrebari-frecvente, /migrare si /start. Toate raspundeau 200.

  Nu le observase nimeni luni de zile, si e usor de inteles de ce: o pagina
  lipsa dintr-un sitemap nu strica nimic, nu da nicio eroare si nu apare in
  niciun jurnal. Doar nu e gasita. E cel mai tacut fel de defect — si lovise
  tocmai paginile de comparatie si cele pe industrii, adica pe cele care aduc
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

test("fiecare pagina de industrie e anuntata", () => {
  assert.ok(ANUNTATE.has("/industrii"), "lipseste indexul /industrii");
  for (const i of INDUSTRIES) {
    assert.ok(ANUNTATE.has(`/industrii/${i.slug}`), `/industrii/${i.slug} lipseste din sitemap`);
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
  assert.equal(d.toISOString(), "2026-08-31T10:00:00.000Z");
});

test("articolul mai nou o bate pe a taxonomiei", () => {
  const d = dataTaxonomiei("2026-08-01T00:00:00.000Z", [ART("2026-08-30T09:00:00.000Z", "2026-08-02T00:00:00.000Z")]);
  assert.equal(d.toISOString(), "2026-08-30T09:00:00.000Z");
});

test("fără data taxonomiei se cade înapoi pe articole", () => {
  const d = dataTaxonomiei(null, [ART("2026-08-30T09:00:00.000Z", "2026-08-02T00:00:00.000Z")]);
  assert.equal(d.toISOString(), "2026-08-30T09:00:00.000Z");
});

test("o dată stricată nu produce `Invalid Date` în sitemap", () => {
  /* ⚠ `lastModified` ajunge la `toISOString()` în XML. Un `Invalid Date` acolo
     ar arunca, deci ar strica sitemapul ÎNTREG pentru o singură rubrică. */
  const d = dataTaxonomiei("nu-e-o-data", [ART("2026-08-30T09:00:00.000Z", "2026-08-02T00:00:00.000Z")]);
  assert.ok(!Number.isNaN(d.getTime()), "a ieșit Invalid Date");
  assert.equal(d.toISOString(), "2026-08-30T09:00:00.000Z");
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
  const sursa = readFileSync("src/app/sitemap.ts", "utf8").replace(/\r\n/g, "\n");
  const inventate = [...sursa.matchAll(/lastModified:\s*new Date\(\s*\)/g)];
  assert.deepEqual(
    inventate.map((m) => m[0]),
    [],
    "s-a reintrodus o data inventata; foloseste un camp adevarat sau omite `lastModified`",
  );
});
