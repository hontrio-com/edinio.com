import assert from "node:assert/strict";
import { test } from "node:test";
import { codSiNatura, idsDeCautat } from "./invoice-lines";
import { codExtraoptiune, esteIdExtra } from "@/lib/orders/extras";

/**
 * O extraoptiune de 5 lei stergea codul de pe TOATE liniile facturii.
 *
 * Cele trei case de facturare cautau SKU-urile dand bazei toata lista de id-uri
 * din comanda, iar extraoptiunile intra in `orders.items` cu `product_id` de forma
 * `extra_<id>`. PostgREST refuza atunci intreaga cerere cu 400 (Postgres 22P02),
 * `supabase-js` nu arunca, iar `data ?? []` transforma refuzul intr-o lista goala.
 */

// Forma EXACTA din productie: comenzile #0018, #0065 si #0073 de la suporti-numar.
const PRODUS = "8b6071e3-a94f-4ad2-93b6-cc3acfbaaabf";
const EXTRA = "extra_ext_1781723399523";

test("id-ul unei extraoptiuni nu ajunge niciodata in interogare", () => {
  assert.deepEqual(idsDeCautat([{ product_id: PRODUS }, { product_id: EXTRA }]), [PRODUS]);
});

test("liniile fara produs din catalog ies si ele, fara sa strice restul", () => {
  // Comenzile din marketplace au `product_id` null cand SKU-ul nu s-a mapat.
  assert.deepEqual(
    idsDeCautat([{ product_id: null }, { product_id: PRODUS }, { product_id: undefined }, { product_id: "" }]),
    [PRODUS],
  );
});

test("id-urile se deduplica", () => {
  assert.deepEqual(idsDeCautat([{ product_id: PRODUS }, { product_id: PRODUS }]), [PRODUS]);
});

test("o comanda numai din extraoptiuni nu produce nicio interogare", () => {
  assert.deepEqual(idsDeCautat([{ product_id: EXTRA }]), []);
});

test("produsul isi primeste codul, extraoptiunea pe al ei", () => {
  const skus = new Map([[PRODUS, "SNI-001"]]);
  assert.deepEqual(codSiNatura({ product_id: PRODUS }, skus), { code: "SNI-001", esteServiciu: false });
  // Extraoptiunea devine SERVICIU: ca linie de marfa fara cod, ea e chiar randul
  // care nu exista in gestiune si din cauza caruia emiterea esueaza pe conturile
  // cu „Foloseste cod produs" activ.
  assert.deepEqual(codSiNatura({ product_id: EXTRA }, skus), { code: "extra-ext_1781723399523", esteServiciu: true });
});

test("extraoptiunea are cod chiar si cand harta e goala", () => {
  assert.deepEqual(codSiNatura({ product_id: EXTRA }, new Map()), { code: "extra-ext_1781723399523", esteServiciu: true });
});

test("fara SKU, linia pleaca fara cod — degradare tacuta, dar tolerata", () => {
  // Codul e best-effort de la bun inceput: lipsa lui nu are voie sa opreasca
  // emiterea, fiindca pe calea automata un refuz e mut.
  assert.deepEqual(codSiNatura({ product_id: PRODUS }, new Map()), { esteServiciu: false });
  assert.deepEqual(codSiNatura({ product_id: null }, new Map()), { esteServiciu: false });
});

test("doua extraoptiuni ale aceluiasi magazin nu impart acelasi cod", () => {
  // Un cod de articol cu doua denumiri si doua preturi e un conflict in
  // nomenclatorul furnizorului.
  assert.notEqual(codExtraoptiune("extra_ext_1"), codExtraoptiune("extra_ext_2"));
  assert.equal(codExtraoptiune("extra_"), "extra", "id gol: tot ramane un cod valid");
  assert.equal(codExtraoptiune("extra_a b/c"), "extra-a-b-c", "fara caractere care rup nomenclatorul");
  assert.notEqual(codExtraoptiune("extra_a b/c"), codExtraoptiune("extra_abc"),
    "curatarea nu are voie sa turteasca doua id-uri diferite in acelasi cod");
});

test("prefixul extraoptiunii e recunoscut, restul nu", () => {
  assert.equal(esteIdExtra(EXTRA), true);
  assert.equal(esteIdExtra(PRODUS), false);
  assert.equal(esteIdExtra(null), false);
  assert.equal(esteIdExtra(undefined), false);
});
