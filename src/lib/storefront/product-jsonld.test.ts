import assert from "node:assert/strict";
import { test } from "node:test";
import { buildProductJsonLd } from "./product-jsonld";

/**
 * Codul de bare al produsului ajunge in datele structurate ale paginii publice.
 *
 * Comerciantul il scria in formularul de produs si il vedea afisat la
 * specificatii, dar `buildProductJsonLd` nu-l citea: pagina declara un produs
 * fara niciun identificator, iar Google Merchant nu avea cu ce sa confirme ce
 * primea prin feed. De aici veneau respingerile la aprobare.
 */

const SHIPPING = { cost: 20, min: 1, max: 3 };

const produs = (google: Record<string, string>) => ({
  name: "Saltea Ortopedica",
  description: null,
  price: 1200,
  images: null,
  page_sections: { google },
});

function build(google: Record<string, string>) {
  return buildProductJsonLd(produs(google), "https://exemplu.ro/product/saltea", "Exemplu", SHIPPING) as
    Record<string, unknown>;
}

test("un GTIN valid ajunge in datele structurate", () => {
  // Cifra de control a lui 594123456789 e 9 (suma ponderata 131), deci codul
  // asta trece verificarea mod 10, iar cel din testul de mai jos, cu 0, pica.
  assert.equal(build({ gtin: "5941234567899" }).gtin, "5941234567899");
});

test("spatiile din cod se curata inainte de scriere", () => {
  assert.equal(build({ gtin: "594 1234 567899" }).gtin, "5941234567899");
});

test("un GTIN cu cifra de control gresita NU se scrie", () => {
  // Un cod respins de Google e mai rau decat un camp lipsa: produsul pica, in
  // loc sa fie doar mai putin bogat. Deci se lasa afara si comerciantul vede.
  assert.equal("gtin" in build({ gtin: "5941234567890" }), false);
});

test("un GTIN cu numar gresit de cifre NU se scrie", () => {
  assert.equal("gtin" in build({ gtin: "12345" }), false);
});

test("codul de fabricant se scrie cand exista", () => {
  assert.equal(build({ mpn: "SO-160200" }).mpn, "SO-160200");
});

test("campurile goale nu apar deloc, nu apar goale", () => {
  const jsonLd = build({ gtin: "", mpn: "   " });
  assert.equal("gtin" in jsonLd, false);
  assert.equal("mpn" in jsonLd, false);
});

test("un produs fara sectiunea google nu se strica", () => {
  const jsonLd = buildProductJsonLd(
    { name: "Simplu", description: null, price: 10, images: null },
    "https://exemplu.ro/product/simplu",
    "Exemplu",
    SHIPPING,
  ) as Record<string, unknown>;
  assert.equal("gtin" in jsonLd, false);
  assert.equal(jsonLd.name, "Simplu");
});

/* ─── Pretul publicat catre Google ─────────────────────────────────────────── */

/**
 * Ramura simpla publica pretul de BAZA, iar pe un produs cu variante baza poate
 * sa nu fie de vanzare deloc: ANTIFOANE INT UF REFILL are baza 156,80 si singura
 * combinatie activa 438,00. Pagina scria 438, microdatele 156,80 — adica exact
 * contradictia pentru care Merchant Center suspenda un cont.
 */
const variabil = (combinations: unknown[], price = 156.8, track = false) => ({
  name: "ANTIFOANE INT UF REFILL",
  description: null,
  price,
  images: null,
  track_inventory: track,
  page_sections: {
    variants: {
      enabled: true,
      options: [{ id: "o1", name: "Marime", values: ["S", "M"] }],
      combinations,
    },
  },
});

const oferta = (combinations: unknown[], price?: number, track = false) =>
  (buildProductJsonLd(variabil(combinations, price, track), "https://exemplu.ro/p", "Exemplu", SHIPPING) as
    Record<string, unknown>).offers as Record<string, unknown>;

test("o singura combinatie: se publica pretul EI, nu baza", () => {
  const o = oferta([{ title: "S", enabled: true, price: 438 }]);
  assert.equal(o["@type"], "Offer");
  assert.equal(o.price, 438);
});

