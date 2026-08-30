import assert from "node:assert/strict";
import { test } from "node:test";
import { construiesteTrepte, pretPeTrepte } from "./quantity-tiers";

/**
 * Motorul asta e singurul loc care spune cat costa o linie cu trepte de cantitate:
 * il folosesc si pagina de produs, si cosul, si serverul la plasarea comenzii.
 * Cat timp au existat trei calcule separate, formularul bifa o treapta, afisa
 * pretul alteia si trimitea serverului pretul unei a treia: clientul vedea
 * pachetul de 2 la 170 lei si comanda pleca la 179,98.
 */

// Configuratia reala de pe ultimulmagazin.ro care a scos bug-ul la iveala.
const TREPTE = [
  { qty: 1, price: 89.99 },
  { qty: 2, price: 170 },
  { qty: 3, price: 250 },
];
const PRET_BAZA = 89.99;

const bani = (n: number) => Math.round(n * 100) / 100;

test("pretul unitar inmultit cu cantitatea da exact totalul afisat", () => {
  for (const cantitate of [1, 2, 3, 4, 5, 7, 12]) {
    const r = pretPeTrepte(TREPTE, cantitate, PRET_BAZA);
    assert.equal(bani(r.unitPrice * cantitate), bani(r.subtotal), `cantitatea ${cantitate}`);
  }
});

test("fiecare treapta isi da propriul pret de pachet", () => {
  assert.equal(pretPeTrepte(TREPTE, 2, PRET_BAZA).subtotal, 170);
  assert.equal(pretPeTrepte(TREPTE, 3, PRET_BAZA).subtotal, 250);
  assert.equal(pretPeTrepte(TREPTE, 2, PRET_BAZA).index, 1);
  assert.equal(pretPeTrepte(TREPTE, 3, PRET_BAZA).index, 2);
});

test("cantitatile intre trepte se acopera din pachete, nu la pret intreg", () => {
  // 4 = pachetul de 3 plus o bucata; 5 = pachetul de 3 plus cel de 2.
  assert.equal(pretPeTrepte(TREPTE, 4, PRET_BAZA).subtotal, bani(250 + 89.99));
  assert.equal(pretPeTrepte(TREPTE, 5, PRET_BAZA).subtotal, bani(250 + 170));
  assert.equal(pretPeTrepte(TREPTE, 6, PRET_BAZA).subtotal, bani(250 + 250));
});

test("nicio cantitate nu costa mai putin decat una mai mica", () => {
  let anterior = 0;
  for (let n = 1; n <= 30; n++) {
    const acum = pretPeTrepte(TREPTE, n, PRET_BAZA).subtotal;
    assert.ok(acum >= anterior, `${n} bucati costa ${acum}, mai putin decat ${n - 1} bucati la ${anterior}`);
    anterior = acum;
  }
});

test("pachetele pot doar sa ieftineasca, niciodata invers", () => {
  // Varianta mult mai ieftina decat pretul fix al pachetului: „reducerea" ar fi
  // costat mai mult decat lipsa ei.
  const r = pretPeTrepte([{ qty: 1, price: 20 }, { qty: 2, price: 170 }], 2, 20);
  assert.equal(r.subtotal, 40);
  assert.equal(r.savings, 0);
});

test("o cantitate fara trepte se plateste la pretul intreg, fara bifa", () => {
  const r = pretPeTrepte(undefined, 3, PRET_BAZA);
  assert.equal(r.index, -1);
  assert.equal(r.unitPrice, PRET_BAZA);
  assert.equal(bani(r.subtotal), 269.97);
});

test("lista goala de trepte nu bifeaza nimic", () => {
  assert.equal(pretPeTrepte([], 1, PRET_BAZA).index, -1);
  assert.equal(pretPeTrepte([], 0, PRET_BAZA).subtotal, 0);
});

test("treptele se construiesc identic pentru pret fix si pentru procent", () => {
  const fix = construiesteTrepte(
    { enabled: true, mode: "fixed", tier2_price: 170, tier3_price: 250, tier2_badge: "Cel mai bun pret!" },
    89.99,
  );
  assert.deepEqual(fix?.map((t) => [t.qty, t.price]), [[1, 89.99], [2, 170], [3, 250]]);
  assert.equal(fix?.[1].badge, "Cel mai bun pret!");

  const procent = construiesteTrepte({ enabled: true, mode: "percent", tier2_percent: 10, tier3_percent: 20 }, 100);
  assert.deepEqual(procent?.map((t) => [t.qty, t.price]), [[1, 100], [2, 180], [3, 240]]);
});

