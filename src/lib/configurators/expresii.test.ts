import test from "node:test";
import assert from "node:assert/strict";
import {
  evalueaza, numaraNoduri, adancimea, referinteleDin,
  num, ref, bin, rot, MAX_ADANCIME, MAX_NODURI,
  type Expresie, type ContextExpresie,
} from "./expresii";
import { inMilimetri, mpDinMmp, round2 } from "./unitati";

const gol: ContextExpresie = { valori: new Map() };
const cu = (v: Record<string, number>, c: Record<string, Expresie> = {}): ContextExpresie => ({
  valori: new Map(Object.entries(v)),
  calcule: new Map(Object.entries(c)),
});

/** Valoarea, cand se stie ca merge. Pica proba daca a iesit eroare. */
function val(e: Expresie, ctx: ContextExpresie = gol): number {
  const r = evalueaza(e, ctx);
  assert.ok(r.ok, `asteptam un numar, a iesit ${r.ok ? "" : r.cod}`);
  return r.v;
}

/** Codul de eroare, cand se stie ca pica. Pica proba daca a iesit un numar. */
function cod(e: Expresie, ctx: ContextExpresie = gol): string {
  const r = evalueaza(e, ctx);
  assert.ok(!r.ok, `asteptam o eroare, a iesit ${r.ok ? r.v : ""}`);
  return r.cod;
}

/* ── Aritmetica ──────────────────────────────────────────────────────────── */

test("cele patru operatii", () => {
  assert.equal(val(bin("adun", num(2), num(3))), 5);
  assert.equal(val(bin("scad", num(2), num(3))), -1);
  assert.equal(val(bin("inmultesc", num(4), num(2.5))), 10);
  assert.equal(val(bin("impart", num(10), num(4))), 2.5);
  assert.equal(val(bin("minim", num(7), num(3))), 3);
  assert.equal(val(bin("maxim", num(7), num(3))), 7);
  assert.equal(val({ k: "neg", a: num(5) }), -5);
  assert.equal(val({ k: "abs", a: num(-5) }), 5);
});

test("CAZUL DIN PLAN: fototapet 350 x 256 cm la 89 lei/m²", () => {
  /*
   * Chiar exemplul din cerinta, dus prin motor asa cum il va construi interfata:
   *   suprafata = latime_mm * inaltime_mm / 1.000.000
   *   pret      = suprafata * pret_pe_mp
   */
  const ctx = cu(
    { latime: inMilimetri(350, "cm"), inaltime: inMilimetri(256, "cm"), pretMp: 89 },
    {
      suprafata: bin("impart", bin("inmultesc", ref("latime"), ref("inaltime")), num(1_000_000)),
    },
  );
  assert.equal(val(ref("suprafata"), ctx), 8.96);
  const pret = val(bin("inmultesc", ref("suprafata"), ref("pretMp")), ctx);
  assert.equal(round2(pret), 797.44);
  // Si ca aritmetica de mana da acelasi lucru, deci motorul nu inventeaza nimic.
  assert.equal(pret, mpDinMmp(3500 * 2560) * 89);
});

/* ── Referinte si calcule intermediare ───────────────────────────────────── */

test("referinta ia valoarea campului", () => {
  assert.equal(val(ref("l"), cu({ l: 42 })), 42);
});

test("un calcul intermediar se desface la cerere", () => {
  const ctx = cu({ a: 3, b: 4 }, { suma: bin("adun", ref("a"), ref("b")) });
  assert.equal(val(bin("inmultesc", ref("suma"), num(2)), ctx), 14);
});

test("acelasi calcul cerut de doua ramuri NU e ciclu", () => {
  /*
   * Paza de ciclu tine de DRUMUL curent, nu de o multime globala. Altfel `suprafata + suprafata`
   * ar fi fost respins ca bucla, desi e perfect legitim.
   */
  const ctx = cu({ a: 5 }, { dublu: bin("inmultesc", ref("a"), num(2)) });
  assert.equal(val(bin("adun", ref("dublu"), ref("dublu")), ctx), 20);
});

test("valoarea completata BATE calculul cu acelasi id", () => {
  // Un camp completat de cumparator are intaietate: calculul e doar o valoare derivata.
  const ctx = cu({ x: 100 }, { x: num(7) });
  assert.equal(val(ref("x"), ctx), 100);
});

