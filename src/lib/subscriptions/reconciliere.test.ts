import assert from "node:assert/strict";
import { test } from "node:test";
import { alegeDeVerificat } from "./reconciliere";

const u = (id: string, cid: string | null = "cus_" + id) => ({ id, plan: "basic", stripe_customer_id: cid });
const m = (user_id: string, suspended_until: string | null = null) => ({ user_id, suspended_until });

test("un utilizator obisnuit, cu magazin nesuspendat, intra la verificare", () => {
  assert.deepEqual(alegeDeVerificat([u("a")], [m("a")]).map((x) => x.id), ["a"]);
});

test("fara `stripe_customer_id` nu se verifica — n-avem ce intreba", () => {
  assert.deepEqual(alegeDeVerificat([u("a", null)], [m("a")]), []);
});

test("fara niciun magazin nu se verifica — n-are ce sa fie suspendat", () => {
  assert.deepEqual(alegeDeVerificat([u("a")], []), []);
});

test("deja in gratie nu se re-verifica", () => {
  assert.deepEqual(alegeDeVerificat([u("a")], [m("a", "2026-09-01T00:00:00Z")]), []);
});

test("UN singur magazin suspendat il scoate pe tot userul", () => {
  /*
   * Purtarea de dinainte, pastrata anume. Daca s-ar cere ca TOATE magazinele sa
   * fie suspendate, un user cu doua magazine si unul singur suspendat ar fi
   * verificat la fiecare ora, la nesfarsit — si ar primi un al doilea drum la
   * Stripe pentru un cont despre care stim deja tot.
   */
  assert.deepEqual(alegeDeVerificat([u("a")], [m("a"), m("a", "2026-09-01T00:00:00Z")]), []);
});

test("magazinele altui user nu-l fac pe acesta verificabil", () => {
  // `areMagazin` se construieste din TOATE randurile primite; daca s-ar potrivi
  // gresit, un user fara magazin ar intra la verificare si ar putea fi suspendat.
  assert.deepEqual(alegeDeVerificat([u("a")], [m("b")]), []);
});

test("alege doar pe cine trebuie dintr-un amestec", () => {
  const useri = [u("bun"), u("gratie"), u("fara-magazin"), u("fara-client", null)];
  const magazine = [m("bun"), m("gratie", "2026-09-01T00:00:00Z"), m("fara-client")];
  assert.deepEqual(alegeDeVerificat(useri, magazine).map((x) => x.id), ["bun"]);
});

test("lista goala de utilizatori nu produce nimic", () => {
  assert.deepEqual(alegeDeVerificat([], [m("a")]), []);
});
