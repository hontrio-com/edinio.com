import { strict as assert } from "node:assert";
import { test } from "node:test";
import { alegereaCurierului, contPotrivit, primulAwb, monedaPentruAwb} from "./awb";
import { dimensiuniPropuse } from "./colete";
import { poateAwbRetur, trecerePermisa, treceriPosibile, incarcaturaRetur, CAMPURI_CERUTE_LA_RETUR} from "./rma";
import { citesteTinta } from "./campanii";
import {
  cePiedicaAreCampania, pregatestePropunerile, REDUCERE_MAXIMA, REDUCERE_MINIMA,
} from "./propuneri";
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

/* ── §53. AWB-ul de ridicare la retur ───────────────────────────── */

const RIDICARE_BUNA = {
  pickupMethod: 2, stare: 3, awbs: [], emagOrderId: 12345,
  pickupLocalityId: 176, localitateComanda: 176, areStrada: true,
};

test("eMAG retur AWB: cazul bun trece", () => {
  const r = poateAwbRetur(RIDICARE_BUNA);
  assert.deepEqual(r, { se_poate: true, emagOrderId: 12345 });
});

test("eMAG retur AWB: curierul EMAG — nu emitem noi nimic", () => {
  /*
   * ═══ CEA MAI SCUMPA VERIFICARE DIN TOATA FUNCTIA ═══
   *
   * `pickup_method`: 1 = curier eMAG, 2 = curierul vanzatorului, 3 = trimis de client.
   *
   * La 1 si la 3, transportul e DEJA rezolvat. Un AWB emis de noi ar fi un AL DOILEA
   * curier, platit, trimis dupa un colet care nu mai e acolo. Butonul aratat unde nu
   * trebuie nu greseste un ecran — greseste o factura.
   */
  const r = poateAwbRetur({ ...RIDICARE_BUNA, pickupMethod: 1 });
  assert.equal(r.se_poate, false);
  assert.match(r.se_poate === false ? r.motiv : "", /curierul eMAG/i);
});

test("eMAG retur AWB: clientul trimite singur — nu e nevoie de AWB", () => {
  const r = poateAwbRetur({ ...RIDICARE_BUNA, pickupMethod: 3 });
  assert.equal(r.se_poate, false);
  assert.match(r.se_poate === false ? r.motiv : "", /trimite el/i);
});

test("eMAG retur AWB: o metoda NECUNOSCUTA nu inseamna «mergi inainte»", () => {
  /* ⚠ eMAG poate adauga metode. Presupusa permisiva, prima metoda noua ar fi insemnat
     curieri platiti degeaba, la fiecare retur, pana ar fi observat cineva factura. */
  for (const m of [0, 4, 99, null, undefined]) {
    assert.equal(poateAwbRetur({ ...RIDICARE_BUNA, pickupMethod: m }).se_poate, false, `metoda ${m}`);
  }
});

test("eMAG retur AWB: un AWB deja emis nu se emite a doua oara", () => {
  /* Al doilea curier vine si se plateste. `cuRegistru` apara si el, dar DUPA apasare;
     aici nici nu se ofera. */
  const r = poateAwbRetur({ ...RIDICARE_BUNA, awbs: [{ reservation_id: 7 }] });
  assert.equal(r.se_poate, false);
  assert.match(r.se_poate === false ? r.motiv : "", /deja/i);
});

test("eMAG retur AWB: numai din starea CONFIRMAT", () => {
  /*
   * Drumul lor: Nou (2) → Confirmat (3) → Primit (6). Un curier chemat pe un retur
   * neconfirmat pleaca dupa marfa pe care poate nici n-o accepti; pe unul deja primit,
   * pleaca dupa un colet care e la tine in depozit.
   */
  assert.equal(poateAwbRetur({ ...RIDICARE_BUNA, stare: 3 }).se_poate, true);
  const nou = poateAwbRetur({ ...RIDICARE_BUNA, stare: 2 });
  assert.equal(nou.se_poate, false);
  assert.match(nou.se_poate === false ? nou.motiv : "", /Confirma intai|Confirmă întâi/i);
  for (const st of [4, 5, 6, 7, null]) {
    assert.equal(poateAwbRetur({ ...RIDICARE_BUNA, stare: st }).se_poate, false, `starea ${st}`);
  }
});

test("eMAG retur AWB: fara comanda legata nu se poate — `order_id` le e obligatoriu", () => {
  /* `AWBSave.required` cuprinde `order_id` CHIAR SI la retururi. */
  assert.equal(poateAwbRetur({ ...RIDICARE_BUNA, emagOrderId: null }).se_poate, false);
  assert.equal(poateAwbRetur({ ...RIDICARE_BUNA, emagOrderId: 0 }).se_poate, false);
});

