import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GREUTATE_MINIMA_KG,
  GREUTATE_REZERVA_KG,
  PRAG_API_CURIER,
  greutatePentruCurier,
  greutateaColetului,
  idurileDeCantarit,
  liniileComenzii,
} from "./awb-weight";

/**
 * Cotatia cerea pretul pe greutatea reala, dar AWB-ul declara un kilogram fix.
 * Curierul cantareste la depozit si refactureaza banda adevarata, deci
 * diferenta o platea comerciantul. Masurat pe 2026-08-03: 11 din cele 96 de
 * comenzi din productie trec de un kilogram (maxim 7,79 kg), iar eSAFE are 267
 * de produse active peste un kilogram, maxim 13,1 kg.
 */

const p = (id: string, grame: number | null) => ({ id, weight_grams: grame });
const linie = (pid: string, qty: number) => ({ product_id: pid, quantity: qty, name: "x", price: 1 });

const UUID_A = "8b6071e3-a94f-4ad2-93b6-cc3acfbaaabf";
const UUID_B = "3c219c2d-1111-4222-8333-444455556666";

test("greutatea coletului se aduna din produsele comenzii", () => {
  const r = greutateaColetului([linie(UUID_A, 3), linie(UUID_B, 2)], [p(UUID_A, 1500), p(UUID_B, 400)]);
  assert.equal(r.kg, 5.3); // 3 x 1,5 + 2 x 0,4
  assert.equal(r.dinCatalog, true);
});

test("fara nicio greutate in catalog se declara rezerva, si se spune ca e rezerva", () => {
  // Cazul a 29 din cele 96 de comenzi din productie. Un kilogram e exact ce
  // pleca si pana acum, deci comenzile astea nu se schimba cu nimic.
  const r = greutateaColetului([linie(UUID_A, 4)], [p(UUID_A, null)]);
  assert.equal(r.kg, GREUTATE_REZERVA_KG);
  assert.equal(r.dinCatalog, false, "formularul trebuie sa poata spune ca e o rezerva");
});

test("o comanda fara linii nu declara zero kilograme", () => {
  assert.deepEqual(greutateaColetului([], []), { kg: GREUTATE_REZERVA_KG, dinCatalog: false, liniiFaraGreutate: 0 });
  assert.deepEqual(greutateaColetului(null, []), { kg: GREUTATE_REZERVA_KG, dinCatalog: false, liniiFaraGreutate: 0 });
});

test("greutatile foarte mici urca la pragul minim", () => {
  // 7 comenzi din productie ies sub 100 de grame, minimul masurat 10 grame. Un
  // AWB pe 0,01 kg nu e o declaratie pe care s-o accepte cineva, iar 0,1 kg sta
  // in aceeasi banda de tarif, deci pretul nu se misca.
  const r = greutateaColetului([linie(UUID_A, 1)], [p(UUID_A, 10)]);
  assert.equal(r.kg, GREUTATE_MINIMA_KG);
  assert.equal(r.dinCatalog, true, "tot din catalog vine, doar ridicata la prag");
});

test("o optiune de comanda nu se cere bazei, ca sa nu cada toata interogarea", () => {
  // `extra_ext_...` nu e uuid. Trimis intr-un in(id) pe coloana uuid, Postgres da
  // 22P02 si supabase-js intoarce data null: s-ar pierde TOATE produsele, nu doar
  // linia asta. 3 astfel de linii exista azi in productie.
  const items = [linie(UUID_A, 1), linie("extra_ext_1781723399523", 1)];
  assert.deepEqual(idurileDeCantarit(items), [UUID_A]);
});

test("optiunea de comanda nu adauga greutate, dar nici nu o sterge pe a produsului", () => {
  const r = greutateaColetului(
    [linie(UUID_A, 2), linie("extra_ext_1781723399523", 1)],
    [p(UUID_A, 760)],
  );
  assert.equal(r.kg, 1.52); // exact comanda #0004, cea mai grea cu AWB emis
});

test("id-urile ies fara duplicate", () => {
  assert.deepEqual(idurileDeCantarit([linie(UUID_A, 1), linie(UUID_A, 2), linie(UUID_B, 1)]), [UUID_A, UUID_B]);
});

test("liniile stricate nu opresc restul comenzii", () => {
  // `items` e jsonb: nimic nu garanteaza forma. O linie fara product_id se sare,
  // dar coletul tot pleaca cu greutatea celorlalte.
  const items = [null, { quantity: 2 }, { product_id: "", quantity: 1 }, linie(UUID_A, 1)];
  assert.deepEqual(liniileComenzii(items), [{ productId: UUID_A, quantity: 1 }]);
  assert.equal(greutateaColetului(items, [p(UUID_A, 2000)]).kg, 2);
});

