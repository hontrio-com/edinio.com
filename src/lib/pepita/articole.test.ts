import assert from "node:assert/strict";
import { test } from "node:test";
import { articolelePentruProdus, dimensiuniPepita, pozeFolosibile, textSimplu, type ContextArticole, type ProdusPepita } from "./articole";
import { caleaCategoriilor } from "./categorii";
import { CONFIG_IMPLICIT, type PepitaConfig } from "./types";

/*
 * ⚠ CE APARA PROBELE DE AICI: hotararea „ce pleaca la Pepita si ce nu" e citita din DOUA
 * locuri, generatorul de feed si panoul comerciantului. Daca s-ar despartii, panoul ar
 * spune „toate pleaca" despre un feed care sare produse.
 */

const CATEGORII = [
  { id: "c1", name: "Mobilier", parent_id: null },
  { id: "c2", name: "Scaune", parent_id: "c1" },
];

function ctx(peste: Partial<PepitaConfig> = {}): ContextArticole {
  return {
    business: { slug: "magazin", custom_domain: null, store_name: "Magazin", business_name: "SRL" },
    config: { ...CONFIG_IMPLICIT, activ: true, ...peste },
    magazin: { vat_enabled: true, vat_rate: 21, prices_include_vat: true },
    caleCategorie: caleaCategoriilor(CATEGORII),
    baza: "https://magazin.ro",
  };
}

function produs(peste: Partial<ProdusPepita> = {}): ProdusPepita {
  return {
    id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    name: "Scaun de birou",
    slug: "scaun-de-birou",
    description: "<p>Un scaun <b>bun</b>.</p>",
    price: 499.99,
    compare_at_price: null,
    sku: "SCAUN-1",
    images: ["https://cdn.ro/a.jpg", "https://cdn.ro/b.jpg"],
    category: "Scaune",
    track_inventory: true,
    stock_quantity: 7,
    weight_grams: 8500,
    page_sections: {},
    is_bundle: false,
    updated_at: "2026-09-01T10:00:00.000Z",
    ...peste,
  };
}

const coduri = (p: ReturnType<typeof articolelePentruProdus>) => p.probleme.map((x) => x.cod);
const erori = (p: ReturnType<typeof articolelePentruProdus>) =>
  p.probleme.filter((x) => x.nivel === "eroare").map((x) => x.cod);

/* ── Produsul simplu ──────────────────────────────────────────────────────── */

test("produsul intreg si valid da un singur articol", () => {
  const r = articolelePentruProdus(produs(), ctx());
  assert.equal(r.articole.length, 1);
  assert.equal(erori(r).length, 0);
  const a = r.articole[0];
  assert.equal(a.id, "3f2504e0-4f89-41d3-9a0c-0305e82c3301");
  assert.equal(a.nume, "Scaun de birou");
  assert.equal(a.pret, 499.99);
  assert.equal(a.tva, 21);
  assert.equal(a.moneda, "RON");
  assert.equal(a.disponibil, true);
  assert.equal(a.cantitate, 7);
  assert.equal(a.url, "https://magazin.ro/product/scaun-de-birou");
  assert.deepEqual(a.categorii, [{ id: "c1", nume: "Mobilier" }, { id: "c2", nume: "Scaune" }]);
  assert.equal(a.poze[0].principala, true);
  assert.equal(a.poze[1].principala, false);
});

test("descrierea pleaca fara marcaj", () => {
  /* Documentatia lor: imaginile si clipurile din descriere „nem kerülnek átvételre".
     Si un `<script>` pus din editorul de produs n-are ce cauta pe alt site. */
  const r = articolelePentruProdus(produs({ description: "<script>rau()</script><p>Text &amp; bun</p>" }), ctx());
  assert.equal(r.articole[0].descriere, "Text & bun");
});

test("⚠ produsul fara imagine, categorie, nume, descriere sau pret NU pleaca", () => {
  const cazuri: [Partial<ProdusPepita>, string][] = [
    [{ images: [] }, "fara-imagine"],
    [{ category: null }, "fara-categorie"],
    [{ name: "  " }, "fara-nume"],
    [{ description: "" }, "fara-descriere"],
    [{ price: 0 }, "pret-zero"],
  ];
  for (const [peste, cod] of cazuri) {
    const r = articolelePentruProdus(produs(peste), ctx());
    assert.deepEqual(r.articole, [], `${cod}: produsul nu trebuie sa plece`);
    assert.ok(erori(r).includes(cod), `${cod}: motivul trebuie spus, e ${JSON.stringify(erori(r))}`);
  }
});

