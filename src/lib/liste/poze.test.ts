import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { iduriDeProdus, inGrupe } from "./poze";

/*
  Pozele produselor din listele panoului (Comenzi, Retururi) si taierea listelor de id-uri.

  Doua capcane, amandoua fara eroare la vedere: un `product_id` care nu e UUID (linie de
  marketplace) face baza sa refuze TOATA cererea, deci nicio poza pentru nicio comanda; iar o
  lista de id-uri prea lunga in adresa cererii e respinsa cu totul.
*/

test("o lista se taie in grupe de cel mult o suta, fara sa piarda si fara sa repete", () => {
  const lista = Array.from({ length: 250 }, (_, i) => i);
  const grupe = inGrupe(lista);
  assert.deepEqual(grupe.map((g) => g.length), [100, 100, 50]);
  assert.deepEqual(grupe.flat(), lista);
  assert.deepEqual(inGrupe([]), []);
  assert.deepEqual(inGrupe([1, 2, 3], 2), [[1, 2], [3]]);
  /* O marime fara sens nu face o bucla fara sfarsit. */
  assert.deepEqual(inGrupe([1, 2], 0), [[1], [2]]);
});

test("⚠ doar id-urile care chiar sunt UUID ajung in cerere, fiecare o data", () => {
  const p1 = "11111111-2222-4333-8444-555555555555";
  const p2 = "AAAAAAAA-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const iduri = iduriDeProdus([
    { items: [{ product_id: p1 }, { product_id: "extra_manual_ab12cd34" }, { product_id: "EMAG-778899" }] },
    { items: [{ product_id: p1 }, { product_id: p2 }, { product_id: null }, {}] },
    { items: "nu e o lista" },
    {},
  ]);
  assert.deepEqual(iduri, [p1, p2]);
});

test("⚠ pozele se cer doar dintre produsele magazinului", () => {
  const sursa = readFileSync("src/lib/liste/poze.ts", "utf8");
  assert.ok(sursa.includes('supabase.from("products").select("id, images").eq("business_id", idMagazin).in("id", grup)'));
});