test("toate marimile la acelasi pret: tot pretul lor, nu baza", () => {
  const o = oferta([{ title: "S", enabled: true, price: 203 }, { title: "M", enabled: true, price: 203 }]);
  assert.equal(o["@type"], "Offer");
  assert.equal(o.price, 203);
});

test("titlurile duplicate nu inventeaza un interval", () => {
  // Conteaza PRIMA combinatie, ca peste tot: altfel Google primeste „203-231"
  // pentru o marime care se vinde cu 203.
  const o = oferta([{ title: "S", enabled: true, price: 203 }, { title: "S", enabled: true, price: 231 }]);
  assert.equal(o["@type"], "Offer");
  assert.equal(o.price, 203);
});

test("preturi diferite: interval, cu atatea oferte cate se pot cumpara", () => {
  const o = oferta([
    { title: "S", enabled: true, price: 203 },
    { title: "M", enabled: true, price: 231 },
    { title: "L", enabled: false, price: 5 },
  ]);
  assert.equal(o["@type"], "AggregateOffer");
  assert.equal(o.lowPrice, 203);
  assert.equal(o.highPrice, 231);
  assert.equal(o.offerCount, 2, "combinatia stinsa nu e o oferta");
});

test("niciuna de vanzare: nu se declara in stoc catre Google", () => {
  const o = oferta([{ title: "S", enabled: false, price: 438 }]);
  assert.equal(o.availability, "https://schema.org/OutOfStock");
});

test("toate marimile cu stocul terminat, la un produs care isi tine stocul", () => {
  const o = oferta([{ title: "S", enabled: true, price: 438, stock_quantity: 0 }], undefined, true);
  assert.equal(o.availability, "https://schema.org/OutOfStock");
});

test("acelasi produs, dar cu urmarirea stocului OPRITA, ramane in stoc", () => {
  // 171 de produse publicate la un singur magazin arata asa: zerourile vin din
  // valoarea implicita a importului, iar comerciantul a stins tocmai urmarirea
  // stocului. Declarate epuizate aici, microdatele ar contrazice feedul trimis
  // catre acelasi Merchant Center.
  const o = oferta([{ title: "S", enabled: true, price: 438, stock_quantity: 0 }]);
  assert.equal(o.availability, "https://schema.org/InStock");
});

/* ─── Coduri pe VARIANTA: `ProductGroup` + `hasVariant` ──────────────────────
 *
 * Reclamat de un comerciant: completase „Cod EAN" la toate cele sapte culori ale
 * unei huse si niciunul nu aparea in datele structurate. Nici nu avea unde —
 * pagina citea doar codul de la nivel de produs, iar un singur `Offer` n-are loc
 * pentru sapte coduri diferite.
 *
 * Probele astea pazesc AMANDOUA jumatatile: ca variantele cu cod ies pe forma
 * noua, si ca restul catalogului (2300 de produse cu variante fara coduri) NU se
 * muta pe ea.
 */

/** Cele sapte culori reale ale produsului reclamat, cu codurile lui. */
const CULORI = [
  { title: "Gri", gtin: "0682643488768" },
  { title: "Bej", gtin: "0682643488799" },
  { title: "Bordo", gtin: "0682643488744" },
];

const cuCulori = (combinations: unknown[], optiune = "Culoare") => ({
  id: "prod-1",
  name: "Husa de Pat",
  description: null,
  price: 100,
  images: ["/a.webp"],
  sku: "HUSA-180",
  page_sections: {
    variants: { enabled: true, options: [{ id: "o1", name: optiune, values: ["Gri", "Bej", "Bordo"] }], combinations },
  },
});

const grup = (combinations: unknown[], optiune?: string) =>
  buildProductJsonLd(cuCulori(combinations, optiune), "https://exemplu.ro/p", "Exemplu", SHIPPING) as
    Record<string, unknown>;

