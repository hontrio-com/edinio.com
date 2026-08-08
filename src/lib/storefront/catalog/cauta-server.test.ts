import assert from "node:assert/strict";
import { test } from "node:test";
import { ordoneazaSiFeliaza, sortareLaCautare } from "./cauta-server";
import { documentDeCautare } from "./doc-cautare";
import { dinProiectie, type RandProiectie } from "./din-proiectie";
import { comparatorSortare, type CheieSortare } from "./sortare";
import { buildProductSearchIndex, queryProductSearchIndex } from "@/lib/storefront/product-search";

/**
 * POARTA FAZEI A4: cautarea pe server trebuie sa dea EXACT ce da browserul.
 *
 * Nu „aproape", nu „aceleasi rezultate in alta ordine". Toata schema — Postgres
 * alege candidatii, Node le da scorul — se sprijina pe un singur invariant: un
 * set de candidati mai LARG nu schimba nimic din ce se vede. Produsele care nu
 * potrivesc cad la `MATCH_MIN`, iar ordinea celor care potrivesc nu depinde de
 * cine mai era in lista.
 *
 * Daca invariantul cade, cade toata faza: `catalog_cauta` intoarce un superset
 * (cuvinte apropiate, nu potriviri exacte), iar rezultatul trebuie sa fie acelasi
 * ca peste tot catalogul.
 */

let n = 0;
function rand(nume: string, extra: Partial<RandProiectie> = {}): RandProiectie {
  n += 1;
  // Id-uri stabile si crescatoare: departajarea finala a sortarilor e pe id, deci
  // un id aleator ar fi facut testul sa treaca sau nu in functie de noroc.
  const id = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  return {
    product_id: id,
    name: nume,
    slug: null,
    category: null,
    prima_imagine: null,
    price: 100,
    compare_at_price: null,
    is_featured: false,
    is_bundle: false,
    track_inventory: false,
    stock_quantity: null,
    sort_order: 0,
    creat: "2026-01-01T00:00:00.000Z",
    fara_stoc: false,
    price_min: 100,
    price_max: 100,
    has_range: false,
    fara_oferta: false,
    optiuni: null,
    descriere_scurta: "",
    fatete: null,
    ...extra,
  };
}

/** Calea PALIERULUI CLIENT, scrisa aici din aceleasi piese ca in MiniStoreRenderer. */
function caleaDinBrowser(
  totCatalogul: RandProiectie[],
  q: string,
  sortare: CheieSortare,
  perPagina: number,
  pagina: number,
): string[] {
  const produse = totCatalogul.map(dinProiectie);
  const idx = buildProductSearchIndex(produse.map(documentDeCautare));
  const scoruri = queryProductSearchIndex(idx, q);
  const lista = produse.filter((p) => !scoruri || scoruri.has(p.id));
  lista.sort(comparatorSortare(sortare, scoruri));
  return lista.slice((pagina - 1) * perPagina, pagina * perPagina).map((p) => p.id);
}

const CATALOG = [
  rand("Bocanci de protectie ARDON", { category: "Bocanci", price_min: 210, price_max: 210 }),
  rand("Bocanci de protectie Portwest", { category: "Bocanci", price_min: 180, price_max: 180 }),
  rand("Manusi de protectie nitril", { category: "Manusi", price_min: 12, price_max: 12 }),
  rand("Casca de protectie alba", { category: "Casti", price_min: 45, price_max: 45 }),
  rand("Vesta reflectorizanta", {
    category: "Veste",
    price_min: 30,
    price_max: 30,
    descriere_scurta: "Vesta de protectie pentru drumuri",
  }),
  rand("Salopeta de lucru", { category: "Salopete", price_min: 150, price_max: 150 }),
  rand("Ochelari de protectie", { category: "Ochelari", price_min: 25, price_max: 25 }),
  rand("Aspirator industrial", { category: "Curatenie", price_min: 900, price_max: 900 }),
  // Cu variante pornite: valorile intra in cautare cu ponderea lor.
  rand("Tricou de lucru", {
    category: "Tricouri",
    price_min: 40,
    price_max: 40,
    optiuni: { variants: { enabled: true, options: [{ name: "Culoare", values: ["Rosu", "Albastru"] }] } },
  }),
  // Aceleasi variante, dar STINSE: nu au voie sa fie gasite.
  rand("Pantalon de lucru", {
    category: "Pantaloni",
    price_min: 90,
    price_max: 90,
    optiuni: { variants: { enabled: false, options: [{ name: "Culoare", values: ["Verde"] }] } },
  }),
];

const INTEROGARI = [
  "bocanci", "bocani", "bocan", "protectie", "manusa protectie", "csaca",
  "vesta drumuri", "rosu", "verde", "aspirator", "xyzqw", "de",
];
const SORTARI: CheieSortare[] = ["relevance", "price_asc", "price_desc", "name_asc", "newest", "popular"];