test("⚠ imaginile care nu se pot deschide de la ei nu sunt imagini", () => {
  /* Pepita isi aduce singura pozele. O adresa `data:`, `blob:`, relativa sau pe `http`
     nu se poate deschide, iar produsul e respins fara ca noi sa aflam. */
  assert.deepEqual(pozeFolosibile(["http://cdn.ro/a.jpg", "data:image/png;base64,AA", "/local.jpg", "blob:x", ""]), []);
  assert.deepEqual(pozeFolosibile(["https://cdn.ro/a.jpg", "https://cdn.ro/a.jpg"]), ["https://cdn.ro/a.jpg"]);
});

test("un produs fara EAN pleaca, dar cu avertisment", () => {
  /* Documentatia il numeste „Ajanlott", recomandat. Blocat, ar scoate de la vanzare
     cataloage intregi pe o presupunere. */
  const r = articolelePentruProdus(produs(), ctx());
  assert.equal(r.articole.length, 1);
  assert.ok(coduri(r).includes("fara-ean"));
});

test("⚠ EAN-ul se trimite doar daca trece cifra de control", () => {
  const bun = articolelePentruProdus(produs({ page_sections: { google: { gtin: "9789633736579" } } }), ctx());
  assert.equal(bun.articole[0].gtin, "9789633736579");

  const rau = articolelePentruProdus(produs({ page_sections: { google: { gtin: "1234567890123" } } }), ctx());
  assert.equal(rau.articole[0].gtin, undefined);
  assert.ok(coduri(rau).includes("ean-nevalid"));
  assert.equal(erori(rau).length, 0, "un cod gresit nu opreste produsul, doar nu se trimite");
});

test("⚠ greutatea se converteste din grame in kilograme", () => {
  /* Trimisa neconvertita, o husa de 300 g ar pleca la ei ca 300 kg. */
  assert.equal(dimensiuniPepita(produs({ weight_grams: 300 }))?.greutate, 0.3);
  assert.equal(dimensiuniPepita(produs({ weight_grams: 8500 }))?.greutate, 8.5);
  assert.equal(dimensiuniPepita(produs({ weight_grams: null, page_sections: {} })), undefined);
});

test("dimensiunile din `page_sections` ajung in feed", () => {
  const d = dimensiuniPepita(produs({ page_sections: { dimensions: { length: 20.3, width: 15.6, height: 8.5 } } }));
  assert.deepEqual(d, { lungime: 20.3, latime: 15.6, inaltime: 8.5, greutate: 8.5 });
});

test("stocul de siguranta si strategia de pret ajung pe articol", () => {
  const r = articolelePentruProdus(produs({ stock_quantity: 5 }), ctx({
    safety_stock: 2, strategie_pret: { fel: "procent", valoare: 10 },
  }));
  assert.equal(r.articole[0].cantitate, 3);
  assert.equal(r.articole[0].pret, 549.99, "499,99 lei cu 10% adaos");
});

test("pachetul indisponibil pleaca cu `Available=false`", () => {
  const r = articolelePentruProdus(
    produs({ is_bundle: true, track_inventory: false, pachetDisponibil: false }), ctx(),
  );
  assert.equal(r.articole[0].disponibil, false);
});

/* ── Variantele, aplatizate ───────────────────────────────────────────────── */

const cuVariante = (combinatii: Record<string, unknown>[], optiuni = [{ id: "o1", name: "Mărime", values: ["S", "M"] }]) =>
  produs({ page_sections: { variants: { enabled: true, options: optiuni, combinations: combinatii } } });

const combo = (title: string, peste: Record<string, unknown> = {}) => ({
  id: title, title, price: "", compare_at_price: "", sku: "", stock_quantity: "", image: "", enabled: true, ...peste,
});

test("⚠ fiecare combinatie activa devine un articol de sine statator", () => {
  const r = articolelePentruProdus(cuVariante([combo("S"), combo("M")]), ctx());
  assert.equal(r.articole.length, 2);
  assert.deepEqual(r.articole.map((a) => a.nume), ["Scaun de birou (S)", "Scaun de birou (M)"]);
  assert.notEqual(r.articole[0].id, r.articole[1].id, "doua articole nu pot avea acelasi `<Id>`");
});

test("⚠ fiecare varianta pleaca cu STOCUL EI, nu cu al produsului", () => {
  /* Trimis pe cel al produsului, S cu o bucata si M cu doua ar aparea amandoua cu 7,
     si s-ar vinde ce nu exista. */
  const r = articolelePentruProdus(cuVariante([
    combo("S", { stock_quantity: "1" }),
    combo("M", { stock_quantity: "2" }),
  ]), ctx());
  assert.deepEqual(r.articole.map((a) => a.cantitate), [1, 2]);
});

test("combinatia fara stoc declarat cade pe stocul produsului, ca in magazin", () => {
  const r = articolelePentruProdus(cuVariante([combo("S")]), ctx());
  assert.equal(r.articole[0].cantitate, 7);
});

