import { strict as assert } from "node:assert";
import { test } from "node:test";
import { alegereaCurierului, contPotrivit, primulAwb } from "./awb";
import { dimensiuniPropuse } from "./colete";
import { trecerePermisa, treceriPosibile } from "./rma";
import { citesteTinta } from "./campanii";
import { ceUrmeazaLaRetur, EMAG_TIP_RETUR, type EmagContCurier } from "./types";

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

/* ── §51/§52. Ce a cerut clientul, si ce urmeaza ───────────────────────────── */

test("eMAG retur: `5` e VOUCHER, nu «altul»", () => {
  /*
   * ═══ COMENTARIU DE-AL MEU CARE MINTEA ═══
   *
   * `EmagRetur.return_type` avea scris „5 = altul". Documentatia lor enumera limpede:
   * „5 = Voucher".
   *
   * Deosebirea costa: la voucher NU se intorc bani. Un ecran care ar fi scris
   * „rambursare" l-ar fi pus pe comerciant sa caute un IBAN care nu exista, si sa
   * creada ca eMAG a uitat sa i-l trimita.
   */
  assert.equal(EMAG_TIP_RETUR[5], "Voucher");
  assert.equal(EMAG_TIP_RETUR[3], "Rambursare");
  assert.equal(EMAG_TIP_RETUR[1], "Înlocuire cu același produs");
});

test("eMAG retur: la voucher se spune limpede ca NU se intorc bani", () => {
  assert.match(ceUrmeazaLaRetur(5) ?? "", /nu întorci bani/i);
  assert.match(ceUrmeazaLaRetur(3) ?? "", /banii/i);
  assert.match(ceUrmeazaLaRetur(1) ?? "", /schimb/i);
});

test("eMAG retur: un tip NECUNOSCUT nu arata ca «nimic de facut»", () => {
  /*
   * ⚠ `null` inseamna „nu stiu", si nu se ascunde sub un „nu". Un tip nou la ei, sau
   * lipsa cu totul, aratat ca „nu e nimic de facut" l-ar fi pus pe om sa inchida
   * returul crezand ca s-a rezolvat.
   */
  assert.equal(ceUrmeazaLaRetur(99), null);
  assert.equal(ceUrmeazaLaRetur(null), null);
  assert.equal(ceUrmeazaLaRetur(undefined), null);
});

/* ── §47. Dimensiunile propuse din catalog ─────────────────────────── */

const CATALOG = new Map([
  ["p1", { length: 30, width: 20, height: 10 }],
  ["fara", { length: 30, width: null, height: 10 }],
  /* ⚠ FORMA REALA DIN PRODUCTIE, masurata pe 24.08.2026: produsele nou create au
     `dimensions: {width: 0, height: 0, length: 0}` — ZEROURI, nu campuri lipsa. */
  ["zerouri", { length: 0, width: 0, height: 0 }],
]);

test("eMAG colete: un singur produs, o bucata, cu toate laturile — se propune", () => {
  const r = dimensiuniPropuse([{ productId: "p1", cantitate: 1 }], CATALOG);
  assert.deepEqual(r, { fel: "din_catalog", dimensiuni: { length: 30, width: 20, height: 10 } });
});

test("eMAG colete: MAI MULTE produse — nu se propune nimic, si se spune de ce", () => {
  /*
   * ═══ GREUTATILE SE ADUNA. DIMENSIUNILE NU. ═══
   *
   * Doua cutii de 30×20×10 nu fac una de 60×40×20, si nici una de 30×20×20 — depinde
   * cum le asezi, si nimeni de aici nu stie asta.
   *
   * O propunere calculata din maximul fiecarei laturi ar fi aratat exact ca o
   * masuratoare adevarata si ar fi fost gresita. La eMAG dimensiunile intra in
   * greutatea VOLUMETRICA: curierul cantareste la depozit, gaseste altceva, si
   * refactureaza. Chiar raul pentru care s-au scos cele 20×15×10 scrise in cod.
   */
  const r = dimensiuniPropuse(
    [{ productId: "p1", cantitate: 1 }, { productId: "p1", cantitate: 1 }], CATALOG);
  assert.equal(r.fel, "nu_se_stie");
  assert.match(r.fel === "nu_se_stie" ? r.motiv : "", /mai multe produse/i);
});

test("eMAG colete: mai multe BUCATI din acelasi produs — tot nu se stie cutia", () => {
  const r = dimensiuniPropuse([{ productId: "p1", cantitate: 3 }], CATALOG);
  assert.equal(r.fel, "nu_se_stie");
  assert.match(r.fel === "nu_se_stie" ? r.motiv : "", /3 bucati/i);
});

test("eMAG colete: laturi incomplete in catalog — NICIUNA nu se propune", () => {
  /* ⚠ Toate trei sau niciuna. Completate pe jumatate, campurile ar fi aratat pline si
     omul ar fi crezut ca a terminat — iar `coleteDeTrimis` cere oricum toate trei. */
  const r = dimensiuniPropuse([{ productId: "fara", cantitate: 1 }], CATALOG);
  assert.equal(r.fel, "nu_se_stie");
  assert.match(r.fel === "nu_se_stie" ? r.motiv : "", /dimensiunile completate/i);
});

test("eMAG colete: produs care nu e in catalog — nu se ghiceste", () => {
  const r = dimensiuniPropuse([{ productId: "necunoscut", cantitate: 1 }], CATALOG);
  assert.equal(r.fel, "nu_se_stie");
});

test("eMAG colete: linii fara produs se sar, nu numara ca «mai multe produse»", () => {
  /* O linie de transport sau o reducere n-are `productId`. Numarata, ar fi facut orice
     comanda cu un singur produs sa para cu doua — si propunerea n-ar fi aparut niciodata. */
  const r = dimensiuniPropuse(
    [{ productId: null, cantitate: 1 }, { productId: "p1", cantitate: 1 }], CATALOG);
  assert.equal(r.fel, "din_catalog");
});

test("eMAG colete: dimensiuni ZERO in catalog nu sunt dimensiuni", () => {
  /*
   * ═══ FORMA REALA DIN PRODUCTIE, NU UNA INCHIPUITA ═══
   *
   * Masurat pe 24.08.2026: produsele au `dimensions: {width: 0, height: 0, length: 0}`
   * de la crearea fisei. Nu lipsesc campurile — sunt acolo, cu zero.
   *
   * O verificare doar pe „exista campul" ar fi propus un colet de 0×0×0. eMAG l-ar fi
   * primit, greutatea volumetrica ar fi iesit zero, iar curierul ar fi refacturat
   * dupa ce masoara la depozit — exact raul pentru care exista functia asta.
   */
  const r = dimensiuniPropuse([{ productId: "zerouri", cantitate: 1 }], CATALOG);
  assert.equal(r.fel, "nu_se_stie");
});
