import assert from "node:assert/strict";
import { test } from "node:test";
import { cuponulSePoateElibera, ORE_PANA_LA_ELIBERARE, type ComandaDeMaturat } from "./reguli";

/**
 * Maturatoarea da inapoi utilizari de cupon. Greseala in ambele sensuri costa:
 * prea larga, ia cuponul unei comenzi vii si comerciantul poate ramane cu o
 * campanie servita de doua ori; prea stramta, campania de 4 cupoane moare cu 4
 * clienti care s-au razgandit pe pagina bancii.
 *
 * Populatia reala din productie la 2026-08-04 (96 de comenzi) e reprodusa in
 * cazurile de mai jos: 38 ramburs expediate neplatite, 11 ramburs in pending,
 * 2 online neplatite in pending de peste 24 de ore.
 */

const ACUM = Date.parse("2026-08-04T12:00:00.000Z");
const ORE = (n: number) => new Date(ACUM - n * 3600_000).toISOString();

const ABANDONATA: ComandaDeMaturat = {
  payment_method: "stripe",
  payment_status: "unpaid",
  status: "pending",
  created_at: ORE(30),
  discount_code: "CADOU30",
};

test("plata online neincheiata, peste prag: utilizarea se da inapoi", () => {
  assert.equal(cuponulSePoateElibera(ABANDONATA, ACUM, ORE_PANA_LA_ELIBERARE), true);
});

test("netopia, ipay, klarna si revolut se poarta la fel ca stripe", () => {
  for (const metoda of ["netopia", "ipay", "klarna", "revolut"]) {
    assert.equal(cuponulSePoateElibera({ ...ABANDONATA, payment_method: metoda }, ACUM, ORE_PANA_LA_ELIBERARE), true, metoda);
  }
});

test("ramburs neplatit NU se atinge, oricat de veche ar fi comanda", () => {
  // 38 din cele 96 de comenzi din productie sunt exact asa: ramburs, expediate,
  // neplatite. Si cele 11 din pending sunt comenzi vii, care se platesc la usa.
  const ramburs: ComandaDeMaturat = { ...ABANDONATA, payment_method: "cash_on_delivery", created_at: ORE(24 * 30) };
  assert.equal(cuponulSePoateElibera(ramburs, ACUM, ORE_PANA_LA_ELIBERARE), false);
  assert.equal(cuponulSePoateElibera({ ...ramburs, status: "shipped" }, ACUM, ORE_PANA_LA_ELIBERARE), false);
});

test("sub prag nu se atinge nimic: plata poate inca sosi", () => {
  assert.equal(cuponulSePoateElibera({ ...ABANDONATA, created_at: ORE(23) }, ACUM, ORE_PANA_LA_ELIBERARE), false);
  assert.equal(cuponulSePoateElibera({ ...ABANDONATA, created_at: ORE(24) }, ACUM, ORE_PANA_LA_ELIBERARE), true);
});

test("comanda platita intre timp nu se mai atinge", () => {
  assert.equal(cuponulSePoateElibera({ ...ABANDONATA, payment_status: "paid" }, ACUM, ORE_PANA_LA_ELIBERARE), false);
  assert.equal(cuponulSePoateElibera({ ...ABANDONATA, payment_status: "refunded" }, ACUM, ORE_PANA_LA_ELIBERARE), false);
});

test("comanda pe care comerciantul a atins-o ramane a clientului", () => {
  // Neplatita dar expediata: comerciantul a hotarat ca vanzarea se face.
  for (const status of ["confirmed", "processing", "shipped", "delivered"]) {
    assert.equal(cuponulSePoateElibera({ ...ABANDONATA, status }, ACUM, ORE_PANA_LA_ELIBERARE), false, status);
  }
});

test("anulata sau returnata nu trece pe aici: o elibereaza panoul, nu cronul", () => {
  assert.equal(cuponulSePoateElibera({ ...ABANDONATA, status: "cancelled" }, ACUM, ORE_PANA_LA_ELIBERARE), false);
  assert.equal(cuponulSePoateElibera({ ...ABANDONATA, status: "refunded" }, ACUM, ORE_PANA_LA_ELIBERARE), false);
});

test("fara cod nu exista revendicare de dat inapoi", () => {
  assert.equal(cuponulSePoateElibera({ ...ABANDONATA, discount_code: null }, ACUM, ORE_PANA_LA_ELIBERARE), false);
  assert.equal(cuponulSePoateElibera({ ...ABANDONATA, discount_code: "" }, ACUM, ORE_PANA_LA_ELIBERARE), false);
});

test("metoda lipsa sau necunoscuta nu se elibereaza", () => {
  assert.equal(cuponulSePoateElibera({ ...ABANDONATA, payment_method: null }, ACUM, ORE_PANA_LA_ELIBERARE), false);
  assert.equal(cuponulSePoateElibera({ ...ABANDONATA, payment_method: "bank_transfer" }, ACUM, ORE_PANA_LA_ELIBERARE), false);
});

test("data invalida sau lipsa nu declanseaza eliberarea", () => {
  assert.equal(cuponulSePoateElibera({ ...ABANDONATA, created_at: null }, ACUM, ORE_PANA_LA_ELIBERARE), false);
  assert.equal(cuponulSePoateElibera({ ...ABANDONATA, created_at: "maine" }, ACUM, ORE_PANA_LA_ELIBERARE), false);
});