test("stocul de siguranta se aplica pe FIECARE varianta", () => {
  const r = articolelePentruProdus(cuVariante([
    combo("S", { stock_quantity: "3" }),
    combo("M", { stock_quantity: "1" }),
  ]), ctx({ safety_stock: 2 }));
  assert.deepEqual(r.articole.map((a) => [a.cantitate, a.disponibil]), [[1, true], [0, false]]);
});

test("varianta cu pret propriu il foloseste, cea fara cade pe pretul produsului", () => {
  const r = articolelePentruProdus(cuVariante([
    combo("S", { price: "600" }),
    combo("M"),
  ]), ctx());
  assert.deepEqual(r.articole.map((a) => a.pret), [600, 499.99]);
});

test("combinatiile dezactivate nu pleaca", () => {
  const r = articolelePentruProdus(cuVariante([combo("S"), combo("M", { enabled: false })]), ctx());
  assert.deepEqual(r.articole.map((a) => a.nume), ["Scaun de birou (S)"]);
});

test("⚠ valorile axelor pleaca drept `<Attributes>`, ca sa ramana cautabile", () => {
  const r = articolelePentruProdus(cuVariante(
    [combo("S / Roșu")],
    [{ id: "o1", name: "Mărime", values: ["S"] }, { id: "o2", name: "Culoare", values: ["Roșu"] }],
  ), ctx());
  assert.deepEqual(r.articole[0].atribute, [
    { nume: "Mărime", valoare: "S" },
    { nume: "Culoare", valoare: "Roșu" },
  ]);
});

test("trei axe se aplatizeaza la fel de bine ca una", () => {
  const r = articolelePentruProdus(cuVariante(
    [combo("S / Roșu / Bumbac")],
    [
      { id: "o1", name: "Mărime", values: ["S"] },
      { id: "o2", name: "Culoare", values: ["Roșu"] },
      { id: "o3", name: "Material", values: ["Bumbac"] },
    ],
  ), ctx());
  assert.equal(r.articole.length, 1);
  assert.equal(r.articole[0].atribute.length, 3);
});

test("imaginea combinatiei devine imaginea principala a articolului ei", () => {
  const r = articolelePentruProdus(cuVariante([combo("S", { image: "https://cdn.ro/rosu.jpg" })]), ctx());
  assert.equal(r.articole[0].poze[0].url, "https://cdn.ro/rosu.jpg");
  assert.equal(r.articole[0].poze[0].principala, true);
});

test("⚠ o varianta cu pret zero se opreste singura, restul pleaca", () => {
  const r = articolelePentruProdus(cuVariante([
    combo("S", { price: "0.0000001" }),
    combo("M"),
  ]), ctx({ strategie_pret: { fel: "fix", valoare: -1000 } }));
  assert.deepEqual(r.articole, [], "cu adaosul negativ pica amandoua");
  assert.ok(erori(r).includes("pret-zero"));
});

test("⚠ acelasi EAN pe doua variante nu se trimite pe NICIUNA", () => {
  /*
   * Codul identifica un articol anume, nu o familie. Trimis pe amandoua, Pepita le
   * respinge; trimis pe prima si nu pe a doua, tot pe perechea aia cade.
   */
  const r = articolelePentruProdus(cuVariante([
    combo("S", { gtin: "9789633736579" }),
    combo("M", { gtin: "9789633736579" }),
  ]), ctx());
  assert.equal(r.articole.length, 2);
  assert.deepEqual(r.articole.map((a) => a.gtin), [undefined, undefined]);
  assert.ok(coduri(r).includes("ean-duplicat"));
});

test("EAN-uri diferite pe variante se trimit amandoua", () => {
  const r = articolelePentruProdus(cuVariante([
    combo("S", { gtin: "9789633736579" }),
    combo("M", { gtin: "5901234123457" }),
  ]), ctx());
  assert.deepEqual(r.articole.map((a) => a.gtin), ["9789633736579", "5901234123457"]);
});

test("⚠ doua combinatii cu acelasi titlu nu produc doua articole", () => {
  /* In productie exista 31 de titluri duplicate pe 7 produse. Castiga prima, ca peste
     tot in proiect: exact combinatia pe care o vede clientul cand isi alege marimea. */
  const r = articolelePentruProdus(cuVariante([
    combo("S", { price: "100" }),
    combo("S", { price: "200" }),
  ]), ctx());
  assert.equal(r.articole.length, 1);
  assert.equal(r.articole[0].pret, 100);
});

test("textSimplu intoarce rezerva cand nu ramane nimic", () => {
  assert.equal(textSimplu("<p>  </p>", "rezerva"), "rezerva");
  assert.equal(textSimplu(null, "rezerva"), "rezerva");
});
