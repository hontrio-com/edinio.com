import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  cheieDinNume,
  numeCuDescendenti,
  parseFeeduri,
  produseDinFeed,
  type ProdusDeFiltrat,
} from "./feeduri";
import type { StoreCategoryNode } from "@/lib/storefront/store-content.types";

/*
 * Un feed gresit nu cade si nu se logheaza: Meta il citeste, catalogul se face
 * mai mic sau mai mare decat trebuia, si comerciantul afla din reclame. De aia
 * regulile se probeaza aici, pana la capat.
 */

const cat = (id: string, name: string, parent_id: string | null): StoreCategoryNode =>
  ({ id, name, parent_id, image_url: null, sort_order: 0 } as unknown as StoreCategoryNode);

/* Scule ─ Scule electrice ─ Bormasini ; Gradina */
const ARBORE = [
  cat("c1", "Scule", null),
  cat("c2", "Scule electrice", "c1"),
  cat("c3", "Bormasini", "c2"),
  cat("c9", "Gradina", null),
];

const prod = (id: string, category: string | null, extra: Partial<ProdusDeFiltrat> = {}): ProdusDeFiltrat => ({
  id, category, price: 100, track_inventory: false, stock_quantity: null, ...extra,
});

// ─── categorii si descendenti ────────────────────────────────────────────────

test("⚠⚠ o categorie aduce SI subcategoriile ei, oricat de adanc", () => {
  /*
   * Masurat pe productie: 104 din cele 110 categorii ale unui magazin sunt
   * subcategorii, iar produsele stau pe frunze. Fara descendenti, un feed pe
   * categoria-parinte ar iesi aproape gol — si nimic n-ar semnala asta.
   */
  assert.deepEqual(
    [...numeCuDescendenti(ARBORE, ["c1"])].sort(),
    ["Bormasini", "Scule", "Scule electrice"],
  );
  assert.deepEqual([...numeCuDescendenti(ARBORE, ["c2"])].sort(), ["Bormasini", "Scule electrice"]);
  assert.deepEqual([...numeCuDescendenti(ARBORE, ["c9"])], ["Gradina"]);
  assert.deepEqual([...numeCuDescendenti(ARBORE, [])], []);
});

test("⚠ un arbore cu bucla nu invarte generarea la nesfarsit", () => {
  /* Un parinte pus din greseala sub propriul copil ar fi blocat feedul. */
  const buclat = [cat("a", "A", "b"), cat("b", "B", "a")];
  assert.deepEqual([...numeCuDescendenti(buclat, ["a"])].sort(), ["A", "B"]);
});

// ─── filtrarea ───────────────────────────────────────────────────────────────

const PRODUSE = [
  prod("p1", "Scule electrice"),
  prod("p2", "Bormasini"),
  prod("p3", "Gradina"),
  prod("p4", null),
];

test("⚠⚠ un feed FARA reguli intoarce tot catalogul, nu zero", () => {
  /*
   * Cea mai scumpa greseala posibila aici: un feed golit din greseala ar trimite
   * un catalog VID catre Meta, iar reclamele s-ar opri in tacere. Implicitul e
   * „tot", ca la feedul care exista deja.
   */
  const r = produseDinFeed({ cheie: "tot", nume: "Toate" }, PRODUSE, new Set());
  assert.equal(r.length, 4);
});

test("feed pe categorie: doar produsele din ea si din subcategorii", () => {
  const nume = numeCuDescendenti(ARBORE, ["c2"]);
  const r = produseDinFeed({ cheie: "s", nume: "Scule", categorii: ["c2"] }, PRODUSE, nume);
  assert.deepEqual(r.map((p) => p.id), ["p1", "p2"]);
});

test("categoriile si produsele alese se ADUNA, nu se intersecteaza", () => {
  /* „Categoria Gradina, plus bormasina asta anume" e cererea reala. */
  const nume = numeCuDescendenti(ARBORE, ["c9"]);
  const r = produseDinFeed({ cheie: "x", nume: "X", categorii: ["c9"], produse: ["p2"] }, PRODUSE, nume);
  assert.deepEqual(r.map((p) => p.id).sort(), ["p2", "p3"]);
});

