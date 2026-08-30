import { strict as assert } from "node:assert";
import { test } from "node:test";
import { paginiDeSite, PUSE_SEPARAT } from "./sitemap";
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
