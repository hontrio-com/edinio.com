import test from "node:test";
import assert from "node:assert/strict";
import { canonicalCatalog, citesteFiltreDinAdresa, scrieFiltre } from "./url";
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
  const f = citesteFiltreDinAdresa({ brand: ["ARDON", "3M"], tag: "Textile" }, fatete);
  assert.deepEqual(f.fatete, { brand: ["ARDON", "3M"], tag: ["Textile"] });
});

test("o cheie necunoscuta din adresa e ignorata", () => {
  const f = citesteFiltreDinAdresa({ "s.Inexistent": "orice", utm_source: "reclama" }, fatete);
  assert.deepEqual(f.fatete, {});
});

test("o valoare disparuta din catalog cade, restul filtrului ramane", () => {
  // Comerciantul a sters produsele 3M intre timp. Linkul vechi nu are voie sa
  // intoarca zero produse: cade filtrul, nu catalogul.
  const f = citesteFiltreDinAdresa({ brand: ["ARDON", "Disparut"] }, fatete);
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
  assert.equal(canonicalCatalog("https://x.ro/magazin", { brand: "ARDON" }, fatete).indexabila, true);
  assert.equal(canonicalCatalog("https://x.ro/magazin", { brand: "ARDON", tag: "Textile" }, fatete).indexabila, false);
  assert.equal(canonicalCatalog("https://x.ro/magazin", { q: "bocanci", stoc: "1" }, fatete).indexabila, false);
});

test("categoria si pagina singure raman indexabile", () => {
  assert.equal(canonicalCatalog("https://x.ro/magazin", { cat: "Manusi", page: "2", sale: "1" }, fatete).indexabila, true);
});

test("sortarea din adresa e acceptata doar daca o stie catalogul", () => {
  assert.equal(citesteFiltreDinAdresa({ sort: "price_asc" }, fatete).sortare, "price_asc");
  assert.equal(citesteFiltreDinAdresa({ sort: "inventata" }, fatete).sortare, "");
  // „relevance" nu se salveaza: exista doar cat timp e o cautare activa, deci un
  // link cu ea ar fi cerut o ordine care nu se poate reface.
  assert.equal(citesteFiltreDinAdresa({ sort: "relevance" }, fatete).sortare, "");
});

test("o valoare care contine bara verticala nu se rupe in doua filtre", () => {
  /*
   * Valorile se repeta in adresa, nu se unesc cu un separator. Un separator ar
   * fi cerut un caracter care nu poate aparea intr-o valoare, si nu exista unul:
   * etichetele vin din text scris de comerciant sau din CSV.
   */
  const cuBara: Fateta[] = [
    { cheie: "tag", eticheta: "Etichete", grup: "eticheta", valori: [{ valoare: "A|B", cate: 3 }, { valoare: "C", cate: 2 }] },
  ];
  assert.deepEqual(citesteFiltreDinAdresa({ tag: "A|B" }, cuBara).fatete, { tag: ["A|B"] });
});

test("parametrii de urmarire nu trec pagina pe noindex", () => {
  /*
   * `utm_source` + `utm_campaign` inseamna aterizarea din orice reclama, adica
   * exact traficul pe care comerciantul plateste. Numarati ca filtre, ar fi
   * scos din index fix acele pagini.
   */
  const sp = { utm_source: "facebook", utm_campaign: "toamna", fbclid: "xyz", gclid: "abc" };
  assert.equal(canonicalCatalog("https://x.ro/magazin", sp, fatete).indexabila, true);
});

test("doua fatete adevarate trec pagina pe noindex, chiar cu etichete de campanie", () => {
  const sp = { brand: "ARDON", tag: "Textile", utm_source: "facebook" };
  assert.equal(canonicalCatalog("https://x.ro/magazin", sp, fatete).indexabila, false);
});

test("interogarea compusa codifica spatiile cu %20, ca linkurile si canonicalul", () => {
  const qs = scrieFiltre({ categorie: "Articole casa", cautare: "banda adeziva" });
  assert.equal(qs, "cat=Articole%20casa&q=banda%20adeziva");
  assert.ok(!qs.includes("+"));
});

test("interogarea compusa repeta cheia pentru fiecare valoare bifata", () => {
  assert.equal(scrieFiltre({ fatete: { brand: ["ARDON", "3M"] } }), "brand=ARDON&brand=3M");
});

test("ce se scrie in adresa se poate citi inapoi identic", () => {
  // Serverul citeste, clientul scrie: daca cele doua nu se inteleg, un link
  // partajat arata alt catalog decat cel din care a fost copiat.
  const stare = { categorie: "Manusi", cautare: "bocanci", reduceri: true, stoc: true, pretMin: "50", pretMax: "300", sortare: "price_asc", fatete: { brand: ["ARDON"], tag: ["Textile"] } };
  const qs = scrieFiltre(stare);
  const sp: Record<string, string | string[]> = {};
  for (const [k, v] of new URLSearchParams(qs)) {
    const existent = sp[k];
    if (existent === undefined) sp[k] = v;
    else sp[k] = Array.isArray(existent) ? [...existent, v] : [existent, v];
  }
  const citit = citesteFiltreDinAdresa(sp, fatete);
  assert.equal(citit.categorie, stare.categorie);
  assert.equal(citit.cautare, stare.cautare);
  assert.equal(citit.reduceri, true);
  assert.equal(citit.stoc, true);
  assert.equal(citit.pretMin, "50");
  assert.equal(citit.pretMax, "300");
  assert.equal(citit.sortare, "price_asc");
  assert.deepEqual(citit.fatete, stare.fatete);
});

test("fara pret in adresa, filtrul de pret NU exista", () => {
  /*
   * `Number("")` e zero, finit si pozitiv. Fara verificarea pe sirul gol,
   * fiecare incarcare a paginii de catalog pornea cu „de la 0 pana la 0 lei" si
   * arata „Niciun produs gasit" — la 1221 de produse in magazin.
   */
  const f = citesteFiltreDinAdresa({ cat: "Manusi" }, fatete);
  assert.equal(f.pretMin, "");
  assert.equal(f.pretMax, "");
});

test("un pret gol scris explicit in adresa e tot nimic", () => {
  const f = citesteFiltreDinAdresa({ pmin: "", pmax: "   " }, fatete);
  assert.equal(f.pretMin, "");
  assert.equal(f.pretMax, "");
});

test("zero scris ANUME ramane zero", () => {
  // „de la 0" e o cerinta legitima; doar absenta trebuie sa insemne absenta.
  assert.equal(citesteFiltreDinAdresa({ pmin: "0" }, fatete).pretMin, "0");
});
