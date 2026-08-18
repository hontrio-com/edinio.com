import assert from "node:assert/strict";
import { test } from "node:test";
import { buildStockPlan, summarizePlan } from "./matcher";
import type { CatalogEntry, StockFeedRow } from "./types";

/**
 * Un feed de stoc scrie direct in catalogul unui magazin care vinde. Greselile
 * de aici nu se vad la randare, se vad in comenzi: produs epuizat lasat la
 * vanzare, sau produs disponibil scos din magazin.
 *
 * Testele acopera exact cazurile care fac paguba: potrivirea pe produsul gresit,
 * scrierea peste produse care nu erau in fisier, si valorile care nu au ce cauta
 * intr-un stoc.
 */

function produs(over: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    id: "p1",
    name: "Tricou",
    sku: "TRIC-001",
    external_id: null,
    gtin: null,
    price: 100,
    stock_quantity: 5,
    track_inventory: true,
    variantsEnabled: false,
    variants: [],
    ...over,
  };
}

function rand(over: Partial<StockFeedRow> = {}): StockFeedRow {
  return { rowIndex: 1, identifier: "TRIC-001", stock: 12, price: null, ...over };
}

const doarStoc = { matchKey: "sku_auto" as const, updatePrice: false };

// ── Regula 1: ce nu e in feed nu se atinge ───────────────────────────────────

test("produsele care nu apar in feed nu primesc nicio scriere", () => {
  const catalog = [produs({ id: "p1", sku: "A" }), produs({ id: "p2", sku: "B" }), produs({ id: "p3", sku: "C" })];
  const plan = buildStockPlan([rand({ identifier: "B", stock: 9 })], catalog, doarStoc);

  assert.equal(plan.changes.length, 1);
  assert.equal(plan.changes[0].productId, "p2");
  // Nicio scriere pentru p1 sau p3, oricat de partial ar fi fisierul.
  assert.equal(plan.changes.some((c) => c.productId === "p1" || c.productId === "p3"), false);
});

test("un feed gol nu schimba nimic", () => {
  const plan = buildStockPlan([], [produs()], doarStoc);
  assert.deepEqual(plan.changes, []);
  assert.equal(plan.issues.length, 0);
});

// ── Regula 2: ambiguitatea se opreste ────────────────────────────────────────

test("acelasi SKU pe doua produse da eroare, nu o alegere la intamplare", () => {
  const catalog = [produs({ id: "p1", sku: "DUP" }), produs({ id: "p2", sku: "DUP" })];
  const plan = buildStockPlan([rand({ identifier: "DUP" })], catalog, doarStoc);

  assert.equal(plan.changes.length, 0);
  assert.equal(plan.issues[0].problem, "ambiguous");
});

test("acelasi identificator de doua ori IN FISIER opreste ambele randuri", () => {
  const catalog = [produs({ sku: "A" })];
  const rows = [
    rand({ rowIndex: 1, identifier: "A", stock: 3 }),
    rand({ rowIndex: 2, identifier: "A", stock: 99 }),
  ];
  const plan = buildStockPlan(rows, catalog, doarStoc);

  assert.equal(plan.changes.length, 0);
  assert.equal(plan.issues.length, 2);
  assert.equal(plan.issues[0].problem, "duplicate");
});

test("SKU de produs egal cu SKU-ul propriei combinatii: castiga COMBINATIA", () => {
  /*
   * A fost raportat ca „ambiguu" pana la 18.08.2026, si era o ambiguitate
   * INCHIPUITA: nu sunt doua articole intre care sa alegem, e acelasi articol
   * descris de doua ori. Masurat in productie, regula veche bloca 382 de produse
   * din 3 magazine — pe cheia IMPLICITA — la fiecare rulare, la nesfarsit.
   *
   * Se alege combinatia fiindca la un produs cu variante coloana de stoc a
   * produsului e oricum recalculata de `products_sync_variant_stock` ca suma
   * combinatiilor: scrierea pe produs n-ar fi tinut.
   */
  const catalog = [produs({ id: "p1", sku: "X", variants: [{ id: "v1", title: "M", sku: "X", stock_quantity: 1, price: 100, gtin: null, enabled: true, stockNumeric: true }] })];
  const plan = buildStockPlan([rand({ identifier: "X", stock: 7 })], catalog, doarStoc);

  assert.equal(plan.issues.length, 0, JSON.stringify(plan.issues));
  assert.equal(plan.changes.length, 1);
  assert.equal(plan.changes[0].variantId, "v1");
  assert.equal(plan.changes[0].stockTo, 7);
});

