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
