import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { curataTermenPrecomanda, termenPrecomanda, TERMEN_PRECOMANDA_MAX } from "./precomanda";

test("termenul se arata doar cand produsul e chiar in precomanda", () => {
  assert.equal(termenPrecomanda({ stock_status: "preorder", termen_precomanda: "Livrare in 3-4 saptamani" }), "Livrare in 3-4 saptamani");
  // Ramas de cand era in precomanda: produsul a intrat in stoc, termenul nu mai e adevarat.
  assert.equal(termenPrecomanda({ stock_status: "in_stock", termen_precomanda: "Livrare in 3-4 saptamani" }), null);
  assert.equal(termenPrecomanda({ termen_precomanda: "x" }), null);
  assert.equal(termenPrecomanda({ stock_status: "preorder", termen_precomanda: "   " }), null);
  assert.equal(termenPrecomanda(null), null);
});

test("curatarea strange spatiile, taie la plafon si nu primeste altceva decat text", () => {
  assert.equal(curataTermenPrecomanda("  Se livreaza \n din 15 noiembrie  "), "Se livreaza din 15 noiembrie");
  assert.equal(curataTermenPrecomanda("x".repeat(500))?.length, TERMEN_PRECOMANDA_MAX);
  assert.equal(curataTermenPrecomanda(""), null);
  assert.equal(curataTermenPrecomanda(42), null);
});

test("amandoua paginile de produs trec prin acelasi termen si ascund atunci estimarea generala", () => {
  for (const f of ["ProductPageClassic.tsx", "ProductPageDetailed.tsx"]) {
    const s = readFileSync(`src/components/storefront/sections/product/${f}`, "utf8");
    assert.match(s, /const termenPreco = isPreorder \? termenPrecomanda\(pageSections\) : null;/, f);
    assert.match(s, /&& !termenPreco/, f);
  }
});
