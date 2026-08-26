import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fereastraComenzi } from "./orders";
import { marcajUrmator } from "@/lib/marketplace/marcaj";

/* ══════════════════════════════════════════════════════════════════════════
   O INTRERUPERE MAI LUNGA DE DOUA SAPTAMANI PIERDEA COMENZILE DEFINITIV
   ══════════════════════════════════════════════════════════════════════════

   Trendyol nu ingaduie o fereastra mai lunga de doua saptamani. Codul se ingrijea de INCEPUT:
   un magazin oprit o luna cerea ultimele doua saptamani in loc sa primeasca eroare la fiecare
   trecere. Corect.

   ⚠ Dar sfarsitul ramanea „acum", iar dupa o trecere REUSITA marcajul sarea tot acolo. Deci:

       ultima sincronizare   1 august
       cronul revine        31 august
       se citeste           17 august -> 31 august
       marcajul ajunge      31 august

   Cele saisprezece zile dintre 1 si 17 august nu se mai citeau NICIODATA. Nu incet, nu cu o
   eroare — definitiv, si tocmai pentru magazinul care avea cel mai mult nevoie de recuperare.

   ⚠ „Lasam pasul urmator sa continue" era o presupunere pe care n-o verifica nimeni: nimic nu
   continua, fiindca marcajul trecuse deja de gaura.
*/

const ZI = 24 * 60 * 60 * 1000;
const ACUM = Date.UTC(2026, 7, 31, 12, 0, 0);

test("⚠ o gaura de douazeci de zile se recupereaza fereastra cu fereastra", () => {
  /* Douazeci de zile: mai mult decat fereastra lor de paisprezece, dar sub orizontul de o luna
     — adica exact cazul in care recuperarea CHIAR e cu putinta si nu se facea. */
  const deLa = ACUM - 20 * ZI;

  const f1 = fereastraComenzi(deLa, ACUM);
  assert.equal(f1.startDate, deLa, "porneste de unde a ramas");
  assert.equal(f1.endDate, deLa + 14 * ZI, "si se opreste la paisprezece zile, nu la „acum”");
  assert.equal(f1.taiat, false, "nimic nu s-a pierdut");

  /* ⚠ Marcajul se opreste la sfarsitul ferestrei CITITE, nu la clipa de start a rularii. */
  const m1 = marcajUrmator(
    { ok: true, fereastraSfarsitMs: f1.endDate },
    { runStartMs: ACUM, overlapMs: 60_000 },
  );
  assert.equal(m1, f1.endDate);

  /* A doua trecere continua de-acolo si ajunge din urma. */
  const f2 = fereastraComenzi(m1!, ACUM);
  assert.equal(f2.startDate, deLa + 14 * ZI);
  assert.equal(f2.endDate, ACUM, "ultima fereastra se inchide la prezent");
  assert.equal(
    marcajUrmator({ ok: true, fereastraSfarsitMs: f2.endDate }, { runStartMs: ACUM, overlapMs: 60_000 }),
    ACUM,
    "si abia atunci marcajul ajunge la zi",
  );
});