test("eMAG retur AWB: alta LOCALITATE de ridicare — nu se lipeste o adresa care nu exista", () => {
  /*
   * ═══ ⚠ ADRESA DE RIDICARE POATE FI ALTA DECAT CEA DE LIVRARE ═══
   *
   * Returul poarta `pickup_locality_id`. Strada, in schimb, nu e nicaieri in retur:
   * singura pe care o avem e cea din comanda.
   *
   * Lipite, strada din orasul A cu localitatea B fac o adresa care nu exista — iar
   * curierul pleaca acolo si se plateste oricum.
   */
  const r = poateAwbRetur({ ...RIDICARE_BUNA, pickupLocalityId: 999 });
  assert.equal(r.se_poate, false);
  assert.match(r.se_poate === false ? r.motiv : "", /altă localitate|alta localitate/i);
});

test("eMAG retur AWB: localitatea necunoscuta nu blocheaza, dar strada lipsa da", () => {
  /* Cand una dintre localitati lipseste, nu se poate spune ca DIFERA — si atunci nu se
     inventeaza o piedica. Dar fara strada chiar n-avem ce trimite. */
  assert.equal(poateAwbRetur({ ...RIDICARE_BUNA, pickupLocalityId: null }).se_poate, true);
  assert.equal(poateAwbRetur({ ...RIDICARE_BUNA, areStrada: false }).se_poate, false);
});

/* ── §56, §57. Propunerea in campanie ────────────────────────────── */

const OFERTE = [
  { emagId: 1, pretNet: 100, stoc: 10 },
  { emagId: 2, pretNet: 50, stoc: 3 },
];

test("eMAG campanii: pretul de campanie se taie din cel FARA TVA", () => {
  const r = pregatestePropunerile(OFERTE, { campaignId: 77, reducere: 20 });
  assert.equal(r.propuneri[0].sale_price, 80);
  assert.equal(r.propuneri[1].sale_price, 40);
});

test("eMAG campanii: `post_campaign_sale_price` se trimite MEREU (§57)", () => {
  /*
   * ═══ CE SE INTAMPLA DACA NU-L TRIMITI ═══
   *
   * Schema lor: „The automatically filled price is the sale price of the product from
   * the moment when offers are DOWNLOADED."
   *
   * Adica eMAG pune el un pret — cel pe care il avea oferta cand si-au tras ei datele,
   * care poate fi de acum o luna. Dupa campanie, produsul s-ar fi intors la pretul ala
   * vechi, nu la cel de azi.
   *
   * Fara nicio eroare, si fara ca nimeni sa se uite a doua zi dupa terminarea unei
   * campanii. Se trimite anume pretul nostru de acum: e singurul pe care il stim sigur.
   */
  const r = pregatestePropunerile(OFERTE, { campaignId: 77, reducere: 20 });
  assert.equal(r.propuneri[0].post_campaign_sale_price, 100, "pretul de ACUM, nu cel taiat");
  assert.equal(r.propuneri[1].post_campaign_sale_price, 50);
});

test("eMAG campanii: o oferta FARA STOC nu se propune, si se spune de ce", () => {
  /* eMAG accepta stocul zero — e un numar valid — iar comerciantul ar fi vazut
     produsul in campanie si zero vanzari, fara sa inteleaga de ce. */
  const r = pregatestePropunerile([{ emagId: 9, pretNet: 100, stoc: 0 }], { campaignId: 77, reducere: 20 });
  assert.deepEqual(r.propuneri, []);
  assert.equal(r.sarite[0].motiv, "n-are stoc");
});

test("eMAG campanii: stocul propus nu poate fi mai mare decat cel real", () => {
  /* Un stoc maxim mai mare decat cel din depozit ar fi promis in campanie bucati care
     nu exista — iar anularile de campanie se numara la ei. */
  const r = pregatestePropunerile(OFERTE, { campaignId: 77, reducere: 20, stocMaxim: 100 });
  assert.equal(r.propuneri[0].stock, 10, "are doar 10");
  assert.equal(r.propuneri[1].stock, 3, "are doar 3");
});

test("eMAG campanii: stocul maxim taie cand e mai mic", () => {
  const r = pregatestePropunerile(OFERTE, { campaignId: 77, reducere: 20, stocMaxim: 2 });
  assert.equal(r.propuneri[0].stock, 2);
  assert.equal(r.propuneri[1].stock, 2);
});

test("eMAG campanii: o oferta fara pret nu se propune", () => {
  const r = pregatestePropunerile([{ emagId: 9, pretNet: 0, stoc: 5 }], { campaignId: 77, reducere: 20 });
  assert.deepEqual(r.propuneri, []);
  assert.equal(r.sarite[0].motiv, "n-are pret");
});

