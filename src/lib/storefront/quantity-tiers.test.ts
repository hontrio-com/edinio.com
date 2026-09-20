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
const PACHETE = [
  { qty: 1, price: 89.99 },
  { qty: 2, price: 170 },
  { qty: 3, price: 250 },
];
/* ⚠ Motorul primeste de la rebranding-ul din 20.09.2026 o forma cu DOUA feluri
   de reduceri: pachete de marime fixa si praguri pe cantitate. Probele de mai
   jos apara pachetele; cele de praguri sunt la sfarsitul fisierului. */
const TREPTE = { pachete: PACHETE, praguri: [] };
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
  const r = pretPeTrepte({ pachete: [{ qty: 1, price: 20 }, { qty: 2, price: 170 }], praguri: [] }, 2, 20);
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
  assert.equal(pretPeTrepte({ pachete: [], praguri: [] }, 1, PRET_BAZA).index, -1);
  assert.equal(pretPeTrepte({ pachete: [], praguri: [] }, 0, PRET_BAZA).subtotal, 0);
});

test("treptele se construiesc identic pentru pret fix si pentru procent", () => {
  const fix = construiesteTrepte(
    { enabled: true, mode: "fixed", tier2_price: 170, tier3_price: 250, tier2_badge: "Cel mai bun pret!" },
    89.99,
  );
  assert.deepEqual(fix?.pachete.map((t) => [t.qty, t.price]), [[1, 89.99], [2, 170], [3, 250]]);
  assert.equal(fix?.pachete[1].badge, "Cel mai bun pret!");

  const procent = construiesteTrepte({ enabled: true, mode: "percent", tier2_percent: 10, tier3_percent: 20 }, 100);
  assert.deepEqual(procent?.pachete.map((t) => [t.qty, t.price]), [[1, 100], [2, 180], [3, 240]]);
});