test("o referinta care nu duce nicaieri se spune pe nume", () => {
  const r = evalueaza(ref("nu-exista"), gol);
  assert.ok(!r.ok);
  assert.equal(r.cod, "referinta_lipsa");
  assert.equal(r.id, "nu-exista", "codul trebuie sa spuna CARE referinta lipseste");
});

test("CICLU: A cere B, B cere A", () => {
  const ctx = cu({}, { a: bin("adun", ref("b"), num(1)), b: bin("adun", ref("a"), num(1)) });
  const r = evalueaza(ref("a"), ctx);
  assert.ok(!r.ok);
  assert.equal(r.cod, "ciclu");
});

test("CICLU: un calcul care se cheama pe sine", () => {
  const ctx = cu({}, { x: bin("inmultesc", ref("x"), num(2)) });
  assert.equal(cod(ref("x"), ctx), "ciclu");
});

test("CICLU lung: A -> B -> C -> A", () => {
  const ctx = cu({}, { a: ref("b"), b: ref("c"), c: ref("a") });
  assert.equal(cod(ref("a"), ctx), "ciclu");
});

/* ── Ce NU are voie sa iasa ──────────────────────────────────────────────── */

test("impartirea la zero e EROARE, nu infinit", () => {
  assert.equal(cod(bin("impart", num(1), num(0))), "impartire_la_zero");
  assert.equal(cod(bin("impart", num(0), num(0))), "impartire_la_zero");
});

test("si MINUS zero e zero", () => {
  // `Object.is(-0, 0)` e fals; comparatia din motor foloseste `===`, care le socoteste egale.
  assert.equal(cod(bin("impart", num(1), num(-0))), "impartire_la_zero");
  assert.equal(cod(bin("impart", num(1), { k: "neg", a: num(0) })), "impartire_la_zero");
});

test("revarsarea peste limita numerelor iese ca eroare, nu ca Infinity", () => {
  const urias = num(1e308);
  assert.equal(cod(bin("inmultesc", urias, num(10))), "rezultat_nefinit");
  assert.equal(cod(bin("adun", urias, urias)), "rezultat_nefinit");
});

test("un numar stricat din baza nu trece de poarta", () => {
  // In `jsonb` poate ajunge orice; `{k:"numar"}` nu e o garantie.
  assert.equal(cod({ k: "numar", v: Number.NaN }), "rezultat_nefinit");
  assert.equal(cod({ k: "numar", v: Number.POSITIVE_INFINITY }), "rezultat_nefinit");
  assert.equal(cod(ref("x"), cu({ x: Number.NaN })), "rezultat_nefinit");
});

test("un fel de nod necunoscut opreste calculul, nu-l ghiceste", () => {
  assert.equal(cod({ k: "radical", a: num(4) } as unknown as Expresie), "nod_necunoscut");
  assert.equal(cod(bin("ridic" as never, num(2), num(3))), "nod_necunoscut");
});

/* ── Rotunjire ───────────────────────────────────────────────────────────── */

test("rotunjire la intreg", () => {
  assert.equal(val(rot("rotunjesc", num(2.4))), 2);
  assert.equal(val(rot("rotunjesc", num(2.6))), 3);
  assert.equal(val(rot("insus", num(2.1))), 3);
  assert.equal(val(rot("injos", num(2.9))), 2);
});

test("Math.round rotunjeste catre PLUS infinit la egalitate — scris pe fata", () => {
  /*
   * `round(2,5)` da 3, dar `round(-2,5)` da -2, nu -3. E purtarea specificata, deci si cea
   * deterministica intre browser si server. Proba exista ca nimeni sa n-o „repare".
   */
  assert.equal(val(rot("rotunjesc", num(2.5))), 3);
  assert.equal(val(rot("rotunjesc", num(-2.5))), -2);
  assert.equal(val(rot("rotunjesc", num(3.5))), 4);
});

test("rotunjire la un PAS: suprafata facturata la jumatate de metru patrat", () => {
  assert.equal(val(rot("insus", num(8.96), num(0.5))), 9);
  assert.equal(val(rot("insus", num(8.2), num(0.5))), 8.5);
  assert.equal(val(rot("injos", num(8.96), num(0.5))), 8.5);
  assert.equal(val(rot("rotunjesc", num(8.96), num(0.5))), 9);
});

