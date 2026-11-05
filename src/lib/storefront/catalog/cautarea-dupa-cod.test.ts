import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  bucatiDeCod, buildProductSearchIndex, COD_CUVINTE_MAX, compactCod, queryProductSearchIndex, tokenize,
} from "@/lib/storefront/product-search";
import { coduriDeCautare, documentDeCautare } from "./doc-cautare";
import { dinProiectie, type RandProiectie } from "./din-proiectie";
import { proiecteazaRand } from "./proiector";

/**
 * Cautarea dupa codul de produs (eSAFE, 05.11.2026: „nu gasesc produsele daca caut dupa
 * codul de produs"). Masurat pe esafe.ro: „C494" nu gasea vesta al carei cod este.
 *
 * Ce apara: (1) codul intreg si inceputul lui gasesc produsul, si il pun PRIMUL;
 * (2) codul unei variante active gaseste produsul, al uneia dezactivate nu;
 * (3) cautarea pe cuvinte ramane neschimbata; (4) regula din SQL e aceeasi cu cea din TS.
 */

const vesta = {
  id: "vesta",
  name: "Vesta Half Mesh Hi-Vis",
  category: "Veste",
  codes: coduriDeCautare("C494", {
    variants: {
      enabled: true,
      combinations: [
        { sku: "C494ORRS/M", enabled: true },
        { sku: "C494-YER L/XL" },
        { sku: "C494OFF", enabled: false },
      ],
    },
  }),
};
const alta = { id: "alta", name: "Vesta 494 reflectorizanta", category: "Veste", codes: coduriDeCautare("S476", null) };
const fara = { id: "fara", name: "Manusi Simon", category: "Manusi" };

const idx = buildProductSearchIndex([alta, vesta, fara]);
const cauta = (q: string) => {
  const r = queryProductSearchIndex(idx, q)!;
  return [...r.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
};

test("codurile: lipite, fara diacritice, fara variantele dezactivate", () => {
  assert.deepEqual(vesta.codes, ["c494", "c494orrsm", "c494yerlxl"]);
  assert.deepEqual(coduriDeCautare("ab", null), [], "sub trei caractere nu e cod");
  assert.deepEqual(coduriDeCautare(null, { variants: { enabled: false, combinations: [{ sku: "X123" }] } }), [],
    "variantele oprite nu dau coduri");
  assert.equal(compactCod("Ș-12 a/B"), "s12ab");
});

test("codul compact e exact cuvintele interogarii lipite la loc (asa il compune SQL-ul)", () => {
  for (const q of ["C494", "c494 orr s/m", "H6220-S", "BX322BKYS", "ȘA-12"]) {
    assert.equal(tokenize(q).join(""), compactCod(q), q);
  }
});

test("codul intreg gaseste produsul si il pune primul", () => {
  assert.deepEqual(cauta("C494"), ["vesta"]);
  assert.deepEqual(cauta("c494"), ["vesta"]);
  assert.deepEqual(cauta("C494-ORR S/M"), ["vesta"], "codul unei variante, scris cu separatori");
});

test("inceputul de cod gaseste produsul cand are o cifra", () => {
  assert.deepEqual(cauta("C49"), ["vesta"]);
  assert.deepEqual(cauta("C494OR"), ["vesta"]);
  assert.deepEqual(cauta("C494OFF"), [], "varianta dezactivata nu gaseste produsul");
});

test("produsul cu codul cautat iese inaintea celui care are codul doar in nume", () => {
  const inNume = { id: "innume", name: "Bocanci C494 reflectorizanti", codes: coduriDeCautare("FW09", null) };
  const r = [...queryProductSearchIndex(buildProductSearchIndex([inNume, vesta]), "C494")!.entries()]
    .sort((a, b) => b[1] - a[1]).map(([id]) => id);
  assert.deepEqual(r, ["vesta", "innume"], "si cautarea pe cuvinte il gaseste in continuare pe cel din nume");
});

test("cautarea pe cuvinte nu se schimba", () => {
  assert.deepEqual(cauta("manusi"), ["fara"]);
  assert.deepEqual(new Set(cauta("vesta")), new Set(["vesta", "alta"]));
});

test("codurile trec prin proiector, randul de proiectie si documentul de cautare", () => {
  const pr = proiecteazaRand({
    id: "p1", business_id: "b", name: "Vesta", sku: "C494", description: null, category: null, tags: null,
    price: 10, page_sections: { variants: { enabled: true, combinations: [{ sku: "C494ORRS/M", enabled: true }] } },
  }, "2026-11-05T00:00:00Z");
  assert.deepEqual(pr.coduri, ["c494", "c494orrsm"]);

  const rand = { product_id: "p1", name: "Vesta", coduri: pr.coduri } as unknown as RandProiectie;
  assert.deepEqual(documentDeCautare(dinProiectie(rand)).codes, ["c494", "c494orrsm"]);
  const gol = { product_id: "p2", name: "X", coduri: [] } as unknown as RandProiectie;
  assert.equal("coduri" in dinProiectie(gol), false, "fara coduri, produsul ramane cu forma de dinainte");
});

test("codul scris langa alte cuvinte: celelalte cuvinte trebuie sa potriveasca si ele", () => {
  assert.deepEqual(cauta("vesta C494"), ["vesta"]);
  assert.deepEqual(cauta("C494 vesta"), ["vesta"]);
  assert.deepEqual(cauta("vesta half c494-orr"), ["vesta"], "codul unei variante, cu doua cuvinte inainte");
  assert.deepEqual(cauta("manusi C494"), [], "codul exista, dar „manusi” nu e vesta");
  assert.deepEqual(cauta("vesta S476"), ["alta"], "fiecare produs cu codul lui");
});

test("bucatile de cod: alaturate, lipite, minim trei caractere, cel mult opt cuvinte", () => {
  assert.deepEqual(bucatiDeCod(["vesta", "c", "494"]).map((b) => b.cod),
    ["vesta", "vestac", "vestac494", "c494", "494"]);
  const lung = bucatiDeCod(Array.from({ length: 12 }, () => "ab"));
  assert.ok(lung.every((b) => b.j - b.i < COD_CUVINTE_MAX));
});

test("SQL: aceeasi regula (intreg mereu, inceput doar cu cifra, minim trei) si aceleasi bucati", () => {
  const sql = readFileSync(
    path.resolve(process.cwd(), "migrations/2027-01-31-codul-langa-alte-cuvinte.sql"), "utf8");

  // Bucatile: aceleasi cuvinte alaturate, acelasi plafon (j - i <= 7, adica opt cuvinte), minim trei.
  const fn = sql.slice(sql.indexOf("function public.catalog_bucati_cod"), sql.indexOf("revoke execute"));
  assert.equal(COD_CUVINTE_MAX, 8);
  assert.match(fn, /generate_series\(i, least\(cardinality\(p_cuvinte\), i \+ 7\)\)/);
  assert.match(fn, /array_to_string\(p_cuvinte\[i:j\], ''\)/);
  assert.match(fn, /length\(x\) >= 3/);

  // Potrivirea, in ambele locuri care aleg dupa cod: intreg mereu (&&), inceput doar cu cifra.
  const intreg = sql.match(/c\.coduri && (bucati\.b|v_bucati)/g) ?? [];
  const inceput = sql.match(/where p ~ '\[0-9\]' and k like p \|\| '%'/g) ?? [];
  assert.equal(intreg.length, 2);
  assert.equal(inceput.length, 2);
  assert.doesNotMatch(sql, /catalog_potriveste_cod\(c\.coduri/, "regula veche, pe toata interogarea lipita");
});
