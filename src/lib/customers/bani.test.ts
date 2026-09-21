import test from "node:test";
import assert from "node:assert/strict";

import { desfaComenzile, eIncasata, eValida } from "./bani";

/* ── Valoarea comenzilor ────────────────────────────────────────────────── */

test("valida inseamna tot ce n-a cazut", () => {
  for (const s of ["pending", "confirmed", "processing", "shipped", "delivered"]) {
    assert.equal(eValida(s), true, s);
  }
  assert.equal(eValida("cancelled"), false);
  assert.equal(eValida("refunded"), false);
});

test("⚠ regula veche NU se clinteste", () => {
  /*
   * Cifra „valoarea comenzilor" e aceeasi pe care o vedea comerciantul si ieri. Ce se
   * schimba e numele ei si faptul ca de acum are o sora care spune altceva. Daca
   * regula asta se muta, i se schimba istoricul sub ochi fara sa ceara nimeni.
   */
  assert.equal(eValida(null), true, "o stare lipsa nu e o cadere");
  assert.equal(eValida(""), true);
});

/* ── Total incasat ──────────────────────────────────────────────────────── */

test("plata online incasata inseamna incasat", () => {
  assert.equal(eIncasata({ status: "shipped", payment_status: "paid", payment_method: "netopia" }), true);
  assert.equal(eIncasata({ status: "processing", payment_status: "paid", payment_method: "emag" }), true);
});

test("⚠⚠ rambursul LIVRAT e incasat, desi scrie `unpaid`", () => {
  /*
   * ⚠ ASTA E PROBA CARE APARA CIFRA. Masurat pe productie: 88 de comenzi sunt
   * `delivered` + `unpaid` + ramburs, insumand 7.693,43 lei. Curierul a luat banii la
   * usa, dar nimeni nu intoarce campul pe `paid` dupa livrare.
   *
   * Cu regula simpla (`payment_status = 'paid'`), banii aia ar fi disparut din
   * „incasat", si fiecare comerciant cu ramburs ar fi vazut clienti care „n-au platit
   * niciodata", desi au platit de fiecare data.
   */
  assert.equal(
    eIncasata({ status: "delivered", payment_status: "unpaid", payment_method: "cash_on_delivery" }),
    true,
  );
});

test("⚠ rambursul EXPEDIAT nu e inca incasat", () => {
  /*
   * Banii sunt pe drum, nu au ajuns. 123 de comenzi stau azi exact acolo. Numarate ca
   * incasate, cifra ar arata bani pe care comerciantul nu-i are in mana.
   */
  assert.equal(
    eIncasata({ status: "shipped", payment_status: "unpaid", payment_method: "cash_on_delivery" }),
    false,
  );
  for (const s of ["pending", "confirmed", "processing"]) {
    assert.equal(
      eIncasata({ status: s, payment_status: "unpaid", payment_method: "cash_on_delivery" }), false, s,
    );
  }
});

test("⚠⚠ anulata cu plata facuta NU e incasat", () => {
  /*
   * Pe productie: 13 comenzi `cancelled` cu `payment_status = 'paid'` (eMAG) si 4
   * `refunded` cu `paid` (Trendyol). Banii aia se intorc la cumparator. Numarati ca
   * incasari, cifra s-ar umfla cu exact sumele pe care comerciantul le da inapoi.
   */
  assert.equal(eIncasata({ status: "cancelled", payment_status: "paid", payment_method: "emag" }), false);
  assert.equal(eIncasata({ status: "refunded", payment_status: "paid", payment_method: "trendyol" }), false);
});

test("⚠ plata rambursata pe o comanda nemutata NU e incasat", () => {
  /* Doua comenzi asa pe productie: `shipped`, dar cu plata deja intoarsa. */
  assert.equal(
    eIncasata({ status: "shipped", payment_status: "refunded", payment_method: "cash_on_delivery" }),
    false,
  );
});

test("⚠ o metoda NECUNOSCUTA cade pe drumul prudent", () => {
  /*
   * ⚠ Se tine o multime de metode „la usa", nu regula „orice nu e card". Un furnizor
   * nou, necunoscut, trebuie sa iasa „neincasat" pana se dovedeste — nu sa fie declarat
   * incasat fiindca nu l-am recunoscut. Cifra prea mica se observa si se intreaba;
   * cifra prea mare se crede.
   */
  assert.equal(eIncasata({ status: "delivered", payment_status: "unpaid", payment_method: "metoda-noua" }), false);
  assert.equal(eIncasata({ status: "delivered", payment_status: null, payment_method: null }), false);
});

test("cele trei scrieri ale rambursului sunt toate cunoscute", () => {
  for (const m of ["cash_on_delivery", "cod", "ramburs"]) {
    assert.equal(eIncasata({ status: "delivered", payment_status: "unpaid", payment_method: m }), true, m);
  }
});

/* ── Desfacerea comenzilor ──────────────────────────────────────────────── */

test("⚠ numarul si suma nu mai vorbesc despre multimi diferite", () => {
  /*
   * In lista scria „5 comenzi · 1.240 lei cheltuit", dar cele cinci puteau cuprinde
   * doua anulate, pe cand suma le scotea. Acum se arata amandoua cifrele.
   */
  const d = desfaComenzile([
    { status: "delivered" }, { status: "shipped" }, { status: "pending" },
    { status: "cancelled" }, { status: "refunded" },
  ]);
  assert.deepEqual(d, { total: 5, valide: 3, anulate: 1, rambursate: 1 });
});

test("desfacerea se aduna la total, oricare ar fi starile", () => {
  const d = desfaComenzile([{ status: "cancelled" }, { status: "cancelled" }, { status: "delivered" }]);
  assert.equal(d.valide + d.anulate + d.rambursate, d.total);
});

test("fara comenzi, toate cifrele sunt zero", () => {
  assert.deepEqual(desfaComenzile([]), { total: 0, valide: 0, anulate: 0, rambursate: 0 });
});
