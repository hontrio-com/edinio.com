import assert from "node:assert/strict";
import { test } from "node:test";
import { poateAvansaLaConfirmat } from "./order-progress";

/**
 * Confirmarea platii Stripe vine acum din trei locuri (intoarcerea clientului,
 * webhook si cronul de reconciliere), iar cronul se uita si la comenzi de acum
 * cateva zile. Regula asta e singurul lucru care opreste o plata confirmata
 * tarziu sa dea o comanda deja expediata inapoi la „confirmed".
 */

test("o comanda in asteptare avanseaza la confirmata", () => {
  assert.equal(poateAvansaLaConfirmat("pending"), true);
});

test("o comanda dusa deja mai departe de comerciant nu se da inapoi", () => {
  for (const status of ["confirmed", "shipped", "delivered", "cancelled", "refunded"]) {
    assert.equal(poateAvansaLaConfirmat(status), false, status);
  }
});

test("statusul lipsa nu avanseaza nimic", () => {
  assert.equal(poateAvansaLaConfirmat(null), false);
  assert.equal(poateAvansaLaConfirmat(undefined), false);
});
