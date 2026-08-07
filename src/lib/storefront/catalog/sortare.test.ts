import test from "node:test";
import assert from "node:assert/strict";
import { comparatorSortare, dupaId, numeRomaneste, type CheieSortare, type ProdusSortabil } from "./sortare";

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

const CHEI: CheieSortare[] = ["price_asc", "price_desc", "popular", "name_asc", "newest"];

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

test("dupaId e strict: id-uri diferite nu sunt niciodata egale", () => {
  const p = (id: string): ProdusSortabil => ({
    id, name: "x", price_range: { min: 1 }, is_featured: false, sort_order: 0,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(dupaId(p("a"), p("b")) < 0, true);
  assert.equal(dupaId(p("b"), p("a")) > 0, true);
  assert.equal(dupaId(p("a"), p("a")), 0);
});