test("rotunjire la un PAS: pretul la 5 lei", () => {
  assert.equal(val(rot("insus", num(797.44), num(5))), 800);
  assert.equal(val(rot("injos", num(797.44), num(5))), 795);
});

test("un pas de zero sau negativ se refuza pe fata", () => {
  assert.equal(cod(rot("rotunjesc", num(10), num(0))), "pas_nevalid");
  assert.equal(cod(rot("rotunjesc", num(10), num(-5))), "pas_nevalid");
  assert.equal(cod(rot("rotunjesc", num(10), num(Number.NaN))), "rezultat_nefinit");
});

test("suprafata minima facturabila, scrisa cu maxim", () => {
  // „Se factureaza cel putin 2 m², oricat de mic ar fi fototapetul."
  const ctx = cu({ suprafata: 0.8 });
  assert.equal(val(bin("maxim", ref("suprafata"), num(2)), ctx), 2);
  assert.equal(val(bin("maxim", num(8.96), num(2))), 8.96);
});

/* ── Plafoane de siguranta ───────────────────────────────────────────────── */

test("un arbore prea adanc se opreste", () => {
  let e: Expresie = num(1);
  for (let i = 0; i < MAX_ADANCIME + 5; i++) e = bin("adun", e, num(1));
  assert.equal(cod(e), "prea_adanc");
});

test("un arbore adanc DAR sub plafon merge", () => {
  let e: Expresie = num(0);
  // `bin` adauga cate un nivel; se ramane confortabil sub plafon.
  for (let i = 0; i < MAX_ADANCIME - 5; i++) e = bin("adun", e, num(1));
  assert.equal(val(e), MAX_ADANCIME - 5);
});

test("un lant lung de calcule intermediare se opreste tot pe adancime", () => {
  // Fiecare desfacere de referinta consuma un nivel, deci lantul nu poate fi nesfarsit.
  const c: Record<string, Expresie> = {};
  for (let i = 0; i < MAX_ADANCIME + 5; i++) c[`n${i}`] = ref(`n${i + 1}`);
  c[`n${MAX_ADANCIME + 5}`] = num(1);
  assert.equal(cod(ref("n0"), cu({}, c)), "prea_adanc");
});

/* ── Masuratori, pentru validatorul de publicare ─────────────────────────── */

test("numaraNoduri si adancimea", () => {
  assert.equal(numaraNoduri(num(1)), 1);
  assert.equal(numaraNoduri(bin("adun", num(1), num(2))), 3);
  assert.equal(adancimea(num(1)), 1);
  assert.equal(adancimea(bin("adun", num(1), num(2))), 2);
  assert.equal(adancimea(bin("adun", bin("adun", num(1), num(2)), num(3))), 3);
  // Pasul de rotunjire e si el un copil, deci se numara.
  assert.equal(numaraNoduri(rot("insus", num(1), num(5))), 3);
  assert.equal(numaraNoduri(rot("insus", num(1))), 2);
});

test("numaratoarea nu se pierde intr-un arbore urias", () => {
  let e: Expresie = num(1);
  for (let i = 0; i < MAX_NODURI; i++) e = bin("adun", e, num(1));
  // Se opreste la plafon in loc sa numere la nesfarsit.
  assert.ok(numaraNoduri(e) > MAX_NODURI);
  assert.ok(adancimea(e) > MAX_ADANCIME);
});

test("referinteleDin le strange pe toate, o singura data", () => {
  const e = bin("adun", bin("inmultesc", ref("l"), ref("h")), ref("l"));
  assert.deepEqual([...referinteleDin(e)].sort(), ["h", "l"]);
  assert.deepEqual([...referinteleDin(num(1))], []);
  assert.deepEqual([...referinteleDin(rot("insus", ref("a"), ref("pas")))].sort(), ["a", "pas"]);
});

/* ── Determinism ─────────────────────────────────────────────────────────── */

test("acelasi arbore da acelasi numar, de fiecare data", () => {
  /*
   * Rostul intregului fisier: browserul si serverul ruleaza CHIAR ASTA, deci rezultatul nu are
   * voie sa depinda de nimic din afara arborelui si a contextului.
   */
  const e = bin("impart", bin("inmultesc", ref("l"), ref("h")), num(1_000_000));
  const ctx = cu({ l: 3500, h: 2560 });
  const intai = val(e, ctx);
  for (let i = 0; i < 100; i++) assert.equal(val(e, ctx), intai);
  assert.equal(intai, 8.96);
});
