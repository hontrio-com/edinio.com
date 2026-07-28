import test from "node:test";
import assert from "node:assert/strict";
import { canonicalCatalog, citesteFiltreDinAdresa } from "./url";
import type { Fateta } from "./facets";

/**
 * Adresa paginii de catalog e contractul dintre server si client: serverul o
 * citeste ca stare initiala, clientul o rescrie la fiecare bifa. Daca cele doua
 * inteleg altceva, un link partajat arata alt catalog decat cel din care a fost
 * copiat.
 */

const fatete: Fateta[] = [
  { cheie: "brand", eticheta: "Brand", grup: "brand", valori: [{ valoare: "ARDON", cate: 9 }, { valoare: "3M", cate: 4 }] },
  { cheie: "tag", eticheta: "Etichete", grup: "eticheta", valori: [{ valoare: "Textile", cate: 5 }] },
];

test("filtrele din adresa se citesc doar daca exista in catalog", () => {
  const f = citesteFiltreDinAdresa({ brand: "ARDON|3M", tag: "Textile" }, fatete);
  assert.deepEqual(f.fatete, { brand: ["ARDON", "3M"], tag: ["Textile"] });
});

test("o cheie necunoscuta din adresa e ignorata", () => {
  const f = citesteFiltreDinAdresa({ "s.Inexistent": "orice", utm_source: "reclama" }, fatete);
  assert.deepEqual(f.fatete, {});
});

test("o valoare disparuta din catalog cade, restul filtrului ramane", () => {
  // Comerciantul a sters produsele 3M intre timp. Linkul vechi nu are voie sa
  // intoarca zero produse: cade filtrul, nu catalogul.
  const f = citesteFiltreDinAdresa({ brand: "ARDON|Disparut" }, fatete);
  assert.deepEqual(f.fatete, { brand: ["ARDON"] });
});

test("parametrii rezervati nu sunt confundati cu fatete", () => {
  const f = citesteFiltreDinAdresa({ cat: "Manusi", q: "bocanci", page: "3", sale: "1", stoc: "1", pmin: "50", pmax: "300" }, fatete);
  assert.equal(f.categorie, "Manusi");
  assert.equal(f.cautare, "bocanci");
  assert.equal(f.pagina, 3);
  assert.equal(f.reduceri, true);
  assert.equal(f.stoc, true);
  assert.equal(f.pretMin, "50");
  assert.equal(f.pretMax, "300");
  assert.deepEqual(f.fatete, {});
});

test("o pagina invalida cade pe prima, nu pe NaN", () => {
  for (const page of ["0", "-2", "abc", ""]) {
    assert.equal(citesteFiltreDinAdresa({ page }, fatete).pagina, 1);
  }
});

test("un pret negativ sau nenumeric se ignora", () => {
  assert.equal(citesteFiltreDinAdresa({ pmin: "-5" }, fatete).pretMin, "");
  assert.equal(citesteFiltreDinAdresa({ pmax: "multi bani" }, fatete).pretMax, "");
});

test("canonicalul urmeaza categoria, reducerile si pagina", () => {
  const { url } = canonicalCatalog("https://x.ro/magazin", { cat: "Articole casa", sale: "1", page: "2" });
  assert.equal(url, "https://x.ro/magazin?cat=Articole%20casa&sale=1&page=2");
});

test("spatiile din canonical se codifica cu %20, nu cu plus", () => {
  // `URLSearchParams` le-ar scrie cu `+`, deci canonicalul ar arata catre alta
  // adresa decat cea pe care a crawlat-o Google.
  const { url } = canonicalCatalog("https://x.ro/magazin", { cat: "Baie & bucatarie" });
  assert.equal(url, "https://x.ro/magazin?cat=Baie%20%26%20bucatarie");
});

test("prima pagina si cautarea nu intra in canonical", () => {
  const { url } = canonicalCatalog("https://x.ro/magazin", { page: "1", q: "bocanci" });
  assert.equal(url, "https://x.ro/magazin");
});

test("un singur filtru ramane indexabil, doua nu", () => {
  // „Bocanci ARDON" e o pagina cu inteles; de la doua bife incolo incep
  // combinatiile, iar acelea ar deschide un spatiu de crawl fara fund.
  assert.equal(canonicalCatalog("https://x.ro/magazin", { brand: "ARDON" }).indexabila, true);
  assert.equal(canonicalCatalog("https://x.ro/magazin", { brand: "ARDON", tag: "Textile" }).indexabila, false);
  assert.equal(canonicalCatalog("https://x.ro/magazin", { q: "bocanci", stoc: "1" }).indexabila, false);
});

test("categoria si pagina singure raman indexabile", () => {
  assert.equal(canonicalCatalog("https://x.ro/magazin", { cat: "Manusi", page: "2", sale: "1" }).indexabila, true);
});

test("sortarea din adresa e acceptata doar daca o stie catalogul", () => {
  assert.equal(citesteFiltreDinAdresa({ sort: "price_asc" }, fatete).sortare, "price_asc");
  assert.equal(citesteFiltreDinAdresa({ sort: "inventata" }, fatete).sortare, "");
  // „relevance" nu se salveaza: exista doar cat timp e o cautare activa, deci un
  // link cu ea ar fi cerut o ordine care nu se poate reface.
  assert.equal(citesteFiltreDinAdresa({ sort: "relevance" }, fatete).sortare, "");
});