test("doua PRODUSE diferite cu acelasi cod raman ambigue", () => {
  /* Regula slabita mai sus nu are voie sa se intinda si peste ambiguitatea
     adevarata: acolo chiar nu stim pe care o cere fisierul. */
  const catalog = [produs({ id: "p1", sku: "X" }), produs({ id: "p2", sku: "X" })];
  const plan = buildStockPlan([rand({ identifier: "X", stock: 7 })], catalog, doarStoc);

  assert.equal(plan.changes.length, 0);
  assert.equal(plan.issues[0].problem, "ambiguous");
  /* Si spune CU CE s-a lovit, altfel raportul nu ajuta la nimic. */
  assert.match(plan.issues[0].detail, /Tricou/);
});

// ── Potrivire pe variante ────────────────────────────────────────────────────

test("un fisier poate amesteca SKU de produs cu SKU de varianta", () => {
  const catalog = [
    produs({
      id: "p1",
      sku: "TRIC-001",
      stock_quantity: 2,
      variants: [
        { id: "m", title: "M", sku: "TRIC-001-M", stock_quantity: 1, price: 100, gtin: null, enabled: true, stockNumeric: true },
        { id: "l", title: "L", sku: "TRIC-001-L", stock_quantity: 1, price: 100, gtin: null, enabled: true, stockNumeric: true },
      ],
    }),
  ];
  const rows = [
    rand({ rowIndex: 1, identifier: "TRIC-001", stock: 12 }),
    rand({ rowIndex: 2, identifier: "TRIC-001-M", stock: 4 }),
    rand({ rowIndex: 3, identifier: "TRIC-001-L", stock: 8 }),
  ];
  const plan = buildStockPlan(rows, catalog, doarStoc);

  assert.equal(plan.changes.length, 3);
  assert.equal(plan.changes[0].variantId, null);
  assert.equal(plan.changes[1].variantId, "m");
  assert.equal(plan.changes[1].variantTitle, "M");
  assert.equal(plan.changes[2].stockTo, 8);
});

test("cheia variant_sku nu se uita la SKU-ul produsului", () => {
  const catalog = [
    produs({ sku: "TRIC-001", variants: [{ id: "m", title: "M", sku: "TRIC-001-M", stock_quantity: 1, price: 100, gtin: null, enabled: true, stockNumeric: true }] }),
  ];
  const plan = buildStockPlan([rand({ identifier: "TRIC-001" })], catalog, {
    matchKey: "variant_sku",
    updatePrice: false,
  });

  assert.equal(plan.changes.length, 0);
  assert.equal(plan.issues[0].problem, "not_found");
});

// ── Valori care nu au ce cauta intr-un stoc ──────────────────────────────────

test("stocul negativ e respins", () => {
  const plan = buildStockPlan([rand({ stock: -3 })], [produs()], doarStoc);
  assert.equal(plan.changes.length, 0);
  assert.equal(plan.issues[0].problem, "invalid");
});

test("stocul zecimal e respins", () => {
  const plan = buildStockPlan([rand({ stock: 2.5 })], [produs()], doarStoc);
  assert.equal(plan.issues[0].problem, "invalid");
});

test("stocul zero e valid: inseamna epuizat", () => {
  const plan = buildStockPlan([rand({ stock: 0 })], [produs({ stock_quantity: 5 })], doarStoc);
  assert.equal(plan.changes.length, 1);
  assert.equal(plan.changes[0].stockTo, 0);
});

test("randul fara stoc si fara pret e respins", () => {
  const plan = buildStockPlan([rand({ stock: null, price: null })], [produs()], doarStoc);
  assert.equal(plan.issues[0].problem, "invalid");
});

test("randul fara identificator e respins", () => {
  const plan = buildStockPlan([rand({ identifier: "   " })], [produs()], doarStoc);
  assert.equal(plan.issues[0].problem, "invalid");
});

// ── Pretul se scrie doar cand e cerut ────────────────────────────────────────

test("pretul din fisier e ignorat cand actualizarea pretului e oprita", () => {
  const plan = buildStockPlan([rand({ stock: 12, price: 55 })], [produs({ price: 100 })], doarStoc);
  assert.equal(plan.changes[0].priceTo, null);
});

test("pretul se scrie cand actualizarea e pornita", () => {
  const plan = buildStockPlan([rand({ stock: 12, price: 55 })], [produs({ price: 100 })], {
    matchKey: "sku_auto",
    updatePrice: true,
  });
  assert.equal(plan.changes[0].priceTo, 55);
  assert.equal(plan.changes[0].priceFrom, 100);
});

test("un rand doar cu pret e valid cand actualizarea pretului e pornita", () => {
  const plan = buildStockPlan([rand({ stock: null, price: 55 })], [produs({ price: 100 })], {
    matchKey: "sku_auto",
    updatePrice: true,
  });
  assert.equal(plan.changes.length, 1);
  assert.equal(plan.changes[0].stockTo, null);
  assert.equal(plan.changes[0].priceTo, 55);
});