/* ─── Campurile COMUNE ajung pe fiecare varianta ─────────────────────────────
 *
 * Reclamat de al doilea comerciant, prin Search Console: „description lipsa" pe
 * FIECARE varianta a fiecarui produs cu variante. Descrierea era calculata si
 * pusa numai pe `ProductGroup`.
 *
 * ⚠ DE CE N-A VAZUT-O NICIO PROBA DE PANA ACUM: toate fixturile de mai sus au
 * `description: null`. Cazul reclamat — produs CU descriere si CU variante — nu
 * era atins de niciuna. O proba care nu hraneste functia cu datele adevarate nu
 * apara nimic.
 */

/** Ca fixtura de mai sus, dar cu descriere si galerie — adica situatia reala. */
const cuDescriere = (combinations: unknown[]) => ({
  id: "prod-1",
  name: "Husa de Pat CAIAN Elastic Jersey",
  /*
    ⚠ DOUA BLOCURI, DINADINS. Cu un singur paragraf, o taiere gresita (eticheta scoasa ca sir gol
    in loc de spatiu) da acelasi rezultat si la grup, si la variante — deci proba ramane verde
    peste chiar defectul reclamat. Descrierile adevarate au blocuri: 1654 din 3061 de produse cu
    variante aveau „…cazare.</p><h3>Beneficii:</h3>" lipit.
  */
  description: "<p>Husa de pat <b>100% bumbac</b>, elastica.</p><h3>Beneficii:</h3><p>Moale<br>Elastica</p>",
  price: 100,
  images: ["/galerie-1.webp", "/galerie-2.webp"],
  sku: "HUSA-180",
  page_sections: {
    variants: {
      enabled: true,
      options: [{ id: "o1", name: "Culoare", values: ["Gri", "Bej", "Bordo"] }],
      combinations,
    },
  },
});

const grupCuDescriere = (combinations: unknown[]) =>
  buildProductJsonLd(cuDescriere(combinations), "https://exemplu.ro/p", "Exemplu", SHIPPING) as
    Record<string, unknown>;

test("⚠ FIECARE varianta isi poarta descrierea, nu doar grupul", () => {
  /*
   * ⚠ Documentatia spune ca variantele mostenesc de la `ProductGroup`. Raportul lor spune
   * altceva. Nu ne mai bazam pe mostenire: ce e comun se scrie pe fiecare varianta.
   */
  const g = grupCuDescriere(CULORI.map((c) => ({ ...c, enabled: true })));
  const asteptat = "Husa de pat 100% bumbac, elastica. Beneficii: Moale Elastica";

  assert.equal(g.description, asteptat, "grupul isi pastreaza descrierea");
  const v = g.hasVariant as Record<string, unknown>[];
  assert.equal(v.length, 3);
  for (const [i, varianta] of v.entries()) {
    assert.equal(varianta.description, asteptat, `varianta ${i} n-are descriere`);
  }
});

test("⚠ marca e comuna, deci intra si ea pe fiecare varianta", () => {
  const g = grupCuDescriere(CULORI.map((c) => ({ ...c, enabled: true })));
  for (const varianta of g.hasVariant as Record<string, unknown>[]) {
    assert.deepEqual(varianta.brand, { "@type": "Brand", name: "Exemplu" },
      "marca lipseste de pe varianta");
  }
});

test("⚠ o varianta fara poza proprie primeste galeria, nu ramane fara imagine", () => {
  /*
   * ⚠ Comentariul de dinainte spunea „altfel mosteneste galeria" — dar nu mostenea nimic, pur si
   * simplu lipsea cheia. Era o afirmatie despre validatorul LOR, scrisa de noi, si de acelasi fel
   * cu cea pe care raportul tocmai a dezmintit-o la `description`. In productie sunt 8667 de
   * variante fara poza proprie.
   */
  const g = grupCuDescriere([
    { title: "Gri", gtin: "0682643488768", enabled: true, image: "/gri.webp" },
    { title: "Bej", gtin: "0682643488799", enabled: true },
  ]);
  const v = g.hasVariant as Record<string, unknown>[];
  assert.deepEqual(v[0].image, ["/gri.webp"], "poza proprie bate galeria");
  assert.deepEqual(v[1].image, ["/galerie-1.webp", "/galerie-2.webp"],
    "fara poza proprie, varianta trebuie sa primeasca galeria produsului");
});