test("candidatii mai LARGI nu schimba rezultatul: server = browser, pe fiecare sortare", () => {
  for (const q of INTEROGARI) {
    for (const sortare of SORTARI) {
      // Serverul primeste TOT catalogul ca „candidati" — cazul cel mai larg
      // posibil, adica exact ce face `catalog_cauta` la un cuvant comun.
      const pePagina = 4;
      for (const pagina of [1, 2, 3]) {
        const server = ordoneazaSiFeliaza(CATALOG, q, sortare, pePagina, (pagina - 1) * pePagina);
        const browser = caleaDinBrowser(CATALOG, q, sortare, pePagina, pagina);
        assert.deepEqual(
          server?.randuri.map((r) => r.product_id) ?? [],
          browser,
          `„${q}" / ${sortare} / pagina ${pagina}`,
        );
      }
    }
  }
});

test("candidatii STRANSI dau acelasi lucru ca cei largi", () => {
  /*
   * Asa lucreaza de fapt `catalog_cauta`: intoarce doar produsele care conțin
   * cuvintele, nu tot catalogul. Rezultatul trebuie sa fie identic cu cel obtinut
   * pornind de la tot catalogul — altfel numarul de pagini si `total` ar depinde
   * de cat de generos a fost SQL-ul, nu de ce a cerut vizitatorul.
   */
  for (const q of INTEROGARI) {
    const larg = ordoneazaSiFeliaza(CATALOG, q, "relevance", 50, 0);
    const idsLargi = new Set(larg?.randuri.map((r) => r.product_id) ?? []);
    // Candidati = potrivirile plus doua produse care nu potrivesc, in alta ordine.
    const strans = [...CATALOG].reverse().filter((r) => idsLargi.has(r.product_id));
    const inguste = ordoneazaSiFeliaza(strans, q, "relevance", 50, 0);
    assert.deepEqual(
      inguste?.randuri.map((r) => r.product_id) ?? [],
      larg?.randuri.map((r) => r.product_id) ?? [],
      `„${q}"`,
    );
    assert.equal(inguste?.total, larg?.total, `total pentru „${q}"`);
  }
});

test("totalul e cat a gasit motorul, nu cat a intors pagina", () => {
  /*
   * Sase produse au „protectie" undeva: cinci in nume (bocancii x2, manusile,
   * casca, ochelarii) si unul doar in DESCRIERE (vesta). Pagina cere doua, dar
   * `total` trebuie sa ramana sase — altfel numarul de pagini ar fi mereu 1 si
   * paginarea ar minti. Al saselea conteaza si separat: dovedeste ca descrierea
   * scurta chiar intra in index si pe calea de server.
   */
  const r = ordoneazaSiFeliaza(CATALOG, "protectie", "relevance", 2, 0);
  assert.equal(r?.randuri.length, 2);
  assert.equal(r?.total, 6);
  const ultima = ordoneazaSiFeliaza(CATALOG, "protectie", "relevance", 2, 4);
  assert.equal(ultima?.randuri.length, 2);
  assert.equal(ultima?.total, 6);
});

test("offset peste sfarsit da lista goala, nu ultima pagina", () => {
  const r = ordoneazaSiFeliaza(CATALOG, "aspirator", "relevance", 20, 200);
  assert.deepEqual(r?.randuri, []);
  assert.equal(r?.total, 1);
});

test("o interogare fara niciun cuvant intoarce null, nu tot catalogul", () => {
  // `null` inseamna „cade pe calea veche". Zero randuri ar fi insemnat „magazin
  // gol", iar tot catalogul ar fi insemnat „cautarea n-a filtrat nimic".
  assert.equal(ordoneazaSiFeliaza(CATALOG, "   ", "relevance", 20, 0), null);
  assert.equal(ordoneazaSiFeliaza(CATALOG, "!!!", "relevance", 20, 0), null);
});

test("variantele STINSE nu se gasesc, cele pornite da", () => {
  const rosu = ordoneazaSiFeliaza(CATALOG, "rosu", "relevance", 20, 0);
  assert.equal(rosu?.total, 1);
  assert.equal(rosu?.randuri[0].name, "Tricou de lucru");
  // „Verde" e pe un produs cu variantele stinse: o marime care nu se poate
  // cumpara n-are ce cauta in cautare.
  assert.equal(ordoneazaSiFeliaza(CATALOG, "verde", "relevance", 20, 0)?.total, 0);
});

test("sortarea implicita cat timp se cauta e RELEVANTA, nu cea a magazinului", () => {
  /*
   * Clasa de defect care a lovit de patru ori in proiectul asta: server si client
   * compun altfel aceeasi intrare, iese acelasi NUMAR de produse in alta ordine,
   * deci nu se vede din contoare. Browserul are `sortTouched = !!initialSort`,
   * deci fara `?sort=` in adresa ordinea e relevanta — si NU `default_sort`.
   */
  assert.equal(sortareLaCautare(""), "relevance");
  assert.equal(sortareLaCautare("price_asc"), "price_asc");
  assert.equal(sortareLaCautare("newest"), "newest");
});
