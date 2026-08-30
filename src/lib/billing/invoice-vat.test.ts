import assert from "node:assert/strict";
import { test } from "node:test";
import { cereNumeleCotei, invoiceVat, numeCota } from "./invoice-vat";

/**
 * Aceeasi intrebare — ce cota poarta factura — avea trei raspunsuri, cate unul pe
 * casa de facturare. Doar SmartBill se uita la comanda; Oblio lua un numar din
 * propria configurare, iar fGO setarile magazinului citite AZI.
 */

const BRUT = { vat_enabled: true, vat_rate: 21, prices_include_vat: true };
const NET = { vat_enabled: true, vat_rate: 21, prices_include_vat: false };

test("cota se ia de pe COMANDA, nu din setarile de azi", () => {
  // Cazul care se va intampla: magazinul a trecut de la 19 la 21, iar o comanda
  // veche se factureaza acum. Ea a fost incasata cu 19, deci 19 scrie pe factura.
  assert.deepEqual(invoiceVat({ vat_rate: 19 }, BRUT), { rate: 19, taxIncluded: true, fallback: false });
  assert.deepEqual(invoiceVat({ vat_rate: 21 }, BRUT), { rate: 21, taxIncluded: true, fallback: false });
  // Cota redusa, ceruta de interfata ca presetare.
  assert.equal(invoiceVat({ vat_rate: 9 }, BRUT).rate, 9);
});

test("comanda de dinainte de TVA se factureaza cu cota magazinului, pe sumele platite", () => {
  // Cele 39 de comenzi din productie cu vat_rate 0 la magazine care au pornit
  // TVA-ul intre timp: 36 sunt deja facturate asa.
  assert.deepEqual(invoiceVat({ vat_rate: 0 }, BRUT), { rate: 21, taxIncluded: true, fallback: true });
});

test("rezerva forteaza regimul cu TVA inclus — aici era toata diferenta", () => {
  // La un magazin cu preturi NETE, o comanda veche pretuita fara TVA ar fi primit
  // TVA PESTE sumele incasate: 545 lei facturati ca 659,45. SmartBill avea regula,
  // Oblio si fGO nu — si niciunul din cei doi nu se uita macar la comanda.
  assert.deepEqual(invoiceVat({ vat_rate: 0 }, NET), { rate: 21, taxIncluded: true, fallback: true });
  // Cu cota proprie, aceeasi comanda ramane pe regimul magazinului.
  assert.equal(invoiceVat({ vat_rate: 21 }, NET).taxIncluded, false);
});

test("magazinul neplatitor nu capata TVA din nicio rezerva", () => {
  const neplatitor = { vat_enabled: false, vat_rate: 21, prices_include_vat: true };
  assert.deepEqual(invoiceVat({ vat_rate: 21 }, neplatitor), { rate: 0, taxIncluded: true, fallback: false });
  assert.deepEqual(invoiceVat({ vat_rate: 0 }, neplatitor), { rate: 0, taxIncluded: true, fallback: false });
});

test("casa de facturare fara identitate fiscala configurata emite fara TVA", () => {
  // SmartBill fara numele cotei, Oblio fara `vat_name`: comerciantul n-a terminat
  // configurarea, deci nu se inventeaza o cota in locul lui.
  assert.equal(invoiceVat({ vat_rate: 21 }, BRUT, false).rate, 0);
});

test("magazin platitor fara cota completata: factura fara TVA, nu 19 din senin", () => {
  const faraCota = { vat_enabled: true, vat_rate: 0, prices_include_vat: true };
  assert.equal(invoiceVat({ vat_rate: 0 }, faraCota).rate, 0);
  assert.equal(invoiceVat({ vat_rate: 0 }, faraCota).fallback, false);
});

test("cotele venite ca sir din baza sunt tot numere", () => {
  // Garda, nu incident dovedit: `numeric` din Postgres poate ajunge ca sir, iar
  // fGO nu trecea cota prin `Number()` nicaieri pe drumul ei catre `CotaTVA`.
  assert.equal(invoiceVat({ vat_rate: "19.00" }, BRUT).rate, 19);
  assert.equal(invoiceVat({ vat_rate: null }, { ...BRUT, vat_rate: "21.00" }).rate, 21);
  assert.equal(invoiceVat({}, BRUT).rate, 21);
});

/* ─── Numele cotei ────────────────────────────────────────────────────────── */

/**
 * SmartBill si Oblio cer NUMELE cotei, nu procentul, iar comerciantul alege o
 * PERECHE nume+procent din nomenclatorul contului. Cand cota facturii nu mai e
 * cea aleasa atunci, numele configurat descrie alt procent decat cel trimis.
 */

const COTE = [{ name: "Normala", percentage: 21 }, { name: "Redusa", percentage: 9 }, { name: "SFDD", percentage: 0 }];

test("numele configurat se pastreaza cat timp descrie chiar cota trimisa", () => {
  assert.equal(numeCota(21, { name: "Normala", percentage: 21 }, COTE), "Normala");
});

test("cand cota difera, numele se cauta dupa PROCENT", () => {
  // Un magazin din productie si-a numit cota chiar dupa procent: pe o comanda
  // veche la 19 ar fi plecat numele acela langa procentul 19.
  assert.equal(numeCota(9, { name: "Normala", percentage: 21 }, COTE), "Redusa");
  assert.equal(numeCota(19, { name: "cota 21", percentage: 21 }, COTE), "cota 21",
    "fara o cota de 19 in cont, ramane numele configurat: mai bine aproximativ decat neemisa");
});

test("fara nomenclator, factura pleaca tot cu numele configurat", () => {
  assert.equal(numeCota(9, { name: "Normala", percentage: 21 }), "Normala");
  assert.equal(numeCota(9, { name: "Normala", percentage: 21 }, []), "Normala");
});

test("nomenclatorul se reciteste doar cand numele nu se mai potriveste", () => {
  // Un apel de retea in plus inseamna un mod de esec in plus pe un drum care azi
  // merge fara el: in productie configurarea Oblio e sincrona cu magazinul.
  assert.equal(cereNumeleCotei(21, 21), false);
  assert.equal(cereNumeleCotei(19, 21), true);
  assert.equal(cereNumeleCotei(0, 21), false, "factura fara TVA n-are nevoie de nume");
});