test("⚠ descrierea variantei e curatata de HTML, ca si cea a grupului", () => {
  /* Marcajul brut intr-un camp de date structurate e chiar felul de lucru pe care validatorul il
     numeste „invalid", si l-am fi copiat pe fiecare din cele 45092 de variante. */
  const g = grupCuDescriere(CULORI.map((c) => ({ ...c, enabled: true })));
  for (const varianta of g.hasVariant as Record<string, unknown>[]) {
    assert.doesNotMatch(String(varianta.description), /<[^>]+>/, "HTML ramas in descrierea variantei");
  }
});

test("⚠ un produs FARA descriere nu capata una inventata pe variante", () => {
  /*
   * ⚠ Cand descrierea lipseste, `desc` cade pe NUMELE produsului — asa a fost dintotdeauna la
   * grup. Ce nu are voie sa se intample e ca variantele sa primeasca altceva decat grupul: doua
   * texte diferite pentru acelasi lucru sunt mai rele decat un text sarac.
   */
  const g = grup(CULORI.map((c) => ({ ...c, enabled: true })));
  for (const varianta of g.hasVariant as Record<string, unknown>[]) {
    assert.equal(varianta.description, g.description,
      "varianta si grupul trebuie sa spuna acelasi lucru");
  }
});

test("variantele cu cod propriu produc `ProductGroup`, nu `Product`", () => {
  const g = grup(CULORI.map((c) => ({ ...c, enabled: true })));
  assert.equal(g["@type"], "ProductGroup");
  assert.equal(Array.isArray(g.hasVariant), true);
  assert.equal((g.hasVariant as unknown[]).length, 3);
});

test("FIECARE varianta isi poarta codul ei", () => {
  const g = grup(CULORI.map((c) => ({ ...c, enabled: true })));
  const coduri = (g.hasVariant as Record<string, unknown>[]).map((v) => v.gtin);
  assert.deepEqual(coduri, ["0682643488768", "0682643488799", "0682643488744"]);
});

test("un cod de varianta cu cifra de control gresita NU se scrie", () => {
  /* Acelasi principiu ca la codul de produs: un cod gresit duce la RESPINGERE,
     unul lipsa doar saraceste listarea. Restul variantelor raman intregi. */
  const g = grup([
    { title: "Gri", gtin: "0682643488768", enabled: true },
    { title: "Bej", gtin: "0682643488790", enabled: true }, // cifra de control stricata
    { title: "Bordo", gtin: "0682643488744", enabled: true },
  ]);
  const v = g.hasVariant as Record<string, unknown>[];
  assert.equal(v[0].gtin, "0682643488768");
  assert.equal("gtin" in v[1], false, "codul invalid n-avea voie sa fie scris");
  assert.equal(v[2].gtin, "0682643488744");
});

test("`variesBy` spune ce difera, potrivit din numele optiunii", () => {
  const g = grup(CULORI.map((c) => ({ ...c, enabled: true })));
  assert.deepEqual(g.variesBy, ["color"]);
  assert.equal((g.hasVariant as Record<string, unknown>[])[0].color, "Gri");
});

test("un nume de optiune care nu se poate potrivi NU se ghiceste", () => {
  /* In baza exista „Model", „Gramaj", „Tip print", „Bicarbonato" si unul gol. O
     proprietate ghicita gresit e o afirmatie falsa despre marfa. */
  const g = grup(CULORI.map((c) => ({ ...c, enabled: true })), "Tip print");
  assert.equal("variesBy" in g, false);
  const v = (g.hasVariant as Record<string, unknown>[])[0];
  assert.equal("color" in v, false);
  assert.equal("size" in v, false);
});

test("`productGroupID` leaga variantele intre ele", () => {
  const g = grup(CULORI.map((c) => ({ ...c, enabled: true })));
  assert.equal(g.productGroupID, "HUSA-180");
});