test("⚠ peste orizontul lor, pierderea se SPUNE, nu se ascunde", () => {
  /*
   * Capatul clasic da date doar pe ultima luna: „Erişilebilir veri kapsamı son 1 ay ile
   * sınırlandırılacaktır". Peste atat, ei pur si simplu nu mai au ce sa ne dea.
   *
   * ⚠ O pierdere pe care n-o putem evita e cu totul altceva decat una pe care o ascundem.
   * `taiat` iese `true`, iar apelantul striga `critical` in jurnal.
   */
  const f = fereastraComenzi(ACUM - 60 * ZI, ACUM);
  assert.equal(f.taiat, true);
  assert.ok(f.startDate >= ACUM - 30 * ZI, "nu se cere mai in urma decat tin ei");

  const orders = readFileSync("src/lib/trendyol/orders.ts", "utf8");
  assert.match(orders, /if \(taiat\) \{/);
  assert.match(orders, /nu se mai pot aduce/);
  assert.match(orders, /severity: "critical"/);
});

test("⚠ mersul obisnuit nu se schimba cu nimic", () => {
  /* Un magazin sincronizat acum cinci minute cere exact fereastra aia si ajunge la zi dintr-o
     data. Toata reparatia e pentru cazul rar; cazul des n-are voie s-o simta. */
  const deLa = ACUM - 5 * 60_000;
  const f = fereastraComenzi(deLa, ACUM);
  assert.equal(f.startDate, deLa);
  assert.equal(f.endDate, ACUM);
  assert.equal(
    marcajUrmator({ ok: true, fereastraSfarsitMs: f.endDate }, { runStartMs: ACUM, overlapMs: 60_000 }),
    ACUM,
  );
});

test("⚠ prima sincronizare cere cel mult doua saptamani", () => {
  /* Fara marcaj, se cer ultimele doua saptamani — nu tot istoricul, pe care ei l-ar refuza. */
  const f = fereastraComenzi(undefined, ACUM);
  assert.ok(f.startDate >= ACUM - 14 * ZI, "nu mai devreme de plafonul lor");
  assert.equal(f.endDate, ACUM);
});

test("⚠ marcajul nu trece NICIODATA de unde s-a citit", () => {
  /*
   * Regula in doua cuvinte. `Math.min` intre clipa de start a rularii si sfarsitul ferestrei —
   * oricare ar fi mai devreme.
   */
  const sfarsit = ACUM - 10 * ZI;
  assert.equal(
    marcajUrmator({ ok: true, fereastraSfarsitMs: sfarsit }, { runStartMs: ACUM, overlapMs: 60_000 }),
    sfarsit,
  );
  /* ⚠ Si fara campul asta, purtarea ramane cea veche: integrarile care nu taie fereastra
     (eMAG, About You) n-au de ce sa se schimbe. */
  assert.equal(
    marcajUrmator({ ok: true }, { runStartMs: ACUM, overlapMs: 60_000 }),
    ACUM,
  );
});

test("⚠ trunchierea are in continuare ultimul cuvant", () => {
  /* Cand nu s-a citit tot, cursorul comenzilor bate sfarsitul ferestrei — altfel s-ar sari
     peste paginile necitite, chiar capcana pentru care exista functia. */
  assert.equal(
    marcajUrmator(
      { ok: false, cursorMs: ACUM - 20 * ZI, fereastraSfarsitMs: ACUM - 10 * ZI },
      { runStartMs: ACUM, overlapMs: 60_000 },
    ),
    ACUM - 20 * ZI + 60_000,
  );
});

test("⚠ si retururile recupereaza la fel", () => {
  const mod = readFileSync("src/lib/trendyol/retururi.ts", "utf8");
  assert.match(mod, /const pana_la = Math\.min\(de_la \+ latime, acum\);/);
  assert.match(mod, /endDate: pana_la/);
  assert.match(mod, /const panaLa = Math\.min\(inceput, r\.fereastraSfarsitMs\);/);
});

test("⚠ un magazin cu baza cazuta nu mai opreste tot cronul", () => {
  /*
   * `loadTrendyolContext` a devenit strict — si asa trebuie. Dar aruncarea urca pana in bucla
   * cronului, care n-o prinde: un glitch pe UN magazin oprea trecerea pentru TOATE.
   *
   * ⚠ Si NU se pune in cache: `null` acolo ar fi insemnat „am intrebat si nu e conectat", iar
   * pasii de mai jos din aceeasi trecere l-ar fi sarit pe toti.
   */
  const cron = readFileSync("src/app/api/cron/trendyol-sync/route.ts", "utf8");
  const i = cron.indexOf("async function ctxFor(");
  const f = cron.slice(i, cron.indexOf("// ── 1)", i));
  assert.match(f, /try \{/);
  assert.match(f, /catch \(e\) \{/);
  assert.match(f, /return null;/);
  const iCatch = f.indexOf("catch (e) {");
  assert.doesNotMatch(f.slice(iCatch), /ctxCache\.set/, "esecul nu se tine minte");
});
