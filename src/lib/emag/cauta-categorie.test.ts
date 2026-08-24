import { strict as assert } from "node:assert";
import { test } from "node:test";
import { cautaCategorie, pentruCautare } from "./cauta-categorie";
import type { EmagCategorie } from "./types";

/*
 * ═══ DE CE A FOST NEVOIE DE CAUTARE (masurat, 24.08.2026) ═══
 *
 * `sugereazaCategorie` compara nume cu nume, pe litere. Rulata pe cele 13 categorii
 * ramase nemapate ale unui magazin de animale, a dat ZERO cu incredere mare:
 *   „Castron" -> „Casti PC" · „Aditivi furajeri" -> „Aditivi auto"
 *   „Sampoane", „Litiera", „Lapte praf" -> nimic
 *
 * Comerciantul le-a ignorat pe drept si a ramas cu 346 de produse nepublicabile.
 * Raspunsul bun ERA in lista lor — doar ca trebuia cautat, nu ghicit.
 */

const RAFT = [
  { id: 3571, name: "Hrana pentru pisici", is_allowed: 1 },
  { id: 1330, name: "Hrana pentru caini", is_allowed: 1 },
  { id: 287, name: "Casti PC", is_allowed: 1 },
  { id: 4001, name: "Șampoane pentru animale", is_allowed: 1 },
  { id: 4002, name: "Litiera pisici", is_allowed: 1 },
  { id: 9999, name: "Hrana exotica", is_allowed: 0 },
] as unknown as EmagCategorie[];

test("cauta categorie: se gaseste dupa cuvinte, nu dupa asemanare de litere", () => {
  /* ⚠ Chiar cazul care a esuat: „Castron" nu trebuie sa dea „Casti PC". */
  assert.deepEqual(cautaCategorie("casti", RAFT).map((c) => c.id), [287]);
  assert.deepEqual(cautaCategorie("castron", RAFT), [], "nu inventeaza o potrivire");
});

test("cauta categorie: TOATE cuvintele, nu oricare", () => {
  /* ⚠ „hrana pisici" trebuie sa dea hrana pentru pisici, nu tot ce contine „hrana" —
     altfel cautarea intoarce sute de randuri si nu ajuta cu nimic. */
  assert.deepEqual(cautaCategorie("hrana pisici", RAFT).map((c) => c.id), [3571]);
  assert.equal(cautaCategorie("hrana", RAFT).length, 2, "un singur cuvant da amandoua");
});

test("cauta categorie: diacriticele nu tin omul pe loc", () => {
  /*
   * ⚠ Comerciantul scrie „sampoane", raftul lor scrie „Șampoane" — sau invers.
   * Comparate ca atare, jumatate din cautari n-ar gasi nimic, iar omul ar crede ca nu
   * exista categoria.
   */
  for (const scris of ["sampoane", "Șampoane", "şampoane", "SAMPOANE"]) {
    assert.equal(cautaCategorie(scris, RAFT).length, 1, `scris „${scris}"`);
  }
  assert.equal(pentruCautare("Șampoane"), pentruCautare("sampoane"));
  assert.equal(pentruCautare("Hrană"), "hrana");
});

test("cauta categorie: NU se arata categoriile in care n-are voie sa vanda", () => {
  /*
   * ⚠ O categorie fara acces arata la fel in lista, dar produsele trimise acolo se
   * resping cu o eroare de DOCUMENTATIE — adica exact ca o caracteristica lipsa, iar
   * omul ar cauta zile intregi in datele produsului o problema care era de acces.
   */
  assert.deepEqual(cautaCategorie("exotica", RAFT), []);
});

test("cauta categorie: un termen gol nu intoarce tot raftul", () => {
  /* ⚠ Cele 2.940 de categorii ale lor, aruncate pe ecran la o cautare goala, ar fi facut
     ecranul de nefolosit exact in clipa deschiderii lui. */
  for (const gol of ["", "   ", "\t"]) assert.deepEqual(cautaCategorie(gol, RAFT), []);
});