test("fara SKU pe produs, grupul se identifica prin id-ul din baza", () => {
  const p = { ...cuCulori(CULORI.map((c) => ({ ...c, enabled: true }))), sku: null };
  const g = buildProductJsonLd(p, "https://exemplu.ro/p", "Exemplu", SHIPPING) as Record<string, unknown>;
  assert.equal(g.productGroupID, "prod-1");
});

test("o varianta epuizata se declara epuizata, nu tot grupul", () => {
  const g = grup([
    { title: "Gri", gtin: "0682643488768", enabled: true, stock_quantity: "0" },
    { title: "Bej", gtin: "0682643488799", enabled: true, stock_quantity: "5" },
    { title: "Bordo", gtin: "0682643488744", enabled: true },
  ]);
  const v = g.hasVariant as Record<string, Record<string, unknown>>[];
  assert.match(String(v[0].offers.availability), /OutOfStock/);
  assert.match(String(v[1].offers.availability), /InStock/);
});

test("⚠ FARA coduri pe variante, forma NU se schimba", () => {
  /* 2489 de produse au variante, doar 186 au coduri pe ele. Pe celelalte,
     `ProductGroup` ar adauga structura fara niciun fapt nou — si ar muta tot
     catalogul pe o forma noua degeaba. */
  const g = grup([
    { title: "Gri", enabled: true },
    { title: "Bej", enabled: true },
    { title: "Bordo", enabled: true },
  ]);
  assert.equal(g["@type"], "Product");
  assert.equal("hasVariant" in g, false);
});

test("o singura combinatie nu e un grup de variante", () => {
  const g = grup([{ title: "Gri", gtin: "0682643488768", enabled: true }]);
  assert.equal(g["@type"], "Product");
});

test("un produs fara variante ramane exact cum era", () => {
  const g = build({ gtin: "5941234567899" });
  assert.equal(g["@type"], "Product");
  assert.equal(g.gtin, "5941234567899");
  assert.equal("hasVariant" in g, false);
});

/* ─── Brandul: al PRODUSULUI, nu al magazinului ──────────────────────────────
 *
 * Pagina declara numele magazinului chiar cand comerciantul scrisese un
 * producator real, iar feedurile foloseau de mult valoarea lui. Deci pagina si
 * feedul spuneau lucruri diferite despre acelasi articol: feedul „ARDON",
 * pagina „eSAFE". Masurat: 6150 din 7880 de produse active aveau brand propriu.
 */

const cuBrand = (brandProdus?: string) => buildProductJsonLd(
  { name: "Casca", description: null, price: 100, images: null, page_sections: { google: { brand: brandProdus } } },
  "https://exemplu.ro/p",
  "eSAFE",            // numele magazinului, ca rezerva
  SHIPPING,
) as Record<string, unknown>;

/** Numele de brand din JSON-LD, indiferent de forma (Product sau ProductGroup). */
const numeBrand = (j: Record<string, unknown>) => (j.brand as { name?: string } | undefined)?.name;

test("brandul scris de comerciant bate numele magazinului", () => {
  assert.equal(numeBrand(cuBrand("Portwest")), "Portwest");
});

test("fara brand pe produs, ramane numele magazinului", () => {
  assert.equal(numeBrand(cuBrand(undefined)), "eSAFE");
  assert.equal(numeBrand(cuBrand("   ")), "eSAFE", "spatiile nu sunt un brand");
});

test("si grupul de variante poarta brandul produsului", () => {
  /* Doua forme, o singura regula: daca s-ar fi scris de doua ori, s-ar fi
     despartit la prima corectura. */
  const g = buildProductJsonLd(
    {
      id: "p1", name: "Husa", description: null, price: 100, images: null,
      page_sections: {
        google: { brand: "CAIAN" },
        variants: {
          enabled: true,
          options: [{ id: "o1", name: "Culoare", values: ["Gri", "Bej"] }],
          combinations: [
            { title: "Gri", gtin: "0682643488768", enabled: true },
            { title: "Bej", gtin: "0682643488799", enabled: true },
          ],
        },
      },
    },
    "https://exemplu.ro/p", "Magazinul Meu", SHIPPING,
  ) as Record<string, unknown>;
  assert.equal(g["@type"], "ProductGroup");
  assert.equal(numeBrand(g), "CAIAN");
});