// ── Fara scrieri degeaba ─────────────────────────────────────────────────────

test("valorile identice nu produc scrieri", () => {
  const plan = buildStockPlan([rand({ stock: 5 })], [produs({ stock_quantity: 5 })], doarStoc);
  assert.equal(plan.changes.length, 0);
  assert.equal(plan.unchanged, 1);
});

// ── Potrivirea nu se impiedica de forma codului ──────────────────────────────

test("potrivirea ignora majusculele si spatiile din jur", () => {
  const plan = buildStockPlan([rand({ identifier: "  tric-001  " })], [produs({ sku: "TRIC-001" })], doarStoc);
  assert.equal(plan.changes.length, 1);
});

test("codurile goale din catalog nu prind randuri goale", () => {
  const catalog = [produs({ sku: null }), produs({ id: "p2", sku: "" })];
  const plan = buildStockPlan([rand({ identifier: "" })], catalog, doarStoc);
  assert.equal(plan.changes.length, 0);
  assert.equal(plan.issues[0].problem, "invalid");
});

// ── Celelalte chei ───────────────────────────────────────────────────────────

test("potrivire dupa EAN", () => {
  const plan = buildStockPlan([rand({ identifier: "5941234567890" })], [produs({ gtin: "5941234567890" })], {
    matchKey: "gtin",
    updatePrice: false,
  });
  assert.equal(plan.changes.length, 1);
});

test("potrivire dupa ID extern", () => {
  const plan = buildStockPlan([rand({ identifier: "shopify-42" })], [produs({ external_id: "shopify-42" })], {
    matchKey: "external_id",
    updatePrice: false,
  });
  assert.equal(plan.changes.length, 1);
});

// ── Avertismentul care altfel trece neobservat ───────────────────────────────

test("produsul cu urmarirea stocului oprita e marcat, dar tot se scrie", () => {
  const plan = buildStockPlan([rand({ stock: 12 })], [produs({ track_inventory: false })], doarStoc);
  assert.equal(plan.changes.length, 1);
  assert.equal(plan.changes[0].inventoryOff, true);
});

// ── Cifrele de pe ecranul de previzualizare ──────────────────────────────────

test("sumarul numara pe categorii, inclusiv trecerile pe zero", () => {
  const catalog = [
    produs({ id: "p1", sku: "A", stock_quantity: 5 }),
    produs({ id: "p2", sku: "B", stock_quantity: 3, track_inventory: false }),
    produs({ id: "p3", sku: "C", stock_quantity: 7 }),
  ];
  const rows = [
    rand({ rowIndex: 1, identifier: "A", stock: 0 }),
    rand({ rowIndex: 2, identifier: "B", stock: 9 }),
    rand({ rowIndex: 3, identifier: "C", stock: 7 }),
    rand({ rowIndex: 4, identifier: "LIPSA", stock: 1 }),
  ];
  const s = summarizePlan(buildStockPlan(rows, catalog, doarStoc));

  assert.equal(s.totalRows, 4);
  assert.equal(s.willWrite, 2);
  assert.equal(s.toZero, 1);
  assert.equal(s.unchanged, 1);
  assert.equal(s.not_found, 1);
  assert.equal(s.inventoryOff, 1);
});

// ── Combinatii care impart acelasi id ──────────────────────────────────────
//
// `id`-ul unei combinatii e un slug din optiuni ("galben-unic"), deci NU e unic
// in produs: la un magazin real, 52 de produse au combinatii care se calca pe id,
// cu SKU-uri diferite. Un `find` pe id o intoarce mereu pe PRIMA, deci stocul
// curent se citea de la sora ei. Efectul e insidios: randul iese "neschimbat" si
// stocul lui ramane vechi la nesfarsit, fara sa apara nicaieri ca problema.

function produsCuIdDublat(): CatalogEntry {
  return {
    id: "p1",
    name: "JACHETA HI WAY BL",
    sku: null,
    external_id: null,
    gtin: null,
    price: 90,
    stock_quantity: null,
    track_inventory: true,
    variantsEnabled: false,
    variants: [
      { id: "galben-unic", title: "Galben", sku: "HS70553", stock_quantity: 1, price: 90, gtin: null, enabled: true, stockNumeric: true },
      { id: "galben-unic", title: "Galben", sku: "HS70554", stock_quantity: 2, price: 95, gtin: null, enabled: true, stockNumeric: true },
    ],
  };
}

test("stocul curent se citeste de la combinatia potrivita, nu de la prima cu acel id", () => {
  // HS70554 are 2. Feedul cere tot 2, deci NU e nimic de schimbat.
  // Citit de la prima combinatie (care are 1), ar parea o modificare inchipuita.
  const plan = buildStockPlan(
    [{ rowIndex: 1, identifier: "HS70554", stock: 2, price: null }],
    [produsCuIdDublat()],
    { matchKey: "variant_sku", updatePrice: false },
  );

  assert.equal(plan.changes.length, 0, "nu are ce sa schimbe");
  assert.equal(plan.unchanged, 1);
});

