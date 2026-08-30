import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   O CHEIE STRAINA FARA INDEX FACE STERGEREA SA CADA (27.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ CE S-A INTAMPLAT. Stergerea in masa a 340 de produse cadea cu „Eroare la actiunea in masa",
   de sapte ori la rand. In `error_logs` scria motivul adevarat: `canceling statement due to
   statement timeout`.

   O cheie straina care arata spre `products` obliga Postgres, la fiecare rand sters, sa caute
   randurile care il pomenesc. Fara index pe coloana care arata, cautarea aia e o SCANARE INTREAGA
   a tabelei care arata — o data pentru fiecare produs sters.

   Masurat cu `explain (analyze)` pe productie, stergerea UNUI produs:

       total .......................................... 3018 ms
       `product_import_rows_product_id_fkey` .......... 2270 ms   (386.378 randuri, ZERO indexuri)
       `catalog_index_cuvant_product_id_fkey` .......... 725 ms   (205.101 randuri)
       tot restul, 16 chei straine ..................... ~10 ms

   Dupa indexuri: 3018 ms → 19,6 ms.

   ⚠ SI DE CE E O PROBA, NU O REPARATIE. Defectul nu se vede in cod, nu se vede la typecheck si nu
   se vede la nicio proba obisnuita: apare abia cand tabela care arata creste destul. `products` are
   optsprezece chei straine care arata spre el, si fiecare tabela noua adaugata maine e inca una.
   Proba scaneaza baseline-ul si cere index pentru fiecare.

   ⚠ INDEXUL COMPUS NU E DE AJUNS DACA COLOANA NU E PRIMA. `catalog_index_cuvant` avea `product_id`
   in cheia primara `(business_id, cuvant, product_id)` — a treia coloana — si tot scana. De aia
   proba cere coloana pe PRIMA pozitie.
*/

const baseline = readFileSync("migrations/000-schema-baseline.sql", "utf8");

/** Cheile straine, asa cum le scrie baseline-ul. */
function cheiStraine(): { tabela: string; coloana: string; nume: string; tinta: string }[] {
  const re = /alter table public\.(\w+) add constraint (\w+) FOREIGN KEY \(([^)]+)\) REFERENCES (\w+)\(/g;
  const out: { tabela: string; coloana: string; nume: string; tinta: string }[] = [];
  for (const m of baseline.matchAll(re)) {
    const coloane = m[3].split(",").map((c) => c.trim().replace(/"/g, ""));
    /* Cheile compuse se judeca dupa PRIMA coloana: asa le foloseste si planificatorul. */
    out.push({ tabela: m[1], coloana: coloane[0], nume: m[2], tinta: m[4] });
  }
  return out;
}

/** Coloanele care stau PRIMA intr-un index al tabelei. */
/*
 * ⚠ FARA REGEX CONSTRUIT DINTR-UN TEMPLATE LITERAL. Prima variantă scria
 * `new RegExp(\`… \\w+ ON public\\.${tabela} …\`)`, iar în drumul până în fișier dublarea s-a
 * pierdut: în șablon a ajuns `\w`, care în JavaScript nu e o secvență validă și se citește pur și
 * simplu ca litera `w`. Regexul căuta atunci „INDEX w+ ON…", nu găsea nimic, și proba raporta că
 * TOATE cheile străine n-au index — inclusiv cele despre care tocmai măsurasem că au.
 *
 * Un scan pe linii nu are cum să pățească asta.
 */
const LINII_INDEX = baseline.split("\n").filter((l) => l.startsWith("CREATE ") && l.includes(" INDEX "));

/*
 * ⚠ SI CHEILE PRIMARE, SI CELE UNICE. Prima variantă citea doar liniile `CREATE INDEX` — dar
 * Postgres face un index și pentru fiecare `PRIMARY KEY` și fiecare `UNIQUE`. `catalog_murdar` și
 * `catalog_produs` au cheia primară chiar pe `product_id`, deci erau perfect indexate, iar proba
 * le raporta ca lipsă. O probă care strigă pe nedrept se învață repede să fie ignorată.
 */
const LINII_CONSTRANGERE = baseline.split("\n")
  .filter((l) => l.startsWith("alter table public.") && /(PRIMARY KEY|UNIQUE) \(/.test(l));

function primaColoana(desc: string): string {
  return desc.split(",")[0].trim().replace(/"/g, "").replace(/\s+(ASC|DESC|NULLS.*)$/i, "");
}

function primaColoanaDinIndexuri(tabela: string): Set<string> {
  const out = new Set<string>();

  const pePublic = ` ON public.${tabela} USING `;
  for (const linie of LINII_INDEX) {
    if (!linie.includes(pePublic)) continue;
    const p = primaColoana(linie.slice(linie.indexOf("(") + 1, linie.indexOf(")")));
    if (p) out.add(p);
  }

  const prefix = `alter table public.${tabela} add constraint `;
  for (const linie of LINII_CONSTRANGERE) {
    if (!linie.startsWith(prefix)) continue;
    const i = linie.search(/(PRIMARY KEY|UNIQUE) \(/);
    const desc = linie.slice(linie.indexOf("(", i) + 1, linie.indexOf(")", i));
    const p = primaColoana(desc);
    if (p) out.add(p);
  }

  return out;
}

test("⚠ fiecare cheie straina spre `products` are index pe coloana ei", () => {
  const chei = cheiStraine().filter((c) => c.tinta === "products");
  /* Daca numarul scade brusc, s-a schimbat forma baseline-ului si proba a orbit. */
  assert.ok(chei.length >= 15, `am gasit doar ${chei.length} chei straine spre products`);

  const fara = chei.filter((c) => !primaColoanaDinIndexuri(c.tabela).has(c.coloana));
  assert.deepEqual(fara.map((c) => `${c.tabela}.${c.coloana} (${c.nume})`), [],
    "chei straine spre `products` fara index: fiecare face stergerea unui produs sa scaneze toata tabela");
});

test("⚠ si cele doua care au picat chiar au acum index", () => {
  /* Numite anume: sunt cele masurate, si o proba care le pierde din vedere n-ar mai spune nimic. */
  assert.match(baseline, /CREATE INDEX product_import_rows_product_id_idx ON public\.product_import_rows USING btree \(product_id\)/);
  assert.match(baseline, /CREATE INDEX catalog_index_cuvant_product_id_idx ON public\.catalog_index_cuvant USING btree \(product_id\)/);
});

test("⚠ regula tine si pentru `orders`, nu doar pentru `products`", () => {
  /*
   * Aceeasi mecanica: stergerea unei comenzi cauta in fiecare tabela care arata spre ea. Nu s-a
   * plans nimeni inca, dar defectul e identic si tacut pana in ziua in care nu mai e.
   */
  const chei = cheiStraine().filter((c) => c.tinta === "orders");
  const fara = chei.filter((c) => !primaColoanaDinIndexuri(c.tabela).has(c.coloana));
  assert.deepEqual(fara.map((c) => `${c.tabela}.${c.coloana} (${c.nume})`), []);
});
