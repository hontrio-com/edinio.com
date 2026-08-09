import assert from "node:assert/strict";
import { test } from "node:test";
import { PRICING_PLANS, pretIntermediar, pretLunar } from "./pricing";
import { PLAN_PRICES, getAnnualMonthlyEquivalent } from "@/lib/plans";

/**
 * Animația prețului, probată pe regulă.
 *
 * ═══ DE CE TESTELE ASTEA ═══
 *
 * Animația în sine nu se poate verifica automat: într-o filă din fundal Chrome
 * oprește `requestAnimationFrame` cu totul, iar fila condusă de unelte E în
 * fundal. Măsurat: un `requestAnimationFrame` cerut acolo nu rulează nici după o
 * secundă și jumătate.
 *
 * Asta a scos la iveală un defect care nu ținea de estetică: cifra ajungea la
 * valoarea nouă DOAR dacă rulau cadrele. Cu fila ascunsă, apăsarea pe „Anual"
 * lăsa prețul pe cel vechi. E o pagină comercială — prețul afișat e o afirmație
 * despre bani, nu un efect. De aici plasa de siguranță pe ceas din componentă,
 * și de aici testele de mai jos pe regula de interpolare.
 */

test("la început e valoarea veche, la sfârșit EXACT cea nouă", () => {
  assert.equal(pretIntermediar(99, 74, 0), 99);
  assert.equal(pretIntermediar(99, 74, 1), 74);
  // Nu „aproape de tinta": e un pret.
  assert.equal(pretIntermediar(249, 187, 1), 187);
  assert.equal(pretIntermediar(499, 374, 1), 374);
});

test("progresul in afara intervalului nu scoate cifre aiurea", () => {
  assert.equal(pretIntermediar(99, 74, -5), 99);
  assert.equal(pretIntermediar(99, 74, 9), 74);
});

test("coboara monoton, fara sa depaseasca tinta", () => {
  let anterior = pretIntermediar(499, 374, 0);
  for (let i = 1; i <= 60; i++) {
    const v = pretIntermediar(499, 374, i / 60);
    assert.ok(v <= anterior, `a urcat la pasul ${i}: ${anterior} -> ${v}`);
    assert.ok(v >= 374, `a trecut sub tinta la pasul ${i}: ${v}`);
    anterior = v;
  }
  assert.equal(anterior, 374);
});

test("urca monoton, fara sa depaseasca tinta", () => {
  let anterior = pretIntermediar(74, 99, 0);
  for (let i = 1; i <= 60; i++) {
    const v = pretIntermediar(74, 99, i / 60);
    assert.ok(v >= anterior, `a coborat la pasul ${i}`);
    assert.ok(v <= 99, `a trecut peste tinta la pasul ${i}: ${v}`);
    anterior = v;
  }
  assert.equal(anterior, 99);
});

test("curba e ease-OUT: la jumatatea timpului a facut mult peste jumatate din drum", () => {
  /*
   * Asta e chiar deosebirea dintre „numar care se asaza" si „numar care se
   * opreste brusc". Liniar ar da exact 50%; ease-out cubic da 87,5%.
   */
  const laJumatate = pretIntermediar(0, 1000, 0.5);
  assert.ok(laJumatate > 800, `prea liniar: ${laJumatate}`);
  assert.ok(laJumatate < 950, `prea brusc: ${laJumatate}`);
});

test("valoare neschimbata nu produce nicio miscare", () => {
  for (const p of [0, 0.3, 0.7, 1]) {
    assert.equal(pretIntermediar(249, 249, p), 249);
  }
});

// ── Preturile afisate sunt cele ale aplicatiei ────────────────────────────────

test("preturile din sectiune vin din sursa aplicatiei, nu din copii", () => {
  /*
   * Erau scrise de mana in componenta. Aceleasi valori, dar doua locuri: la prima
   * scumpire, site-ul de prezentare ar fi anuntat un pret pe care platforma nu-l
   * mai practica.
   */
  assert.equal(pretLunar("basic"), PLAN_PRICES.basic);
  assert.equal(pretLunar("premium"), PLAN_PRICES.premium);
  assert.equal(pretLunar("ultra"), PLAN_PRICES.ultra);
  assert.equal(pretLunar("trial"), 0);
});

test("fiecare plan afisat are un pret cunoscut", () => {
  for (const plan of PRICING_PLANS) {
    assert.ok(plan.id in PLAN_PRICES, `plan fara pret: ${plan.id}`);
  }
});

test("echivalentul lunar la plata anuala e mai mic decat cel lunar", () => {
  for (const plan of PRICING_PLANS) {
    const lunar = pretLunar(plan.id);
    if (lunar === 0) continue;
    assert.ok(getAnnualMonthlyEquivalent(plan.id) < lunar, `nu e mai ieftin: ${plan.id}`);
  }
});
