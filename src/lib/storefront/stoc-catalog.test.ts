import assert from "node:assert/strict";
import { test } from "node:test";
import { esteFaraStocInCatalog, type ProdusCuStoc } from "./stoc-catalog";

/**
 * Capcana pe care o pazeste fisierul asta.
 *
 * Filtrul „In stoc" din catalog suna `!track_inventory || stock > 0`. Pentru un
 * PACHET, prima ramura e mereu adevarata — pachetele se scriu cu
 * `track_inventory: false` — deci TOATE pachetele treceau filtrul, oricum ar fi
 * stat componentele lor.
 *
 * Cifrele de mai jos sunt masurate in productie la 08.08.2026: 12 pachete
 * active, toate cu `track_inventory: false`, toate trecand filtrul; dintre ele
 * doua sunt real indisponibile.
 */

const pachet = (items: { product_id: string; quantity?: number }[]): ProdusCuStoc => ({
  id: "pachet",
  is_bundle: true,
  // Cum se scrie un pachet in baza, chiar asa: vezi lib/bundles.ts.
  track_inventory: false,
  stock_quantity: null,
  page_sections: { bundle: { items } },
});

const simplu = (over: Partial<ProdusCuStoc> = {}): ProdusCuStoc => ({
  id: "p", is_bundle: false, track_inventory: true, stock_quantity: 5, ...over,
});

const catalog = (...produse: ProdusCuStoc[]) => new Map(produse.map((p) => [p.id, p]));

test("„Pachet Femei\": toate componentele sterse => FARA STOC", () => {
  // Cazul viu din suplio, 358,40 lei, cu cele trei componente sterse. Cu regula
  // veche (`!track_inventory`) raspunsul era „in stoc" si pachetul statea pe raft.
  const p = pachet([{ product_id: "a" }, { product_id: "b" }, { product_id: "c" }]);
  assert.equal(esteFaraStocInCatalog(p, catalog(p)), true);
});

test("„Kit Incarcare Rapida\": o componenta epuizata => FARA STOC", () => {
  const c1 = simplu({ id: "c1", stock_quantity: 10 });
  const c2 = simplu({ id: "c2", stock_quantity: 0 });
  const p = pachet([{ product_id: "c1" }, { product_id: "c2" }]);
  assert.equal(esteFaraStocInCatalog(p, catalog(p, c1, c2)), true);
});

test("pachetul cu toate componentele vii si pe stoc e disponibil", () => {
  const c1 = simplu({ id: "c1", stock_quantity: 10 });
  const c2 = simplu({ id: "c2", track_inventory: false, stock_quantity: null });
  const p = pachet([{ product_id: "c1" }, { product_id: "c2" }]);
  assert.equal(esteFaraStocInCatalog(p, catalog(p, c1, c2)), false);
});

test("cantitatea conteaza: 3 bucati din ceva ce mai are 2 nu se poate vinde", () => {
  const c1 = simplu({ id: "c1", stock_quantity: 2 });
  const p = pachet([{ product_id: "c1", quantity: 3 }]);
  assert.equal(esteFaraStocInCatalog(p, catalog(p, c1)), true);
});

test("pachetul cu zero componente nu e vandabil", () => {
  // Si „pachet gol", si „configul a fost sters de formularul obisnuit".
  const p = pachet([]);
  assert.equal(esteFaraStocInCatalog(p, catalog(p)), true);
});

test("o componenta care nu e in harta inseamna STEARSA, nu necunoscuta", () => {
  // Inversul acestei citiri e chiar bug-ul original. Harta e catalogul activ
  // COMPLET, deci absenta e informatie, nu lipsa de informatie.
  const c1 = simplu({ id: "c1", stock_quantity: 10 });
  const p = pachet([{ product_id: "c1" }, { product_id: "disparut" }]);
  assert.equal(esteFaraStocInCatalog(p, catalog(p, c1)), true);
});

/* ─── Produse simple ───────────────────────────────────────────────────────── */

test("produsul simplu fara urmarire de stoc e mereu disponibil", () => {
  assert.equal(esteFaraStocInCatalog(simplu({ track_inventory: false, stock_quantity: 0 }), catalog()), false);
});

test("produsul simplu cu stoc zero e epuizat", () => {
  assert.equal(esteFaraStocInCatalog(simplu({ stock_quantity: 0 }), catalog()), true);
});

test("stocul NEGATIV se citeste ca disponibil, ca pana acum", () => {
  // Nu e o scapare, e pastrat deliberat: `=== 0`, nu `<= 0`, e ce face codul de
  // azi peste tot. Mutarea regulii n-are voie sa schimbe pe furis ce vede
  // clientul. Daca se schimba, se schimba separat si vizibil.
  assert.equal(esteFaraStocInCatalog(simplu({ stock_quantity: -3 }), catalog()), false);
});

test("stocul null la un produs urmarit nu il declara epuizat", () => {
  assert.equal(esteFaraStocInCatalog(simplu({ stock_quantity: null }), catalog()), false);
});
