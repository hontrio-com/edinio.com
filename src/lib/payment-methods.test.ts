import assert from "node:assert/strict";
import { test } from "node:test";
import { checkoutPaymentMethods, computeCodFee, codFeeInStoreMode, normalizePaymentMethod, parseCodFeeConfig, processorReadiness, sanitizeCodFeeConfig, verificaMetodaPlata, METODA_NEOFERITA, type CodFeeConfig } from "./payment-methods";
import { computeVat } from "./utils/vat";

/**
 * Taxa la plata ramburs. Partea care merita teste nu e semnul (aduna, nu scade),
 * ci TVA-ul: comerciantul scrie „10 lei" si alege daca cei 10 lei contin sau nu
 * TVA, iar magazinul poate lucra el insusi in oricare din cele doua regimuri. Sunt
 * patru combinatii, iar trei dintre ele cer o conversie — gresita, clientul
 * plateste alt pret decat a vrut comerciantul.
 */

const TVA_INCLUS = { vat_enabled: true, vat_rate: 19, prices_include_vat: true };
const TVA_EXCLUS = { vat_enabled: true, vat_rate: 19, prices_include_vat: false };
const FARA_TVA = { vat_enabled: false, vat_rate: 19, prices_include_vat: true };

const FIXA = (value: number, includesVat: boolean): CodFeeConfig => ({
  enabled: true, type: "fixed", value, amount_includes_vat: includesVat,
});

test("cand comerciantul si magazinul spun acelasi lucru, nu se converteste nimic", () => {
  assert.equal(codFeeInStoreMode(10, true, TVA_INCLUS), 10);
  assert.equal(codFeeInStoreMode(10, false, TVA_EXCLUS), 10);
});

test("suma cu TVA intr-un magazin care lucreaza in net se desface", () => {
  // 11.90 cu TVA => 10.00 fara TVA
  assert.equal(Math.round(codFeeInStoreMode(11.9, true, TVA_EXCLUS) * 100) / 100, 10);
});

test("suma fara TVA intr-un magazin care lucreaza in brut se completeaza", () => {
  assert.equal(Math.round(codFeeInStoreMode(10, false, TVA_INCLUS) * 100) / 100, 11.9);
});

test("cu TVA-ul oprit pe magazin, comutatorul nu are niciun efect", () => {
  assert.equal(codFeeInStoreMode(10, true, FARA_TVA), 10);
  assert.equal(codFeeInStoreMode(10, false, FARA_TVA), 10);
});

test("taxa se aplica DOAR la ramburs", () => {
  assert.equal(computeCodFee(FIXA(10, true), "cash_on_delivery", 100, TVA_INCLUS), 10);
  for (const m of ["stripe", "netopia", "ipay", "klarna", "revolut", null, undefined, ""]) {
    assert.equal(computeCodFee(FIXA(10, true), m, 100, TVA_INCLUS), 0, `metoda ${m}`);
  }
});

test("oprita sau cu valoare zero, taxa e zero", () => {
  assert.equal(computeCodFee({ ...FIXA(10, true), enabled: false }, "cash_on_delivery", 100, TVA_INCLUS), 0);
  assert.equal(computeCodFee(FIXA(0, true), "cash_on_delivery", 100, TVA_INCLUS), 0);
});

test("procentul se aplica pe baza de marfa si ignora comutatorul de TVA", () => {
  const cfg: CodFeeConfig = { enabled: true, type: "percent", value: 2, amount_includes_vat: false };
  // 2% din 250 = 5, in regimul magazinului, indiferent ce spune comutatorul.
  assert.equal(computeCodFee(cfg, "cash_on_delivery", 250, TVA_INCLUS), 5);
  assert.equal(computeCodFee(cfg, "cash_on_delivery", 250, TVA_EXCLUS), 5);
  // Pe o baza zero nu se ia procent din nimic.
  assert.equal(computeCodFee(cfg, "cash_on_delivery", 0, TVA_INCLUS), 0);
});

/**
 * Verificarea care conteaza cu adevarat: cat plateste omul. Se reface aici exact
 * formula serverului (`subtotal + taxa` in baza de TVA, apoi `+ vatAddOn` in
 * total), ca sa se vada ca ambele regimuri ajung la aceeasi suma finala pentru
 * aceeasi intentie a comerciantului.
 */
function totalCuTaxa(marfa: number, cfg: CodFeeConfig, vat: typeof TVA_INCLUS): number {
  const taxa = computeCodFee(cfg, "cash_on_delivery", marfa, vat);
  const { vatAddOn } = computeVat(marfa + taxa, vat);
  return Math.round((marfa + taxa + vatAddOn) * 100) / 100;
}

test("„10 lei cu TVA\" inseamna 10 lei in plus, in orice regim al magazinului", () => {
  // Magazin cu preturi cu TVA inclus: marfa 119 (adica 100 + TVA).
  assert.equal(totalCuTaxa(119, FIXA(10, true), TVA_INCLUS), 129);
  // Acelasi magazin tinut in net: marfa 100 net => 119 platiti, plus 10 cu TVA.
  assert.equal(totalCuTaxa(100, FIXA(10, true), TVA_EXCLUS), 129);
});