test("o modificare adevarata pe a doua combinatie nu se pierde", () => {
  // Reversul, si cel periculos: HS70554 are 2, feedul cere 1. Citit de la prima
  // combinatie (care are chiar 1), randul ar fi iesit "neschimbat" si stocul
  // adevarat ar fi ramas 2 pe veci.
  const plan = buildStockPlan(
    [{ rowIndex: 1, identifier: "HS70554", stock: 1, price: null }],
    [produsCuIdDublat()],
    { matchKey: "variant_sku", updatePrice: false },
  );

  assert.equal(plan.changes.length, 1);
  assert.equal(plan.changes[0].stockFrom, 2, "pornim de la stocul lui HS70554");
  assert.equal(plan.changes[0].stockTo, 1);
  assert.equal(plan.changes[0].variantSku, "HS70554", "scrierea trebuie sa stie pe care o atinge");
});

test("fiecare combinatie cu acelasi id isi primeste propria modificare", () => {
  const plan = buildStockPlan(
    [
      { rowIndex: 1, identifier: "HS70553", stock: 3, price: null },
      { rowIndex: 2, identifier: "HS70554", stock: 7, price: null },
    ],
    [produsCuIdDublat()],
    { matchKey: "variant_sku", updatePrice: false },
  );

  assert.equal(plan.changes.length, 2);
  assert.deepEqual(
    plan.changes.map((c) => [c.variantSku, c.stockFrom, c.stockTo]),
    [["HS70553", 1, 3], ["HS70554", 2, 7]],
  );
});

// ── Acelasi cod de doua ori in fisier ──────────────────────────────────────
//
// Exportul furnizorului listeaza uneori acelasi cod de doua ori cu ACEEASI
// cantitate, sub statusuri diferite ("STOC" si "LICHIDARE STOC"). Respins ca
// pana acum, randul acela ar fi ramas neactualizat la fiecare rulare, la
// nesfarsit, pentru o contradictie care nu exista.

function unProdus(sku: string, stoc: number): CatalogEntry {
  return {
    id: "p1", name: "Produs", sku: null, external_id: null, gtin: null,
    price: 100, stock_quantity: null, track_inventory: true,
    variantsEnabled: false,
    variants: [{ id: "v1", title: "Unic", sku, gtin: null, enabled: true, stockNumeric: true, stock_quantity: stoc, price: 100 }],
  };
}

test("acelasi cod de doua ori, cu aceeasi cantitate: se aplica o data", () => {
  const plan = buildStockPlan(
    [
      { rowIndex: 1, identifier: "A2080", stock: 2834, price: null },
      { rowIndex: 2, identifier: "A2080", stock: 2834, price: null },
    ],
    [unProdus("A2080", 2882)],
    { matchKey: "variant_sku", updatePrice: false },
  );

  assert.equal(plan.changes.length, 1, "o singura scriere, nu doua");
  assert.equal(plan.changes[0].rowIndex, 1, "se foloseste primul rand");
  assert.equal(plan.changes[0].stockTo, 2834);
  /* Repetitia se spune totusi: e o problema de igiena a fisierului. */
  assert.equal(plan.issues.length, 1);
  assert.equal(plan.issues[0].rowIndex, 2);
  assert.equal(plan.issues[0].problem, "duplicate");
});

test("acelasi cod cu cantitati DIFERITE se respinge in intregime", () => {
  const plan = buildStockPlan(
    [
      { rowIndex: 1, identifier: "A2080", stock: 10, price: null },
      { rowIndex: 2, identifier: "A2080", stock: 99, price: null },
    ],
    [unProdus("A2080", 5)],
    { matchKey: "variant_sku", updatePrice: false },
  );

  assert.equal(plan.changes.length, 0, "nu ghicim care cantitate e buna");
  assert.equal(plan.issues.length, 2);
  assert.ok(plan.issues.every((i) => i.problem === "duplicate"));
});

test("trei aparitii, dintre care una diferita: se respinge tot", () => {
  const plan = buildStockPlan(
    [
      { rowIndex: 1, identifier: "A2080", stock: 10, price: null },
      { rowIndex: 2, identifier: "A2080", stock: 10, price: null },
      { rowIndex: 3, identifier: "A2080", stock: 77, price: null },
    ],
    [unProdus("A2080", 5)],
    { matchKey: "variant_sku", updatePrice: false },
  );

  assert.equal(plan.changes.length, 0);
  assert.equal(plan.issues.length, 3);
});
