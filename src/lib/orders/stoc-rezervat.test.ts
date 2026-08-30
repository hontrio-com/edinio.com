import assert from "node:assert/strict";
import { test } from "node:test";
import { stocRezervat } from "./stoc-rezervat";

/**
 * CONTRACTUL dintre ce scrie aplicatia si ce asteapta baza.
 *
 * `elibereaza_stoc_comanda` citeste `stoc_rezervat->'produse'` si
 * `->'variante'`, si trece prima lista prin `elibereaza_stoc_batch` (care cere
 * `product_id` / `quantity`) iar a doua prin `restaureaza_variante_batch` (care
 * cere in plus `variant_title`).
 *
 * O nepotrivire aici NU DA NICIO EROARE: functia din baza pur si simplu n-ar
 * gasi ce sa puna inapoi si ar raporta senin ca a eliberat. Adica exact defectul
 * pentru care exista coloana — stoc scazut pentru marfa nevanduta — dar de data
 * asta cu un marcaj care spune ca s-a rezolvat.
 */

test("forma e exact cea pe care o citeste elibereaza_stoc_comanda", () => {
  const r = stocRezervat(
    [{ product_id: "p1", quantity: 2 }],
    [{ product_id: "p1", variant_title: "XL", quantity: 2 }],
  );
  assert.deepEqual(Object.keys(r).sort(), ["produse", "variante"]);
  assert.deepEqual(r.produse, [{ product_id: "p1", quantity: 2 }]);
  assert.deepEqual(r.variante, [{ product_id: "p1", variant_title: "XL", quantity: 2 }]);
});

test("liniile FARA varianta nu intra in lista de variante", () => {
  // Altfel `restaureaza_variante_batch` ar primi randuri fara `variant_title`, pe
  // care le sare — dar lista ar spune ca s-a rezervat pe varianta cand nu s-a
  // rezervat, si prima citire a cuiva care depaneaza ar porni gresit.
  const r = stocRezervat(
    [{ product_id: "p1", quantity: 1 }, { product_id: "p2", quantity: 3 }],
    [
      { product_id: "p1", variant_title: "M", quantity: 1 },
      { product_id: "p2", variant_title: null, quantity: 3 },
      { product_id: "p2", quantity: 3 },
    ],
  );
  assert.equal(r.produse.length, 2);
  assert.deepEqual(r.variante, [{ product_id: "p1", variant_title: "M", quantity: 1 }]);
});

test("cantitatea se normalizeaza ca la scadere, nu altfel", () => {
  /*
   * `scadeStoculVariantelor` foloseste `Math.max(1, Math.floor(Number(q) || 1))`.
   * Inversul TREBUIE sa foloseasca aceeasi formula: rotunjit altfel, s-ar pune
   * inapoi alt numar decat s-a luat, si diferenta n-ar aparea nicaieri.
   */
  const r = stocRezervat([], [
    { product_id: "a", variant_title: "X", quantity: 2.9 },
    { product_id: "b", variant_title: "X", quantity: 0 },
    { product_id: "c", variant_title: "X", quantity: -5 },
    { product_id: "d", variant_title: "X", quantity: NaN },
  ]);
  assert.deepEqual(r.variante.map((v) => v.quantity), [2, 1, 1, 1]);
});

test("fara variante deloc, lista e goala, nu lipsa", () => {
  // `coalesce(v_rez->'variante', '[]')` din baza acopera si cheia lipsa, dar o
  // lista goala e ce trimite calea de cos — si trebuie sa ramana valida.
  const r = stocRezervat([{ product_id: "p", quantity: 1 }]);
  assert.deepEqual(r.variante, []);
  assert.equal(Array.isArray(r.variante), true);
});
