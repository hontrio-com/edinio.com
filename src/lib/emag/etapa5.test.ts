import { strict as assert } from "node:assert";
import { test } from "node:test";
import { alegereaCurierului, contPotrivit, primulAwb } from "./awb";
import { trecerePermisa, treceriPosibile } from "./rma";
import { citesteTinta } from "./campanii";
import type { EmagContCurier } from "./types";

/*
 * Probele etapei 5: AWB, retururi, campanii.
 *
 * Fiecare din ele pazeste un fel de a face rau cu bani: un transport platit de doua
 * ori, o marfa ramasa la client, un pret coborat degeaba.
 */

/* ── Conturile de curier ───────────────────────────────────────────────────── */

test("eMAG AWB: lista goala si lista lipsa NU inseamna acelasi lucru", () => {
  /*
   * `enforced_vendor_courier_accounts` din comanda:
   *   `null`      -> oricare cont
   *   ne-goala    -> numai cele din ea
   *   GOALA       -> ⚠ niciun cont ingaduit; nu se poate emite AWB de marketplace
   *
   * Al treilea e cel citit gresit. Tratat ca „oricare", am fi trimis un cont si am fi
   * primit un refuz pe care nimeni nu l-ar fi legat de cauza.
   */
  assert.deepEqual(alegereaCurierului(null), { fel: "oricare" });
  assert.deepEqual(alegereaCurierului(undefined), { fel: "oricare" });
  assert.deepEqual(alegereaCurierului([]), { fel: "imposibil" });
  assert.deepEqual(alegereaCurierului([7]), { fel: "din_lista", conturi: [7] });
});

const CONTURI: EmagContCurier[] = [
  { account_id: 1, courier_name: "Numai retur", courier_account_type: 1, status: 1 },
  { account_id: 2, courier_name: "Numai comenzi", courier_account_type: 2, status: 1 },
  { account_id: 3, courier_name: "Amandoua", courier_account_type: 3, status: 1 },
  { account_id: 4, courier_name: "Oprit", courier_account_type: 3, status: 0 },
];

test("eMAG AWB: un cont de retur nu se foloseste la o livrare", () => {
  /*
   * ⚠ 1 = RMA, 2 = Order, 3 = amandoua, 4 = non-marketplace. Un cont de tip 1 trimis
   * pentru livrarea unei comenzi e refuzat, iar mesajul lor vorbeste despre cont, nu
   * despre tip — comerciantul ar fi cautat greseala in alta parte.
   */
  assert.equal(contPotrivit(CONTURI, 1, { fel: "oricare" }), 2, "livrare: tip 2 sau 3");
  assert.equal(contPotrivit(CONTURI, 2, { fel: "oricare" }), 1, "retur: tip 1 sau 3");
});

test("eMAG AWB: un cont OPRIT arata la fel ca unul activ si nu se foloseste", () => {
  assert.equal(contPotrivit([CONTURI[3]], 1, { fel: "oricare" }), null);
});

test("eMAG AWB: lista impusa de comanda bate preferinta comerciantului", () => {
  /* eMAG refuza orice cont din afara listei. Preferinta din setari nu are cum s-o
     invinga, si incercarea ar fi iesit cu un refuz la fiecare comanda. */
  assert.equal(contPotrivit(CONTURI, 1, { fel: "din_lista", conturi: [3] }, 2), 3);
  assert.equal(contPotrivit(CONTURI, 1, { fel: "din_lista", conturi: [3] }), 3);
});

test("eMAG AWB: preferinta se respecta cand chiar e ingaduita", () => {
  assert.equal(contPotrivit(CONTURI, 1, { fel: "oricare" }, 3), 3);
});

test("eMAG AWB: cand nu e ingaduit niciun cont, nu se alege unul la intamplare", () => {
  assert.equal(contPotrivit(CONTURI, 1, { fel: "imposibil" }), null);
  assert.equal(contPotrivit(CONTURI, 1, { fel: "din_lista", conturi: [99] }), null);
});

/* ── Raspunsul la emitere ──────────────────────────────────────────────────── */