test("selectie doar de produse, fara nicio categorie", () => {
  /* Cazul magazinului cu 468 de produse si ZERO categorii — masurat pe productie. */
  const r = produseDinFeed({ cheie: "c", nume: "Campanie", produse: ["p1", "p4"] }, PRODUSE, new Set());
  assert.deepEqual(r.map((p) => p.id), ["p1", "p4"]);
});

test("⚠ exclusul bate tot, inclusiv alegerea explicita", () => {
  /*
   * E singurul mod de a scoate un produs din reclame fara sa-l dezactivezi in
   * magazin. Daca ar fi invers, n-ar avea niciun rost.
   */
  const nume = numeCuDescendenti(ARBORE, ["c1"]);
  const r = produseDinFeed(
    { cheie: "s", nume: "S", categorii: ["c1"], produse: ["p3"], excluse: ["p2", "p3"] },
    PRODUSE, nume,
  );
  assert.deepEqual(r.map((p) => p.id), ["p1"]);
});

test("conditia de stoc tine cont si de pachete", () => {
  const lista = [
    prod("a", "X", { track_inventory: true, stock_quantity: 5 }),
    prod("b", "X", { track_inventory: true, stock_quantity: 0 }),
    prod("c", "X", { track_inventory: false }),
    prod("d", "X", { is_bundle: true, pachetDisponibil: false }),
    prod("e", "X", { is_bundle: true, pachetDisponibil: true }),
  ];
  const r = produseDinFeed({ cheie: "s", nume: "S", doarInStoc: true }, lista, new Set());
  assert.deepEqual(r.map((p) => p.id), ["a", "c", "e"]);
});

test("intervalul de pret e inclusiv la ambele capete", () => {
  const lista = [prod("a", "X", { price: 49 }), prod("b", "X", { price: 50 }), prod("c", "X", { price: 100 }), prod("d", "X", { price: 101 })];
  const r = produseDinFeed({ cheie: "s", nume: "S", pretMin: 50, pretMax: 100 }, lista, new Set());
  assert.deepEqual(r.map((p) => p.id), ["b", "c"]);
});

test("un singur capat de pret se poate da singur", () => {
  const lista = [prod("a", "X", { price: 10 }), prod("b", "X", { price: 500 })];
  assert.deepEqual(produseDinFeed({ cheie: "s", nume: "S", pretMin: 100 }, lista, new Set()).map((p) => p.id), ["b"]);
  assert.deepEqual(produseDinFeed({ cheie: "s", nume: "S", pretMax: 100 }, lista, new Set()).map((p) => p.id), ["a"]);
});

test("produsele fara categorie nu intra intr-un feed pe categorii", () => {
  const nume = numeCuDescendenti(ARBORE, ["c1"]);
  const r = produseDinFeed({ cheie: "s", nume: "S", categorii: ["c1"] }, PRODUSE, nume);
  assert.equal(r.some((p) => p.id === "p4"), false);
});

// ─── citirea din baza ────────────────────────────────────────────────────────

test("feedurile se citesc defensiv: vin dintr-un jsonb scris de panou", () => {
  const f = parseFeeduri([
    { cheie: "a", nume: "A", categorii: ["c1"], pretMin: "50", doarInStoc: true },
    { nume: "fara cheie" },
    null,
    "text",
    { cheie: "b" },
  ]);
  assert.equal(f.length, 2);
  assert.equal(f[0].pretMin, 50, "un numar venit ca text se citeste ca numar");
  assert.equal(f[0].doarInStoc, true);
  assert.equal(f[1].nume, "b", "fara nume, cheia tine loc de nume");
  assert.deepEqual(parseFeeduri(null), []);
});

test("⚠ cheile duplicate: prima castiga, ca peste tot", () => {
  /* Altfel `?feed=x` ar depinde de ordinea din tablou. */
  const f = parseFeeduri([{ cheie: "x", nume: "Primul" }, { cheie: "X", nume: "Al doilea" }]);
  assert.equal(f.length, 1);
  assert.equal(f[0].nume, "Primul");
});

test("cheia din nume: fara diacritice, fara spatii, unica", () => {
  assert.equal(cheieDinNume("Scule electrice", []), "scule-electrice");
  assert.equal(cheieDinNume("Mănuși & Protecție", []), "manusi-protectie");
  assert.equal(cheieDinNume("Scule electrice", ["scule-electrice"]), "scule-electrice-2");
  assert.equal(cheieDinNume("   ", []), "feed", "un nume gol nu produce o cheie goala");
});