test("„10 lei fara TVA\" inseamna 11,90 in plus, in orice regim al magazinului", () => {
  assert.equal(totalCuTaxa(119, FIXA(10, false), TVA_INCLUS), 130.9);
  assert.equal(totalCuTaxa(100, FIXA(10, false), TVA_EXCLUS), 130.9);
});

test("taxa intra in baza de TVA, deci creste si TVA-ul raportat", () => {
  const cfg = FIXA(10, false);
  const taxa = computeCodFee(cfg, "cash_on_delivery", 100, TVA_EXCLUS);
  const faraTaxa = computeVat(100, TVA_EXCLUS).vatAmount;
  const cuTaxa = computeVat(100 + taxa, TVA_EXCLUS).vatAmount;
  assert.equal(faraTaxa, 19);
  assert.equal(cuTaxa, 20.9);
});

test("parsarea respinge gunoiul si pastreaza implicitul „contine TVA\"", () => {
  assert.deepEqual(parseCodFeeConfig(null), { enabled: false, type: "fixed", value: 0, amount_includes_vat: true });
  assert.deepEqual(parseCodFeeConfig("10 lei"), { enabled: false, type: "fixed", value: 0, amount_includes_vat: true });
  // Procent peste 100 se plafoneaza; valoarea negativa devine zero.
  assert.equal(parseCodFeeConfig({ enabled: true, type: "percent", value: 500 }).value, 100);
  assert.equal(parseCodFeeConfig({ enabled: true, type: "fixed", value: -5 }).value, 0);
  // Doar `false` explicit inseamna „fara TVA".
  assert.equal(parseCodFeeConfig({ amount_includes_vat: false }).amount_includes_vat, false);
  assert.equal(parseCodFeeConfig({}).amount_includes_vat, true);
});

/**
 * Metoda de plata era citita in doua feluri in aceeasi functie: bruta la calcule
 * si cu implicit „ramburs" la inserare. O cerere fara campul asta producea o
 * comanda ramburs perfect obisnuita, dar cu taxa zero — comerciantul platea
 * comisionul curierului si nu incasa taxa, fara nimic vizibil nicaieri.
 */
test("orice nu e o metoda cunoscuta devine ramburs, nu altceva", () => {
  assert.equal(normalizePaymentMethod(undefined), "cash_on_delivery");
  assert.equal(normalizePaymentMethod(null), "cash_on_delivery");
  assert.equal(normalizePaymentMethod(""), "cash_on_delivery");
  assert.equal(normalizePaymentMethod("bitcoin"), "cash_on_delivery");
  assert.equal(normalizePaymentMethod(42), "cash_on_delivery");
  assert.equal(normalizePaymentMethod({}), "cash_on_delivery");
  // Cele doua siruri care gasesc ceva pe lantul de prototip al obiectului. Cu o
  // citire simpla urmata de `??`, de aici ieseau functia `Object`, respectiv
  // `Object.prototype`, si mai departe o comanda cu o metoda de plata inexistenta.
  assert.equal(normalizePaymentMethod("constructor"), "cash_on_delivery");
  assert.equal(normalizePaymentMethod("__proto__"), "cash_on_delivery");
  assert.equal(normalizePaymentMethod("toString"), "cash_on_delivery");
});

test("codurile vechi si scrierea cu majuscule ajung la aceeasi metoda", () => {
  assert.equal(normalizePaymentMethod("cod"), "cash_on_delivery");
  assert.equal(normalizePaymentMethod("ramburs"), "cash_on_delivery");
  assert.equal(normalizePaymentMethod(" CASH_ON_DELIVERY "), "cash_on_delivery");
});

test("metodele reale trec neatinse", () => {
  for (const m of ["stripe", "netopia", "ipay", "klarna", "revolut"]) {
    assert.equal(normalizePaymentMethod(m), m);
  }
});

test("dupa normalizare, o cerere fara metoda incaseaza taxa", () => {
  const cfg = FIXA(15, true);
  // Inainte: valoarea bruta `undefined` nu era ramburs, deci taxa 0.
  assert.equal(computeCodFee(cfg, undefined, 300, TVA_INCLUS), 0);
  // Dupa: aceeasi cerere trece prin normalizare si taxa se aplica.
  assert.equal(computeCodFee(cfg, normalizePaymentMethod(undefined), 300, TVA_INCLUS), 15);
});

test("o taxa de zero nu se poate salva ca pornita", () => {
  const s = sanitizeCodFeeConfig({ enabled: true, type: "fixed", value: 0, amount_includes_vat: true });
  assert.equal(s.enabled, false);
  assert.equal(s.value, 0);
});

/* ─── Metoda de plata, verificata fata de ce ofera magazinul ──────────────── */

/**
 * Comanda accepta pana acum orice cod cunoscut, indiferent daca magazinul il
 * ofera. De metoda atarna trei sume, deci „stripe" trimis catre un magazin care
 * are doar ramburs lua reducerea de card si scapa de taxa.
 *
 * Testele astea sunt teste pe APELANT, nu doar pe modul: actiunile de comanda nu
 * se pot incarca in harnas, de aceea decizia intreaga sta in `verificaMetodaPlata`,
 * care primeste exact ce are actiunea (sirul brut si randul de setari) si intoarce
 * exact ce face actiunea.
 */

