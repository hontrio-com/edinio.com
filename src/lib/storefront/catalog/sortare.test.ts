import test from "node:test";
import assert from "node:assert/strict";
import { comparatorSortare, dupaId, numeRomaneste, type CheieSortare, type ProdusSortabil } from "./sortare";
import { amestecaBiti } from "@/lib/storefront/asezare";

/**
 * Produse sintetice cu MULTE egalitati pe fiecare cheie de sortare: exact
 * situatia in care o ordine partiala se vede. Id-urile sunt construite ca sa
 * NU fie in aceeasi ordine cu numele sau cu preturile, altfel un comparator
 * rupt ar putea parea corect din intamplare.
 */
function catalogSintetic(n: number): ProdusSortabil[] {
  const out: ProdusSortabil[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      // Id-uri in ordine INVERSA fata de indice.
      id: `p-${String(n - i).padStart(6, "0")}`,
      // 40% din preturi cad pe aceeasi valoare.
      price_range: { min: i % 5 === 0 || i % 5 === 1 ? 99 : 10 + (i % 137) },
      // Doua valori pe toata lista: cazul cel mai rau pentru „popular".
      is_featured: i % 11 === 0,
      sort_order: i % 7,
      // Multe date identice.
      created_at: new Date(Date.UTC(2026, 0, 1 + (i % 9))).toISOString(),
      name: `Produs ${i % 13}`,
    });
  }
  return out;
}

const CHEI: CheieSortare[] = ["price_asc", "price_desc", "popular", "name_asc", "newest", "random", "manual"];

