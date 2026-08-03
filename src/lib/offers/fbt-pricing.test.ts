import assert from "node:assert/strict";
import { test } from "node:test";
import { fbtCompanionPrices, imparteEconomiaCompanionilor, type ConfigReducereSet } from "./fbt-pricing";

/**
 * „Cumpara impreuna": ancora ramane la pretul intreg, iar reducerea setului se
 * vede pe companioni. Cat timp economia se calcula pe TOT setul si se descarca
 * integral pe companioni, o ancora scumpa ii dadea pe degeaba.
 */

const procent = (p: number): ConfigReducereSet => ({ discountMode: "percent", discountPercent: p });
const suma = (a: number): ConfigReducereSet => ({ discountMode: "amount", discountAmount: a });

const sumaRotunjita = (v: number[]) => Math.round(v.reduce((s, x) => s + x, 0) * 100) / 100;

test("cazul LIVE de la BricoSmart: companionii nu mai ies pe degeaba", () => {
  // Oferta f2d3c415: ancora „Emul solutie umectanta 20L" 1.244,88 lei,
  // companioni 34,28 + 32,25 + 27,47 + 18,99 = 112,99 lei.
  const companioni = [34.28, 32.25, 27.47, 18.99];
  const rezultat = fbtCompanionPrices(1244.88, companioni, procent(10));
  assert.ok(rezultat.every((p) => p > 0), `companioni pe degeaba: ${rezultat.join(", ")}`);
  // 10% pe partea companionilor, nu 10% din setul intreg descarcat peste ei:
  // 112,99 - 11,30 = 101,69, iar rotunjirea pe fiecare linie lasa 101,68.
  assert.equal(sumaRotunjita(rezultat), 101.68);
  // Inainte, toti patru ieseau 0,00.
  assert.deepEqual(rezultat, [30.85, 29.02, 24.72, 17.09]);
});

test("ancora scumpa nu mai poate duce companionii la zero, oricat ar creste", () => {
  const companioni = [10, 20];
  for (const ancora of [100, 1000, 10_000, 1_000_000]) {
    const r = fbtCompanionPrices(ancora, companioni, procent(20));
    assert.ok(r.every((p) => p > 0), `ancora ${ancora} duce companionii la zero`);
    // Reducerea pe companioni ramane exact procentul ofertei.
    assert.equal(sumaRotunjita(r), 24);
  }
});

test("procentul se aplica pe companioni, indiferent de ancora", () => {
  assert.equal(sumaRotunjita(fbtCompanionPrices(50, [50], procent(10))), 45);
  assert.equal(sumaRotunjita(fbtCompanionPrices(500, [50], procent(10))), 45);
});

test("economia se imparte proportional intre companioni", () => {
  const r = fbtCompanionPrices(100, [60, 40], procent(50));
  // 50% pe partea companionilor: 30 si 20.
  assert.deepEqual(r, [30, 20]);
});

test("reducerea in suma fixa se imparte tot pe cota companionilor", () => {
  // 60 lei reducere pe un set de 300 (ancora 200 + companioni 100):
  // companionii duc 60 x (100/300) = 20.
  assert.equal(sumaRotunjita(fbtCompanionPrices(200, [100], suma(60))), 80);
});

test("nimic nu coboara sub zero, nici la reduceri absurde", () => {
  const r = fbtCompanionPrices(0, [10, 5], procent(100));
  assert.ok(r.every((p) => p >= 0));
  assert.deepEqual(r, [0, 0]);
});

test("fara reducere, companionii raman la pretul lor", () => {
  const fara: ConfigReducereSet = { discountMode: "none" };
  assert.deepEqual(fbtCompanionPrices(100, [30, 20], fara), [30, 20]);
});

test("fara companioni nu se prabuseste", () => {
  assert.deepEqual(fbtCompanionPrices(100, [], procent(10)), []);
});

test("companionii nu cresc niciodata peste pretul lor", () => {
  for (const ancora of [0, 10, 500]) {
    const r = fbtCompanionPrices(ancora, [25, 75], procent(15));
    assert.ok(r[0] <= 25 && r[1] <= 75);
  }
});

/*
 * Cardul din pagina de produs si serverul folosesc acum ACELASI ajutor:
 * `distributeFbtSavings` (afisare) deleaga catre `imparteEconomiaCompanionilor`,
 * iar `fbtCompanionPrices` (incasare) il cheama tot pe el. Testul apara
 * intelegerea, nu implementarea: ce scrie pe ecran trebuie sa fie ce se incaseaza.
 */
test("ce se afiseaza si ce se incaseaza dau acelasi pret de set", () => {
  const cazuri: [number, number[], number][] = [
    [1244.88, [34.28, 32.25, 27.47, 18.99], 10],
    [50, [50], 10],
    [500, [10, 20, 30], 25],
    [0, [10], 50],
  ];
  for (const [ancora, companioni, pct] of cazuri) {
    const incasat = fbtCompanionPrices(ancora, companioni, procent(pct));
    // Acelasi drum pe care il face afisarea: economia intregului set, apoi impartita.
    const setCompareAt = ancora + companioni.reduce((s, p) => s + p, 0);
    const economieSet = Math.round((setCompareAt - Math.round(setCompareAt * (1 - pct / 100) * 100) / 100) * 100) / 100;
    const afisat = imparteEconomiaCompanionilor(ancora, companioni, economieSet);
    assert.deepEqual(afisat, incasat, `ancora ${ancora}, ${pct}%`);
  }
});