test("treptele oprite sau lipsa nu produc nimic", () => {
  assert.equal(construiesteTrepte({ enabled: false, tier2_price: 170 }, 89.99), undefined);
  assert.equal(construiesteTrepte(null, 89.99), undefined);
  // Activat, dar fara nicio treapta completata: ramane doar bucata simpla.
  assert.deepEqual(construiesteTrepte({ enabled: true, mode: "fixed" }, 50)?.map((t) => t.qty), [1]);
});

// ── Pachetul nu are voie sa fie mai ieftin decat o cantitate mai mica ────────

import { problemaMonotonie, mesajProblemaTrepte } from "./quantity-tiers";

/**
 * Cifrele sunt din productie. Comerciantii au citit „Pret total (lei)" ca pret
 * PE BUCATA, fiindca ajutorul de deasupra campului chiar asa scria — si atunci
 * trei camere ieseau 119 lei, iar una singura 149.
 */

test("configuratia buna nu semnaleaza nimic", () => {
  // mokka: 84,99 bucata, 170 pachetul de 2, 250 pachetul de 3.
  assert.equal(problemaMonotonie(construiesteTrepte(
    { enabled: true, mode: "fixed", tier2_price: 170, tier3_price: 250 }, 84.99)), null);
});

test("Camera Auto: 129 la doua bucati, cand una costa 149", () => {
  const p = problemaMonotonie(construiesteTrepte(
    { enabled: true, mode: "fixed", tier2_price: 129, tier3_price: 119 }, 149));
  assert.ok(p);
  assert.equal(p.qty, 2);
  assert.equal(p.pretPachet, 129);
  assert.equal(p.minimAcceptat, 149);
  assert.match(mesajProblemaTrepte(p), /pretul TOTAL al pachetului/);
});

test("Aspiratorul: procente scrise in campul de lei", () => {
  const p = problemaMonotonie(construiesteTrepte(
    { enabled: true, mode: "fixed", tier2_price: 10, tier3_price: 15 }, 119));
  assert.ok(p);
  assert.equal(p.qty, 2);
  assert.equal(p.pretPachet, 10);
});

test("procent peste 50 la doua bucati e tot o ruptura", () => {
  // royal-aoleu: 59,99 lei, 80% la doua bucati -> 24,00 pentru doua.
  const p = problemaMonotonie(construiesteTrepte(
    { enabled: true, mode: "percent", tier2_percent: 80, tier3_percent: 40 }, 59.99));
  assert.ok(p);
  assert.equal(p.qty, 2);
  assert.equal(p.pretPachet, 24);
});

test("procente CRESCATOARE pot rupe si ele: conteaza totalurile, nu procentele", () => {
  // Guess CONNOISSEUR: 70 lei, 30% la doua (98,00) si 60% la trei (84,00).
  const p = problemaMonotonie(construiesteTrepte(
    { enabled: true, mode: "percent", tier2_percent: 30, tier3_percent: 60 }, 70));
  assert.ok(p, "procentul creste, dar pachetul de 3 cade sub cel de 2");
  assert.equal(p.qty, 3);
  assert.equal(p.pretPachet, 84);
  assert.equal(p.minimAcceptat, 98);
});

test("treapta de 2 lipsa: cea de 3 se compara cu doua bucati intregi", () => {
  // Fara treapta de 2, cost(2) = 2 x baza. Un pachet de 3 sub el e tot rupt.
  const p = problemaMonotonie(construiesteTrepte(
    { enabled: true, mode: "fixed", tier3_price: 110 }, 60));
  assert.ok(p);
  assert.equal(p.qty, 3);
  assert.equal(p.minimAcceptat, 120);
});

test("reducerea legitima ramane permisa, inclusiv la limita", () => {
  // 2 bucati exact cat una singura: nu creste, dar nici nu scade.
  assert.equal(problemaMonotonie(construiesteTrepte(
    { enabled: true, mode: "fixed", tier2_price: 50 }, 50)), null);
  // viofloris, cazuri reale la limita
  assert.equal(problemaMonotonie(construiesteTrepte(
    { enabled: true, mode: "fixed", tier2_price: 110 }, 55)), null);
  assert.equal(problemaMonotonie(construiesteTrepte(
    { enabled: true, mode: "fixed", tier3_price: 70 }, 34.99)), null);
});

test("treptele stinse sau lipsa nu semnaleaza nimic", () => {
  assert.equal(problemaMonotonie(undefined), null);
  assert.equal(problemaMonotonie(construiesteTrepte({ enabled: false, tier2_price: 1 }, 50)), null);
  assert.equal(problemaMonotonie(construiesteTrepte({ enabled: true, mode: "fixed" }, 50)), null);
});
