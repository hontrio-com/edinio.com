import test from "node:test";
import assert from "node:assert/strict";
import {
  inMilimetri, inLungime, inGrame, inMasa,
  mpDinMmp, mcDinMmc, mDinMm, kgDinG,
  round2, eNumarBun, esteUnitateLungime, esteUnitateMasa,
} from "./unitati";

/*
 * REGULA DE SCARA a motorului: totul in unitatea de baza, ca `number` obisnuit.
 *
 * Probele de aici apara chiar defectul din care s-a nascut fisierul: o forma anterioara tinea
 * unele numere „la scara" (2 pastrat ca 20000) si altele in unitatea de baza, iar evaluatorul
 * n-avea cum sa le deosebeasca. `latime * 2` ar fi dat 56.000.000 in loc de 5.600.
 */

test("conversia de lungime INMULTESTE, deci nu pierde zecimale", () => {
  // 2,5 m trebuie sa dea exact 2500, nu 2499,9999999999995.
  assert.equal(inMilimetri(2.5, "m"), 2500);
  assert.equal(inMilimetri(35, "cm"), 350);
  assert.equal(inMilimetri(7, "mm"), 7);
  // Exact, nu „aproape": comparatie stricta, nu `closeTo`.
  assert.ok(Object.is(inMilimetri(0.1, "m"), 100));
});

test("dus si intors da valoarea de plecare pe unitatile intregi", () => {
  for (const u of ["mm", "cm", "m"] as const) {
    assert.equal(inLungime(inMilimetri(350, u), u), 350);
  }
});

test("masa: gramul e baza", () => {
  assert.equal(inGrame(1.2, "kg"), 1200);
  assert.equal(inGrame(450, "g"), 450);
  assert.equal(inMasa(1500, "kg"), 1.5);
  assert.equal(kgDinG(2500), 2.5);
});

test("suprafata in metri patrati, din milimetri patrati", () => {
  // Cazul din plan: un fototapet de 350 x 256 cm.
  const latime = inMilimetri(350, "cm");   // 3500 mm
  const inaltime = inMilimetri(256, "cm"); // 2560 mm
  assert.equal(latime, 3500);
  assert.equal(inaltime, 2560);
  assert.equal(mpDinMmp(latime * inaltime), 8.96);
  // Si pretul care iese din el, cu rotunjirea de la capat.
  assert.equal(round2(mpDinMmp(latime * inaltime) * 89), 797.44);
});

test("un metru patrat e un metru patrat", () => {
  assert.equal(mpDinMmp(1000 * 1000), 1);
  assert.equal(mcDinMmc(1000 * 1000 * 1000), 1);
  assert.equal(mDinMm(1000), 1);
});

test("round2 e ACELASI cu al restului proiectului, cu tot cu ciudateniile lui", () => {
  /*
   * Nu e „jumatate in sus" consecvent, fiindca lucreaza pe binar. Probele astea nu apara o
   * purtare dorita, ci una pe care ne bizuim ca ramane IDENTICA cu `order.actions.ts`,
   * `cart/pricing.ts` si `billing/reconcile.ts`. Daca vreodata se schimba aici, se rup
   * reconcilierile de factura — de aceea sunt scrise pe fata.
   */
  assert.equal(round2(1.005), 1);      // NU 1,01
  assert.equal(round2(2.675), 2.68);
  assert.equal(round2(10.075), 10.07); // NU 10,08
  assert.equal(round2(0.1 + 0.2), 0.3);
});

test("round2 inghite gunoiul in zero, deci nu e o poarta de validare", () => {
  // Tocmai de aia exista `eNumarBun`: `round2` singur ar transforma un NaN in 0,
  // iar zero la pret inseamna marfa data pe gratis.
  assert.equal(round2(Number.NaN), 0);
  assert.equal(round2("nu-i numar" as unknown as number), 0);
  assert.equal(eNumarBun(Number.NaN), false);
  assert.equal(eNumarBun(Number.POSITIVE_INFINITY), false);
  assert.equal(eNumarBun(Number.NEGATIVE_INFINITY), false);
  assert.equal(eNumarBun("5"), false);
  assert.equal(eNumarBun(null), false);
  assert.equal(eNumarBun(0), true);
  assert.equal(eNumarBun(-3.5), true);
});

test("unitatile necunoscute se resping, nu se ghicesc", () => {
  assert.equal(esteUnitateLungime("cm"), true);
  assert.equal(esteUnitateLungime("inch"), false);
  assert.equal(esteUnitateLungime(""), false);
  assert.equal(esteUnitateLungime(undefined), false);
  assert.equal(esteUnitateMasa("kg"), true);
  assert.equal(esteUnitateMasa("lb"), false);
});

test("acelasi calcul, scris cu unitati diferite, da acelasi numar", () => {
  /*
   * Chiar rostul modulului: comerciantul isi alege unitatea din interfata, iar motorul nu
   * trebuie sa afle niciodata care a fost. 3,5 m si 350 cm sunt acelasi lucru.
   */
  const dinMetri = mpDinMmp(inMilimetri(3.5, "m") * inMilimetri(2.56, "m"));
  const dinCentimetri = mpDinMmp(inMilimetri(350, "cm") * inMilimetri(256, "cm"));
  const dinMilimetri = mpDinMmp(inMilimetri(3500, "mm") * inMilimetri(2560, "mm"));
  assert.equal(dinMetri, dinCentimetri);
  assert.equal(dinCentimetri, dinMilimetri);
  assert.equal(dinMetri, 8.96);
});