test("cantitatea lipsa sau aiurea nu produce o greutate absurda", () => {
  // NaN, negativ si plafonul sunt deja treaba lui `contextulCosului`; aici se
  // verifica doar ca traversarea prin forma stocata nu le pierde.
  assert.equal(greutateaColetului([{ product_id: UUID_A }], [p(UUID_A, 500)]).kg, 0.5);
  assert.equal(greutateaColetului([linie(UUID_A, -3)], [p(UUID_A, 500)]).kg, 0.5);
  assert.equal(greutateaColetului([linie(UUID_A, 1e9)], [p(UUID_A, 500)]).kg, 499.5);
});

test("comanda PARTIALA: cifra e incompleta, si o spune", () => {
  // Sase comenzi din productie arata asa. Pe #0033, suma produselor cantarite da
  // 0,4 kg pentru un colet care contine si o umbrela parasolara fara greutate in
  // catalog — adica MAI departe de adevar decat rezerva de 1 kg. Marcata ca
  // „din catalog", ar fi plecat la curier ca un numar masurat.
  const items = [
    { product_id: "11111111-1111-4111-8111-111111111111", quantity: 1 },
    { product_id: "22222222-2222-4222-8222-222222222222", quantity: 1 },
  ];
  const r = greutateaColetului(items, [
    { id: "11111111-1111-4111-8111-111111111111", weight_grams: 400 },
    { id: "22222222-2222-4222-8222-222222222222", weight_grams: null },
  ]);
  assert.equal(r.kg, 0.4);
  assert.equal(r.dinCatalog, false, "incompleta nu se marcheaza ca venita din catalog");
  assert.equal(r.liniiFaraGreutate, 1);
});

test("extraoptiunile nu se numara ca produse fara greutate", () => {
  // Sunt servicii; „Comanda cu Prioritate" n-are cum sa cantareasca.
  const items = [
    { product_id: "11111111-1111-4111-8111-111111111111", quantity: 1 },
    { product_id: "extra_ext_1781723399523", quantity: 1 },
  ];
  const r = greutateaColetului(items, [{ id: "11111111-1111-4111-8111-111111111111", weight_grams: 500 }]);
  assert.equal(r.dinCatalog, true);
  assert.equal(r.liniiFaraGreutate, 0);
});


/**
 * Pragul de VALIDARE al API-ului, distinct de cel de tarif.
 *
 * Cazul real: magazinul suporti-numar emisese 44 de AWB-uri Woot si s-a oprit
 * brusc pe 3 august 2026, exact cand c253d85 a inlocuit greutatea fixa de 1 kg
 * din formulare cu cea reala din catalog. Produsul lui cantareste 400 g, deci
 * pleca `weight: 0.4`, iar Woot raspundea 400 cu:
 *
 *   {"error":{"parcels.0.weight":
 *     "The parcels.0.weight field must contain a number greater than or equal to 1."}}
 */
test("Woot: 400 g — greutatea care a rupt emiterea — urca la 1 kg", () => {
  assert.equal(greutatePentruCurier(0.4, "woot"), 1);
});

test("Woot: orice valoare subunitara urca la 1", () => {
  for (const kg of [0.01, 0.1, 0.25, 0.999]) {
    assert.equal(greutatePentruCurier(kg, "woot"), 1, `${kg} kg`);
  }
});

test("Woot: greutatile reale de peste 1 kg NU se modifica", () => {
  for (const kg of [1, 1.5, 7.79, 13.1]) {
    assert.equal(greutatePentruCurier(kg, "woot"), kg, `${kg} kg`);
  }
});

test("Woot: valorile imposibile cad pe prag, nu pe zero", () => {
  assert.equal(greutatePentruCurier(0, "woot"), 1);
  assert.equal(greutatePentruCurier(-3, "woot"), 1);
  assert.equal(greutatePentruCurier(Number.NaN, "woot"), 1);
});

test("pragul de tarif si cel de validare raman lucruri diferite", () => {
  // 0,1 e ales dupa benzile de tarif; 1 e cerinta API a lui Woot.
  assert.equal(GREUTATE_MINIMA_KG, 0.1);
  assert.equal(PRAG_API_CURIER.woot, 1);
  assert.ok(PRAG_API_CURIER.woot > GREUTATE_MINIMA_KG);
});

test("ridicarea la 1 kg nu sare in alta banda de tarif", () => {
  // 0-1 kg e prima banda la toti curierii interni: 0,4 si 1 costa la fel.
  assert.ok(greutatePentruCurier(0.4, "woot") <= 1);
});