test("⚠ termenul de livrare NU se declara cand comerciantul nu l-a pornit", () => {
  /*
   * Inversul clasei „camp completat care nu ajunge nicaieri": o afirmatie
   * FABRICATA. Cand estimarea de livrare e stinsa — 53 din cele 70 de magazine
   * publicate — se emitea oricum „1-3 zile" catre Google, desi pagina nu arata
   * nimic si comerciantul n-a scris asta niciunde. Nici macar nu era implicitul
   * propriului editor, care e 2-4.
   *
   * Acelasi rationament pe care fisierul il aplica deja taxei de retur: nu
   * declaram public o politica pe care omul n-a spus-o.
   */
  const fara = buildProductJsonLd(
    produs({}), "https://exemplu.ro/p/x", "Magazin",
    { cost: 20, min: null, max: null },
  ) as Record<string, unknown>;
  const oferta = (fara.offers ?? {}) as Record<string, unknown>;
  const livrare = (oferta.shippingDetails ?? {}) as Record<string, unknown>;
  assert.ok(livrare.shippingRate, "tariful ramane: e un fapt, nu o promisiune");
  assert.equal("deliveryTime" in livrare, false, "termenul nu se inventeaza");

  /* Pornita, se declara exact ce a scris comerciantul. */
  const cu = buildProductJsonLd(
    produs({}), "https://exemplu.ro/p/x", "Magazin",
    { cost: 20, min: 5, max: 7 },
  ) as Record<string, unknown>;
  const dt = (((cu.offers as Record<string, unknown>).shippingDetails as Record<string, unknown>)
    .deliveryTime ?? {}) as Record<string, Record<string, number>>;
  assert.equal(dt.transitTime.minValue, 5);
  assert.equal(dt.transitTime.maxValue, 7);
});

/* ─── Procesarea + tranzitul ────────────────────────────────────────────────── */

/** `deliveryTime` din oferta simpla, scurtat. */
function termen(shipping: { cost: number; min: number | null; max: number | null; handlingMin?: number; handlingMax?: number }) {
  const j = buildProductJsonLd(produs({}), "https://exemplu.ro/p/x", "Magazin", shipping) as Record<string, unknown>;
  const livrare = (j.offers as Record<string, unknown>).shippingDetails as Record<string, unknown>;
  return (livrare.deliveryTime ?? null) as Record<string, Record<string, unknown>> | null;
}

test("procesarea declarata de comerciant ajunge in `handlingTime`", () => {
  /*
   * Reclamat de un comerciant: Search Console ii semnala „deliveryTime lipseste"
   * pe toate paginile de produs, iar in Setari → Livrare nu exista niciun camp
   * pentru timpul de procesare. Acum exista, si asta e drumul lui pana in
   * datele structurate.
   */
  const dt = termen({ cost: 25, min: 2, max: 4, handlingMin: 1, handlingMax: 2 })!;
  assert.equal(dt.handlingTime.minValue, 1);
  assert.equal(dt.handlingTime.maxValue, 2);
  assert.equal(dt.transitTime.minValue, 2);
  assert.equal(dt.transitTime.maxValue, 4);
  assert.equal(dt.handlingTime.unitCode, "DAY");
});

test("⚠ fara procesare declarata se scrie ZERO, nu 0-1", () => {
  /*
   * Google socoteste termenul afisat ca procesare + tranzit. Cand zilele vin din
   * estimarea veche a editorului, ele sunt TOTALUL — casuta de pe pagina arata
   * „azi + min … azi + max". Un 0-1 pus din oficiu peste ele publica o zi in
   * plus fata de ce scrie pe acelasi ecran, iar contradictia dintre pagina si
   * microdate e chiar motivul de suspendare din Merchant Center.
   */
  const dt = termen({ cost: 25, min: 2, max: 4 })!;
  assert.equal(dt.handlingTime.minValue, 0);
  assert.equal(dt.handlingTime.maxValue, 0);
});