const NETOPIA_GATA = { netopia_config: { enabled: true, pos_signature: "sig", api_key: "key" } };
const STRIPE_GATA = { stripe_config: { enabled: true, charges_enabled: true, account_id: "acct_1" } };
const DOAR_RAMBURS = { payment_methods: [{ type: "cash_on_delivery", enabled: true }] };

test("procesatorul gata se decide dupa aceleasi campuri peste tot", () => {
  assert.deepEqual(processorReadiness(null),
    { netopia: false, stripe: false, ipay: false, klarna: false, revolut: false });
  assert.equal(processorReadiness(NETOPIA_GATA).netopia, true);
  assert.equal(processorReadiness(STRIPE_GATA).stripe, true);
  // Stripe cere in plus contul activat pentru incasari: fara el, magazinul nu-l arata.
  assert.equal(processorReadiness({ stripe_config: { enabled: true, account_id: "acct_1" } }).stripe, false);
  // Credentialele goale nu inseamna gata.
  assert.equal(processorReadiness({ netopia_config: { enabled: true, pos_signature: "", api_key: "key" } }).netopia, false);
  assert.equal(processorReadiness({ ipay_config: { enabled: false, username: "u", password: "p" } }).ipay, false);
  assert.equal(processorReadiness({ klarna_config: { enabled: true, username: "u", password: "p" } }).klarna, true);
  assert.equal(processorReadiness({ revolut_config: { enabled: true, secret_key: "sk" } }).revolut, true);
});

test("procesatorul gata dar netrecut in lista ramane ACCEPTAT", () => {
  // Cinci magazine din productie chiar asa functioneaza: coloana contine doar
  // ramburs, iar netopia/stripe apar in magazin fiindca se adauga singure cand
  // sunt configurate. O verificare scrisa pe coloana bruta le-ar fi refuzat toate
  // comenzile online — inclusiv cinci comenzi care chiar exista.
  assert.deepEqual(verificaMetodaPlata("netopia", { ...DOAR_RAMBURS, ...NETOPIA_GATA }), { metoda: "netopia" });
  assert.deepEqual(verificaMetodaPlata("stripe", { ...DOAR_RAMBURS, ...STRIPE_GATA }), { metoda: "stripe" });
});

test("metoda pe care magazinul nu o ofera opreste comanda", () => {
  const rez = verificaMetodaPlata("stripe", DOAR_RAMBURS);
  assert.ok("error" in rez);
  assert.equal(rez.error, METODA_NEOFERITA);
  // Cazul din productie: comerciantul a stins Stripe dupa ce a primit comenzi.
  assert.ok("error" in verificaMetodaPlata("stripe", {
    payment_methods: [{ type: "cash_on_delivery", enabled: true }, { type: "stripe", enabled: false }],
  }));
  // Procesator listat si pornit, dar fara credentiale: magazinul nu-l arata.
  assert.ok("error" in verificaMetodaPlata("netopia", {
    payment_methods: [{ type: "cash_on_delivery", enabled: true }, { type: "netopia", enabled: true }],
  }));
});

test("rambursul nu poate fi refuzat de o configuratie lipsa sau veche", () => {
  // Toate cele 127 de magazine ofera ramburs, iar codurile vechi si campul gol
  // devin ramburs INAINTE de verificare. Nimic din toate astea nu are voie sa
  // produca un refuz: ar fi capcana de la constatarea 6.
  for (const brut of [undefined, null, "", "cod", "ramburs", "cash_on_delivery", "__proto__", "constructor", 42]) {
    assert.deepEqual(verificaMetodaPlata(brut, DOAR_RAMBURS), { metoda: "cash_on_delivery" }, `brut: ${String(brut)}`);
  }
  // Magazin fara niciun rand de setari, si lista in formatul vechi, de siruri.
  assert.deepEqual(verificaMetodaPlata("cod", null), { metoda: "cash_on_delivery" });
  assert.deepEqual(verificaMetodaPlata(undefined, { payment_methods: ["cod"] }), { metoda: "cash_on_delivery" });
  assert.deepEqual(verificaMetodaPlata("cash_on_delivery", { payment_methods: [] }), { metoda: "cash_on_delivery" });
});

test("singurul refuz de ramburs e cel voit de comerciant", () => {
  // Ramburs stins explicit, cu un procesator gata: magazinul chiar nu-l ofera.
  const cfg = { payment_methods: [{ type: "cash_on_delivery", enabled: false }], ...NETOPIA_GATA };
  assert.deepEqual(checkoutPaymentMethods(cfg.payment_methods, processorReadiness(cfg)).map((m) => m.type), ["netopia"]);
  assert.ok("error" in verificaMetodaPlata("cash_on_delivery", cfg));
  assert.deepEqual(verificaMetodaPlata("netopia", cfg), { metoda: "netopia" });
});
