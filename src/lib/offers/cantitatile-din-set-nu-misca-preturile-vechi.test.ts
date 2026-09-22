import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  fbtCompanionPrices, imparteEconomiaCompanionilor, pretulSetului, type ConfigReducereSet,
} from "./fbt-pricing";
import { aplicaPretPeBucati, aplicaBumpPeOBucata, type BumpItem } from "./bump-pricing";
import { cantitateaCeruta, parseOfferConfig, OFFER_MAX_CANTITATE } from "./offer.types";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * CANTITĂȚI ÎN SET, FĂRĂ SĂ MIȘTE NICIUN PREȚ DE AZI            (22.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Cerut de el: la „Cumpărate împreună”, comerciantul să poată cere „2 becuri +
 * 1 lustră”, nu doar câte una din fiecare.
 *
 * ⚠⚠ ATINGE CALEA BANILOR, și de-aia proba de temelie de aici nu e că
 * funcționează cantitățile, ci că **o ofertă FĂRĂ cantități dă exact prețul de
 * ieri, la bit**. Măsurat pe producție la 22.09.2026: singura ofertă
 * `frequently_bought` are un companion, fără nicio cantitate.
 *
 * ⚠ Prețul setului e autoritar pe SERVER: clientul trimite doar id-ul ofertei,
 * iar serverul reconstituie setul din configurație. Dacă afișarea și încasarea
 * socotesc cantitățile altfel, clientul vede un preț și plătește altul.
 */

const procent = (p: number): ConfigReducereSet => ({ discountMode: "percent", discountPercent: p });
const l = (pret: number, bucati?: number) => ({ pret, bucati });

/* ── Temelia: fără cantități, nimic nu se mișcă ─────────────────────────── */

test("⚠⚠ un set FĂRĂ cantități dă exact prețurile de ieri", () => {
  /*
   * Cazul LIVE de la BricoSmart, cu cifrele lui: ancoră 1.244,88 lei, companioni
   * 34,28 + 32,25 + 27,47 + 18,99. Numerele astea sunt scrise și în
   * `fbt-pricing.test.ts`, dinainte de cantități.
   */
  const companioni = [34.28, 32.25, 27.47, 18.99];
  const fara = fbtCompanionPrices(l(1244.88), companioni.map((p) => l(p)), procent(10));
  assert.deepEqual(fara, [30.85, 29.02, 24.72, 17.09]);

  /* Și scris explicit cu „o bucată”, ca să se vadă că e aceeași socoteală. */
  const cuUnu = fbtCompanionPrices(l(1244.88), companioni.map((p) => l(p, 1)), procent(10));
  assert.deepEqual(cuUnu, fara);
});

test("⚠ `bucati` lipsă, zero, negativ sau aiurea înseamnă tot O bucată", () => {
  const drept = pretulSetului([l(100), l(50)], procent(10));
  for (const b of [1, 0, -3, NaN, undefined]) {
    const r = pretulSetului([l(100), l(50, b as number)], procent(10));
    assert.deepEqual(r, drept, `bucati = ${b} a schimbat prețul`);
  }
});

/* ── Cu cantități ───────────────────────────────────────────────────────── */

test("prețul setului numără VALOAREA liniei, nu prețul", () => {
  /* 2 × 50 + 1 × 100 = 200, minus 10% = 180. */
  const r = pretulSetului([l(100), l(50, 2)], procent(10));
  assert.equal(r.compareAt, 200);
  assert.equal(r.price, 180);
  assert.equal(r.savings, 20);
});

test("⚠⚠ economia se împarte pe VALOARE, dar rezultatul rămâne UNITAR", () => {
  /*
   * Două contează deodată:
   *
   * Pe valoare — un companion luat în două bucăți trage de două ori mai mult din
   * economie decât unul luat într-una. Altfel „10% pe set” ar fi căzut cu totul
   * pe produsul luat o dată.
   *
   * Unitar — numărul se scrie pe LINIA de comandă, iar linia își are deja
   * cantitatea. Întors ca valoare de linie, s-ar fi înmulțit a doua oară.
   */
  const ancora = l(100);
  const companioni = [l(50, 2), l(50, 1)]; // valori: 100 și 50
  const set = pretulSetului([ancora, ...companioni], procent(50));
  // Set 250, -50% = 125, economie 125. Cota companionilor: 150/250 = 0,6 → 75.
  assert.equal(set.savings, 125);

  const reduse = imparteEconomiaCompanionilor(ancora, companioni, set.savings);
  // Primul duce 75 × (100/150) = 50 pe LINIE, adică 25 pe bucată → 50 − 25 = 25.
  // Al doilea duce 75 × (50/150) = 25 pe linie, pe o bucată → 50 − 25 = 25.
  assert.deepEqual(reduse, [25, 25]);

  /* ⚠ Și verificarea că e chiar economia setului, nu mai mult: */
  const platit = reduse[0] * 2 + reduse[1] * 1;
  assert.equal(Math.round((150 - platit) * 100) / 100, 75);
});

test("un companion cerut în mai multe bucăți nu-l înfometează pe celălalt", () => {
  /* Cu împărțirea pe PREȚ, nu pe valoare, cel luat o dată ar fi dus toată cota. */
  const r = imparteEconomiaCompanionilor(l(0), [l(10, 9), l(10, 1)], 50);
  // Valori: 90 și 10, deci 45 și 5 din economie → 5 și 5 pe bucată.
  assert.deepEqual(r, [5, 5]);
});

/* ── Așezarea pe liniile comenzii ───────────────────────────────────────── */

const linie = (id: string, q: number, pret: number): BumpItem =>
  ({ product_id: id, name: id, price: pret, quantity: q });

test("⚠ bump-ul rămâne pe O bucată — `aplicaBumpPeOBucata` e cazul `bucati = 1`", () => {
  const linii = [linie("a", 3, 100)];
  const economie = aplicaBumpPeOBucata(linii, linii[0], 80);
  assert.equal(economie, 20);
  assert.equal(linii.length, 2);
  assert.equal(linii[0].quantity, 2);
  assert.deepEqual([linii[1].quantity, linii[1].price], [1, 80]);
});

test("setul ieftinește CÂTE BUCĂȚI cere, iar restul rămân la prețul întreg", () => {
  const linii = [linie("a", 5, 100)];
  const economie = aplicaPretPeBucati(linii, linii[0], 80, 2);
  assert.equal(economie, 40, "economia e pe bucăți, nu pe una");
  assert.equal(linii[0].quantity, 3, "restul rămân");
  assert.deepEqual([linii[1].quantity, linii[1].price], [2, 80]);
});

test("când linia are fix cât cere setul, nu se mai desprinde nicio linie", () => {
  const linii = [linie("a", 2, 100)];
  const economie = aplicaPretPeBucati(linii, linii[0], 80, 2);
  assert.equal(economie, 40);
  assert.equal(linii.length, 1);
  assert.deepEqual([linii[0].quantity, linii[0].price], [2, 80]);
});

test("⚠ când linia are MAI PUȚINE, se ieftinesc cele care sunt — aici nu se refuză nimic", () => {
  /*
   * Refuzul e treaba reconstituirii setului (`setulOfertei`), nu a aritmeticii de
   * bani. Strecurat aici, ar fi oprit comenzi dintr-un fișier care n-ar trebui
   * să oprească nimic.
   */
  const linii = [linie("a", 1, 100)];
  const economie = aplicaPretPeBucati(linii, linii[0], 80, 3);
  assert.equal(economie, 20);
  assert.equal(linii.length, 1);
  assert.equal(linii[0].price, 80);
});

test("⚠⚠ garda rămâne PE BUCATĂ, nu pe total", () => {
  /*
   * Mutată pe total, o diferență de 0,003 lei × 4 bucăți ar fi trecut de ea și ar
   * fi scris un preț acolo unde azi nu se scrie nimic.
   */
  const linii = [linie("a", 4, 100)];
  assert.equal(aplicaPretPeBucati(linii, linii[0], 100, 4), 0, "preț egal nu e o reducere");
  assert.equal(aplicaPretPeBucati(linii, linii[0], 101, 4), 0, "preț mai mare nu e o reducere");
  assert.equal(linii.length, 1);
  assert.equal(linii[0].price, 100, "linia n-a fost atinsă");
});

/* ── Parsarea: ce ajunge în bază ────────────────────────────────────────── */

test("⚠⚠ un set în care toate produsele intră cu o bucată scrie ACELAȘI jsonb ca azi", () => {
  /*
   * Asta e ce ține ofertele existente pe loc: dacă parsarea ar fi scris
   * `cantitati: { a: 1, b: 1 }`, orice salvare din panou ar fi schimbat rândul,
   * și orice comparație de rânduri ar fi ieșit altfel.
   */
  const c = parseOfferConfig({ productIds: ["a", "b"], cantitati: { a: 1, b: 1 } });
  assert.equal(c.cantitati, undefined);
  assert.equal("cantitati" in c, false);
});

test("se păstrează doar cheile produselor care chiar sunt în set", () => {
  const c = parseOfferConfig({ productIds: ["a"], cantitati: { a: 2, scos: 5 } });
  assert.deepEqual(c.cantitati, { a: 2 });
});

test("cantitățile se curăță: podea 1, tavan plafonul, fără zecimale", () => {
  const c = parseOfferConfig({
    productIds: ["a", "b", "c", "d"],
    cantitati: { a: 2.7, b: 0, c: -5, d: 9999 },
  });
  assert.deepEqual(c.cantitati, { a: 2, d: OFFER_MAX_CANTITATE });
});

test("ce nu e un obiect nu devine cantități", () => {
  for (const gunoi of [[], "2", 7, null]) {
    assert.equal(parseOfferConfig({ productIds: ["a"], cantitati: gunoi }).cantitati, undefined);
  }
});

/* ── Poarta pe tip ──────────────────────────────────────────────────────── */

test("⚠⚠ numai setul citește cantități; la recomandări și la bump e MEREU una", () => {
  /*
   * `parseOfferConfig` nu primește tipul, deci o cheie rătăcită pe un
   * `cross_sell` ar fi altfel citită — iar acolo „două bucăți” n-are niciun
   * înțeles și ar fi schimbat un preț.
   */
  const cfg = parseOfferConfig({ productIds: ["a"], cantitati: { a: 3 } });
  assert.equal(cantitateaCeruta("frequently_bought", cfg, "a"), 3);
  assert.equal(cantitateaCeruta("cross_sell", cfg, "a"), 1);
  assert.equal(cantitateaCeruta("order_bump", cfg, "a"), 1);
  assert.equal(cantitateaCeruta("volume", cfg, "a"), 1);
  /* Și o cheie care nu există înseamnă tot una. */
  assert.equal(cantitateaCeruta("frequently_bought", cfg, "altul"), 1);
});

/* ── Plasele de cablare ─────────────────────────────────────────────────── */

test("⚠⚠ cantitatea vine din CONFIGURAȚIE, la afișare și la comandă, nu din browser", () => {
  /*
   * Setul se revendică doar cu id-ul ofertei. Dacă vreuna din cele două căi ar
   * lua cantitatea din ce trimite browserul, clientul ar putea cere zece bucăți
   * la prețul de set.
   */
  const afisare = readFileSync("src/lib/offers/offers.ts", "utf8");
  const comanda = readFileSync("src/lib/offers/offer-pricing.ts", "utf8");
  assert.match(afisare, /cantitate: cantitateaCeruta\(o\.type, o\.config, x\.id\)/);
  assert.match(comanda, /cantitate: cantitateaCeruta\(o\.type, o\.config, p\.id\)/);
});

test("⚠⚠ venitul ofertei se socotește PE BUCĂȚI", () => {
  /*
   * Rămas unitar, aceeași comandă ar fi scris două numere care se contrazic:
   * `orders.offer_discount_amount` socotit pe două bucăți și
   * `offers.revenue_added` pe una.
   */
  const s = readFileSync("src/lib/offers/offer-pricing.ts", "utf8");
  assert.match(s, /venit = round2\(venit \+ platit \* luate\)/);
});

test("⚠ stocul trebuie să ajungă pentru CÂTE cere setul", () => {
  /*
   * Un set care cere 2 becuri pe un stoc de 1 nu se poate cumpăra. Arătat,
   * butonul ar fi dus la o comandă pe care rezervarea de stoc o refuză la
   * ultimul pas, după ce omul și-a scris toate datele.
   */
  const s = readFileSync("src/lib/offers/offers.ts", "utf8");
  assert.match(s, /p\.stocDisponibil == null \|\| p\.stocDisponibil >= cerute/);
});