test("eMAG campanii: reducerea in afara limitelor LOR se opreste la noi", () => {
  /* ⚠ Mesajele lor vorbesc despre campuri; un `voucher_discount` de 5 ar fi intors
     ceva ce nu spune „minimul e 10". Se ridica aici, unde se poate spune de ce. */
  assert.equal(cePiedicaAreCampania({ campaignId: 77, reducere: REDUCERE_MINIMA }), null);
  assert.equal(cePiedicaAreCampania({ campaignId: 77, reducere: REDUCERE_MAXIMA }), null);
  assert.notEqual(cePiedicaAreCampania({ campaignId: 77, reducere: 5 }), null);
  assert.notEqual(cePiedicaAreCampania({ campaignId: 77, reducere: 101 }), null);
});

test("eMAG campanii: fara numarul campaniei nu se trimite nimic", () => {
  /* eMAG n-are nicio ruta care sa listeze campaniile — cautat in tot OpenAPI-ul lor.
     Numarul se ia din panoul lor, si se cere limpede. */
  assert.notEqual(cePiedicaAreCampania({ campaignId: 0, reducere: 20 }), null);
  assert.notEqual(cePiedicaAreCampania({ campaignId: Number.NaN, reducere: 20 }), null);
});

test("eMAG AWB: moneda se trimite doar cand e una pe care o accepta", () => {
  /*
   * ⚠ Enum-ul lor pentru `AWBSave.currency` e `RON | EUR | HUF`. E mai ingust decat
   * monedele in care vand: BGN lipseste cu totul, desi a fost moneda Bulgariei pana
   * pe 1 ianuarie 2026.
   *
   * Trimis oricum, ar fi fost un refuz pe un camp OPTIONAL — adica un AWB neemis
   * pentru o valoare care n-avea rost sa plece. Compilatorul a prins-o; proba o tine.
   */
  assert.equal(monedaPentruAwb("ro"), "RON");
  assert.equal(monedaPentruAwb("hu"), "HUF");
  assert.equal(monedaPentruAwb("bg"), "EUR", "din 2026 Bulgaria e pe EUR");
  assert.equal(monedaPentruAwb(undefined), undefined, "fara tara, se omite campul");
});

/* ── Incarcatura de retur, dupa auditul din 24.08.2026 ─────────────────────── */

const RETUR_INTREG = {
  emag_id: 900, order_id: 5001, type: 3, customer_name: "Ion Popescu",
  customer_phone: "0712345678", pickup_locality_id: 1234, pickup_method: 2,
  return_type: 3, return_reason: 21, date: "2026-08-20 10:00:00",
  products: [{ id: 1, product_id: 77, quantity: 1, product_name: "X", return_reason: 21 }],
};

test("eMAG retur: se trimite TOT returul, nu doar starea", () => {
  /*
   * ═══ CE TRIMITEAM, SI CE CER EI ═══
   *
   * Trimiteam `{ emag_id, request_status }`. `RMASave` cere ZECE campuri obligatorii:
   * `order_id`, `type`, `customer_name`, `customer_phone`, `pickup_locality_id`,
   * `pickup_method`, `return_type`, `return_reason`, `date`.
   *
   * Deci fiecare apasare de „Acceptă returul" pleca incompleta. Comerciantul vedea
   * starea schimbata la NOI si nimic schimbat la ei.
   *
   * ⚠ Regula era deja scrisa in casa, la `salveazaComenzi`: se trimit toate campurile
   * citite initial, nu doar cele schimbate. Nu fusese urmata si aici.
   */
  const r = incarcaturaRetur(RETUR_INTREG, 3);
  assert.equal(r.fel, "gata");
  if (r.fel !== "gata") return;
  for (const c of CAMPURI_CERUTE_LA_RETUR) {
    assert.ok(r.date[c] !== undefined, `lipseste ${c}`);
  }
  assert.equal(r.date.request_status, 3, "starea ceruta");
  assert.deepEqual(r.date.products, RETUR_INTREG.products, "liniile raman");
});

test("eMAG retur: cand lipseste un camp cerut, se OPRESTE inainte de eMAG", () => {
  /* ⚠ Trimisa oricum, cererea s-ar fi intors cu un mesaj despre un camp, iar omul
     n-avea de unde sa stie ca lipsa vine din ce ne-au trimis EI la citire. */
  const fara: Record<string, unknown> = { ...RETUR_INTREG };
  delete fara.pickup_locality_id;
  const r = incarcaturaRetur(fara, 3);
  assert.equal(r.fel, "lipsesc");
  if (r.fel !== "lipsesc") return;
  assert.deepEqual(r.campuri, ["pickup_locality_id"]);
});

test("eMAG retur: un `raw` gol nu produce o cerere goala", () => {
  for (const gol of [null, undefined, {}, "text", 7]) {
    const r = incarcaturaRetur(gol, 3);
    assert.equal(r.fel, "lipsesc", `${JSON.stringify(gol)} trebuie oprit`);
  }
});