/** Amesteca determinist, ca sa simulam „alta ordine de intrare, aceeasi cerere". */
function amesteca<T>(v: T[], sare: number): T[] {
  const out = [...v];
  for (let i = out.length - 1; i > 0; i--) {
    const j = (i * 1103515245 + sare * 12345) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

for (const cheie of CHEI) {
  test(`sortarea "${cheie}" nu depinde de ordinea de intrare`, () => {
    const baza = catalogSintetic(3351);
    const a = amesteca(baza, 1).sort(comparatorSortare(cheie)).map((p) => p.id);
    const b = amesteca(baza, 7).sort(comparatorSortare(cheie)).map((p) => p.id);
    // Asta e proprietatea de care depinde felierea pe server: doua interogari
    // independente peste acelasi set trebuie sa dea EXACT aceeasi lista, altfel
    // un produs apare pe doua pagini si altul pe niciuna.
    assert.deepEqual(a, b);
  });

  test(`sortarea "${cheie}" nu lasa nicio pereche neordonata`, () => {
    const lista = catalogSintetic(400).sort(comparatorSortare(cheie));
    const cmp = comparatorSortare(cheie);
    for (let i = 1; i < lista.length; i++) {
      // Zero intre doua elemente vecine ar insemna „egale", adica exact golul
      // pe care il umple departajarea pe id.
      assert.notEqual(cmp(lista[i - 1], lista[i]), 0, `egalitate la pozitia ${i}`);
    }
  });
}

test("relevance: scorul bate data, data bate id-ul", () => {
  const p = (id: string, zi: number): ProdusSortabil => ({
    id, name: "x", price_range: { min: 1 }, is_featured: false, sort_order: 0,
    created_at: new Date(Date.UTC(2026, 0, zi)).toISOString(),
  });
  const scoruri = new Map([["a", 2], ["b", 9], ["c", 2]]);
  const lista = [p("a", 1), p("b", 1), p("c", 5)].sort(comparatorSortare("relevance", scoruri));
  // b are scorul cel mai mare; intre a si c (scor egal) castiga data mai noua.
  assert.deepEqual(lista.map((x) => x.id), ["b", "c", "a"]);
});

test("relevance fara harta de scoruri ramane o ordine totala", () => {
  const lista = catalogSintetic(50);
  const a = amesteca(lista, 2).sort(comparatorSortare("relevance", null)).map((p) => p.id);
  const b = amesteca(lista, 5).sort(comparatorSortare("relevance", null)).map((p) => p.id);
  assert.deepEqual(a, b);
});

test("popular: sort_order departajeaza in interiorul aceleiasi valori is_featured", () => {
  const p = (id: string, featured: boolean, ord: number): ProdusSortabil => ({
    id, name: "x", price_range: { min: 1 }, is_featured: featured, sort_order: ord,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  const lista = [p("x", false, 5), p("y", true, 9), p("z", false, 1), p("w", true, 2)]
    .sort(comparatorSortare("popular"));
  assert.deepEqual(lista.map((v) => v.id), ["w", "y", "z", "x"]);
});

test("numele se compara romaneste, cu numerele ca numere", () => {
  const nume = ["Cizma 10", "Cizma 2", "Cizma 9"];
  assert.deepEqual([...nume].sort(numeRomaneste), ["Cizma 2", "Cizma 9", "Cizma 10"]);
});

test("o data invalida nu strica sortarea intregii liste", () => {
  const p = (id: string, iso: string): ProdusSortabil => ({
    id, name: "x", price_range: { min: 1 }, is_featured: false, sort_order: 0, created_at: iso,
  });
  // Cu `new Date("nu-e-data").getTime()` = NaN, un comparator neaparat ar
  // intoarce NaN si ar face comparatiile inconsistente — nu doar randul rau.
  const lista = [p("a", "2026-03-01T00:00:00Z"), p("b", "nu-e-data"), p("c", "2026-05-01T00:00:00Z")]
    .sort(comparatorSortare("newest"));
  assert.deepEqual(lista.map((v) => v.id), ["c", "a", "b"]);
});

/* ── „Amestecat" si „Ordinea mea" ─────────────────────────────────────────── */

/** Produse cu id-uri de forma UUID: „random" citeste primii 8 hexa din id. */
function catalogCuUuid(n: number): ProdusSortabil[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${((i + 1) * 2654435761 >>> 0).toString(16).padStart(8, "0")}-0000-0000-0000-000000000000`,
    name: `Produs ${i % 13}`,
    price_range: { min: 10 + (i % 137) },
    is_featured: i % 11 === 0,
    sort_order: i % 7,
    created_at: new Date(Date.UTC(2026, 0, 1 + (i % 9))).toISOString(),
  }));
}

test("random: aceeasi samanta da aceeasi ordine, alta samanta da alta", () => {
  const baza = catalogCuUuid(300);
  const cu = (s: number, sare: number) =>
    amesteca(baza, sare).sort(comparatorSortare("random", null, { samanta: s })).map((p) => p.id);

  const a = amestecaBiti(20260903);
  const b = amestecaBiti(20260904);

  // Proprietatea de care atarna paginarea: doua cereri independente, aceeasi lista.
  assert.deepEqual(cu(a, 1), cu(a, 7));

  const mutate = cu(b, 1).filter((x, i) => x !== cu(a, 1)[i]).length;
  assert.ok(mutate > 240, `alta samanta a mutat doar ${mutate} din 300`);
});

test("⚠ samanta TREBUIE sa vina amestecata: una bruta abia reordoneaza", () => {
  /*
   * Proba asta pazeste contractul dintre `asezare.ts` si fisierul de fata.
   *
   * Cheia e `u XOR samanta`, si atat — anume, ca partea din SQL sa ramana un
   * singur XOR care nu poate depasi `bigint` si nu poate diverge de varianta din
   * TypeScript. Pretul e ca TOATA imprastierea trebuie sa fie deja in samanta:
   * doua numere mici difera numai in bitii de jos, iar bitii de jos aproape nu
   * conteaza intr-o sortare.
   *
   * De aceea samanta se produce EXCLUSIV prin `samantaAmestec` (adica
   * `amestecaBiti(ziua)`). Daca cineva scurtcircuiteaza vreodata asta si trimite
   * numarul zilei brut, „amestecat" devine o ordine care nu se mai schimba —
   * proba de fata cade si spune de ce.
   */
  const baza = catalogCuUuid(300);
  const cu = (s: number) =>
    [...baza].sort(comparatorSortare("random", null, { samanta: s })).map((p) => p.id);

  const brute = cu(20260903).filter((x, i) => x !== cu(20260904)[i]).length;
  assert.equal(brute, 0, "doua zile brute ar trebui sa dea aceeasi ordine — de asta e nevoie de amestec");

  const amestecate = cu(amestecaBiti(20260903)).filter((x, i) => x !== cu(amestecaBiti(20260904))[i]).length;
  assert.ok(amestecate > 240, `amestecate, cele doua zile au mutat doar ${amestecate} din 300`);
});

test("random nu lasa nicio pereche neordonata nici cand id-urile se ciocnesc", () => {
  /*
   * Cheia are 32 de biti, deci doua produse pot cadea pe aceeasi valoare. Fara
   * departajarea pe id, exact acele perechi ar fi ramas „egale" — iar doua pagini
   * cerute separat le-ar fi putut aseza invers.
   */
  const acelasiPrefix = (sufix: string): ProdusSortabil => ({
    id: `deadbeef-0000-0000-0000-${sufix}`,
    name: "x", price_range: { min: 1 }, is_featured: false, sort_order: 0,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  const lista = ["000000000001", "000000000002", "000000000003"].map(acelasiPrefix);
  const cmp = comparatorSortare("random", null, { samanta: 42 });
  const sortata = [...lista].sort(cmp);
  for (let i = 1; i < sortata.length; i++) {
    assert.notEqual(cmp(sortata[i - 1], sortata[i]), 0, `egalitate la pozitia ${i}`);
  }
});

test("manual: alesii primii, in ordinea ceruta, restul dupa regula de rezerva", () => {
  const baza = catalogCuUuid(20);
  const alesi = [baza[7].id, baza[3].id, baza[15].id];
  const pozitii = new Map(alesi.map((id, i) => [id, i]));
  const lista = amesteca(baza, 3)
    .sort(comparatorSortare("manual", null, { pozitii, rest: "price_asc" }));

  assert.deepEqual(lista.slice(0, 3).map((p) => p.id), alesi);
  // Restul, crescator dupa pret.
  const preturi = lista.slice(3).map((p) => p.price_range.min);
  assert.deepEqual(preturi, [...preturi].sort((a, b) => a - b));
});

test("manual fara niciun produs ales nu strica sortarea (capcana NaN)", () => {
  /*
   * ⚠ Aici toate pozitiile sunt `Infinity`. Scris ca scadere, comparatorul ar fi
   * intors `Infinity - Infinity` = NaN, iar un NaN nu strica un rand: face
   * comparatiile inconsistente si lasa lista NESORTATA, tacut.
   */
  const baza = catalogCuUuid(60);
  const cmp = comparatorSortare("manual", null, { pozitii: new Map(), rest: "price_asc" });
  const lista = amesteca(baza, 4).sort(cmp);
  const preturi = lista.map((p) => p.price_range.min);
  assert.deepEqual(preturi, [...preturi].sort((a, b) => a - b));
  for (let i = 1; i < lista.length; i++) {
    assert.notEqual(cmp(lista[i - 1], lista[i]), 0, `egalitate la pozitia ${i}`);
  }
});

test("manual: un id care nu mai exista in catalog nu lasa gol si nu muta pe nimeni", () => {
  const baza = catalogCuUuid(10);
  // Al doilea din lista e un produs sters intre timp.
  const pozitii = new Map([[baza[5].id, 0], ["11111111-0000-0000-0000-000000000000", 1], [baza[2].id, 2]]);
  const lista = amesteca(baza, 9).sort(comparatorSortare("manual", null, { pozitii, rest: "newest" }));
  assert.deepEqual(lista.slice(0, 2).map((p) => p.id), [baza[5].id, baza[2].id]);
  assert.equal(lista.length, 10);
});

test("manual cu rezerva tot „manual” nu intra in recursie", () => {
  const baza = catalogCuUuid(30);
  const cmp = comparatorSortare("manual", null, {
    pozitii: new Map([[baza[1].id, 0]]),
    rest: "manual" as CheieSortare,
  });
  const lista = [...baza].sort(cmp);
  assert.equal(lista[0].id, baza[1].id);
  assert.equal(lista.length, 30);
});

test("dupaId e strict: id-uri diferite nu sunt niciodata egale", () => {
  const p = (id: string): ProdusSortabil => ({
    id, name: "x", price_range: { min: 1 }, is_featured: false, sort_order: 0,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(dupaId(p("a"), p("b")) < 0, true);
  assert.equal(dupaId(p("b"), p("a")) > 0, true);
  assert.equal(dupaId(p("a"), p("a")), 0);
});