test("eMAG AWB: id-ul se citeste si din tabloul `awb`, si de la nivelul de sus", () => {
  /*
   * ⚠ Forma nu e in schema, doar in proza: „an `awb` array (with `emag_id`,
   * `awb_number`, `awb_barcode`)". Citita pe o singura forma, id-ul ar fi iesit
   * `null` — iar `/awb/read` NU are filtru pe comanda, deci AWB-ul s-ar fi pierdut
   * pe veci si coletul ar fi plecat fara urma in Edinio.
   */
  assert.deepEqual(primulAwb([{ awb: [{ emag_id: 55, awb_number: "1Z999" }] }]), { emagId: 55, numar: "1Z999" });
  assert.deepEqual(primulAwb({ emag_id: 7, awb_number: "AB1" }), { emagId: 7, numar: "AB1" });
  assert.deepEqual(primulAwb([{ awb: [{ emag_id: 9, awb_barcode: "BC2" }] }]), { emagId: 9, numar: "BC2" });
});

test("eMAG AWB: un raspuns fara id da `null`, NU un numar inventat", () => {
  /* Un id inventat ar fi fost scris in `emag_awb` si ar fi aratat ca AWB-ul e
     regasibil. Nu e: `/awb/read` l-ar fi cautat si n-ar fi gasit nimic. */
  assert.deepEqual(primulAwb({}), { emagId: null, numar: null });
  assert.deepEqual(primulAwb(null), { emagId: null, numar: null });
  assert.deepEqual(primulAwb([{ awb: [{ awb_number: "fara id" }] }]), { emagId: null, numar: null });
});

/* ── Retururile ────────────────────────────────────────────────────────────── */

test("eMAG retur: tabelul de treceri din documentatie se respecta intocmai", () => {
  /* 2 Nou · 3 Confirmat · 4 Respins · 5 Anulat · 6 Primit · 7 Finalizat */
  assert.equal(trecerePermisa(2, 3), true, "nou -> confirmat");
  assert.equal(trecerePermisa(2, 5), true, "nou -> anulat");
  assert.equal(trecerePermisa(2, 4), false, "nou -> respins NU se poate");
  assert.equal(trecerePermisa(3, 6), true, "confirmat -> primit");
  assert.equal(trecerePermisa(6, 7), true, "primit -> finalizat");
  assert.equal(trecerePermisa(6, 4), true, "primit -> respins");
  assert.equal(trecerePermisa(7, 6), false, "finalizat e terminal");
  assert.equal(trecerePermisa(5, 3), false, "anulat e terminal");
});

test("eMAG retur: o stare NECUNOSCUTA nu ingaduie nimic", () => {
  /*
   * Documentatia: „Some statuses were left out by design; these should not be used in
   * any seller implementation." Presupuse permisive, am fi construit butoane pentru
   * stari despre care ei ne-au spus limpede sa nu ne atingem.
   */
  assert.equal(trecerePermisa(1, 3), false);
  assert.equal(trecerePermisa(99, 3), false);
  assert.equal(trecerePermisa(null, 3), false);
  assert.deepEqual(treceriPosibile(99), []);
});

test("eMAG retur: butoanele aratate sunt exact trecerile posibile, fara starea de acum", () => {
  assert.deepEqual(treceriPosibile(2), [3, 5]);
  assert.deepEqual(treceriPosibile(6), [4, 7]);
  assert.deepEqual(treceriPosibile(7), [], "terminal: niciun buton");
});

/* ── Smart Deals ───────────────────────────────────────────────────────────── */

test("eMAG campanii: pretul-tinta necunoscut da `null`, NU zero", () => {
  /*
   * ═══ CEA MAI SCUMPA GRESEALA POSIBILA AICI ═══
   *
   * Forma raspunsului nu e in schema, doar in proza. Un zero inventat ar fi aratat
   * comerciantului ca insigna Smart Deals se ia la pret zero — sau, si mai rau, un
   * numar ghicit gresit l-ar fi facut sa coboare pretul degeaba: n-ar fi primit
   * insigna si ar fi vandut mai ieftin pe degeaba.
   */
  assert.equal(citesteTinta({}), null);
  assert.equal(citesteTinta(null), null);
  assert.equal(citesteTinta({ altceva: 5 }), null);
  assert.equal(citesteTinta("nu e un pret"), null);
});

test("eMAG campanii: pretul-tinta se citeste din formele plauzibile", () => {
  assert.equal(citesteTinta(49.9), 49.9);
  assert.equal(citesteTinta({ target_price: 49.9 }), 49.9);
  assert.equal(citesteTinta([{ target_price: "49,90" }]), 49.9, "ei trimit numere si ca text");
  assert.equal(citesteTinta({ smart_deals_price: "100" }), 100);
});