test("treptele oprite sau lipsa nu produc nimic", () => {
  assert.equal(construiesteTrepte({ enabled: false, tier2_price: 170 }, 89.99), undefined);
  assert.equal(construiesteTrepte(null, 89.99), undefined);
  /* ⚠ Activat, dar fara NICIO treapta completata: nu mai intoarce „doar bucata
     simpla", ci `undefined`. O configuratie goala nu e o reducere, iar forma
     noua o spune limpede - altfel fiecare loc ar fi trebuit sa stie ca un
     tablou de un singur element inseamna „nimic". */
  assert.equal(construiesteTrepte({ enabled: true, mode: "fixed" }, 50), undefined);
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

/*
  ═══════════════════════════════════════════════════════════════════════════════
  PRAGURILE DE CANTITATE (20.09.2026)
  ═══════════════════════════════════════════════════════════════════════════════

  Alta mecanica decat pachetele, si de-aia au probele lor: pachetul de 5 duce
  reducerea doar pe cele 5 bucati acoperite de el, pragul de 5 o duce pe TOATA
  cantitatea. Cerere de la proprietar: „peste 5 buc - 3%, peste 10 buc - 10%".
*/

const CU_PRAGURI = { enabled: true, praguri: [{ min_qty: 5, percent: 3 }, { min_qty: 10, percent: 10 }] };

test("pragul se aplica pe TOATA cantitatea, nu doar pe pachetul complet", () => {
  const t = construiesteTrepte(CU_PRAGURI, 100);
  /* Cifrele din tabelul aratat proprietarului: 7 bucati la 100 lei, cu pragul
     de 3%, dau 679 - nu 685, cat ar fi iesit din pachete (5 reduse + 2 intregi). */
  assert.equal(pretPeTrepte(t, 7, 100).subtotal, 679);
  assert.equal(pretPeTrepte(t, 12, 100).subtotal, 1080);
});

test("pragul porneste DE LA cantitatea scrisa, nu de la urmatoarea", () => {
  const t = construiesteTrepte(CU_PRAGURI, 100);
  assert.equal(pretPeTrepte(t, 4, 100).subtotal, 400, "sub prag se plateste intreg");
  assert.equal(pretPeTrepte(t, 5, 100).subtotal, 485, "5 bucati primesc deja 3%");
  assert.equal(pretPeTrepte(t, 9, 100).subtotal, 873, "intre praguri ramane 3%");
  assert.equal(pretPeTrepte(t, 10, 100).subtotal, 900, "10 bucati primesc 10%");
});

test("se ia pragul cel mai mare care incape, nu primul din lista", () => {
  /* ⚠ Scrise in ordine inversa dinadins: daca motorul ar lua primul potrivit
     din lista asa cum vine, 20 de bucati ar fi primit 3% in loc de 10%. */
  const t = construiesteTrepte({ enabled: true, praguri: [{ min_qty: 10, percent: 10 }, { min_qty: 5, percent: 3 }] }, 100);
  assert.equal(pretPeTrepte(t, 20, 100).subtotal, 1800);
});

test("pragul lucreaza si peste plafonul de impachetare", () => {
  /*
    ⚠ Plafonul de 500 de bucati exista pentru impachetare, care e o programare
    dinamica peste fiecare bucata. Pragul e o inmultire. Prins sub acelasi
    `if`, o comanda de 600 de bucati ar fi pierdut tocmai reducerea de
    cantitate - adica exact cazul pentru care a fost facuta.
  */
  const t = construiesteTrepte(CU_PRAGURI, 10);
  assert.equal(pretPeTrepte(t, 600, 10).subtotal, 5400);
  assert.equal(pretPeTrepte(t, 600, 10).savings, 600);
});

test("pretul unitar inmultit cu cantitatea da exact totalul, si cu praguri", () => {
  const t = construiesteTrepte(CU_PRAGURI, 89.99);
  for (const cantitate of [1, 5, 7, 10, 33]) {
    const r = pretPeTrepte(t, cantitate, 89.99);
    assert.equal(bani(r.unitPrice * cantitate), bani(r.subtotal), `la ${cantitate} bucati`);
  }
});

test("pragurile fara inteles se arunca, nu se aplica gresit", () => {
  const t = construiesteTrepte({
    enabled: true,
    praguri: [
      { min_qty: 1, percent: 50 },    // sub 2 bucati nu e o reducere de cantitate
      { min_qty: 5, percent: 0 },     // zero la suta nu e o reducere
      { min_qty: 8, percent: 150 },   // peste 100% ar face pretul negativ
      { min_qty: 10, percent: 10 },   // singurul bun
    ],
  }, 100);
  assert.deepEqual(t?.praguri.map((p) => [p.minQty, p.percent]), [[10, 10]]);
  assert.equal(pretPeTrepte(t, 1, 100).subtotal, 100, "pragul de la 1 bucata nu a trecut");
  assert.equal(pretPeTrepte(t, 9, 100).subtotal, 900);
  assert.equal(pretPeTrepte(t, 10, 100).subtotal, 900);
});

test("cand exista si pachete, si praguri, castiga ce iese mai ieftin", () => {
  /* In practica nu se intalnesc (upsell-ul produsului are intaietate fata de
     oferta magazinului), dar regula trebuie sa existe: altfel ordinea in care
     ajung configuratiile ar hotari pretul. */
  const t = construiesteTrepte(
    { enabled: true, mode: "percent", tier2_percent: 50, praguri: [{ min_qty: 2, percent: 5 }] },
    100,
  );
  assert.equal(pretPeTrepte(t, 2, 100).subtotal, 100, "pachetul de 2 la -50% bate pragul de 5%");
});

test("un prag care da mai putin decat cel de dinaintea lui e refuzat", () => {
  /*
    ⚠ Nu rupe totalul (mai multe bucati tot costa mai mult), deci plasa veche
    nu l-ar fi vazut. Dar clientul care mai adauga o bucata vede pretul PE
    BUCATA crescand, si suna sa intrebe daca e o greseala. Este.
  */
  const t = construiesteTrepte({ enabled: true, praguri: [{ min_qty: 5, percent: 10 }, { min_qty: 10, percent: 3 }] }, 100);
  const problema = problemaMonotonie(t);
  assert.ok(problema, "configuratia pe dos ar fi trebuit respinsa");
  assert.equal(problema?.qty, 10);
  assert.match(mesajProblemaTrepte(problema!), /reducerea trebuie sa creasca/i);

  const bun = construiesteTrepte(CU_PRAGURI, 100);
  assert.equal(problemaMonotonie(bun), null, "3% apoi 10% e in regula");
});
