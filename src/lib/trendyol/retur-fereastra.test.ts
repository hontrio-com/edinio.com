import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   „NU MUT MARCAJUL" NU E ACELASI LUCRU CU „VOI PROGRESA" (26.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Retururile citeau trei pagini de cate cincizeci intr-o trecere — cel mult 150 de cereri. Cand
   fereastra avea mai multe, `ok = false` oprea marcajul, si asta era CORECT: altfel cererile
   necitite ar fi ramas in urma lui.

   ⚠ DAR RETURURILE N-AU CURSOR. Comenzile au: acolo `cursorMs` tine minte pana unde s-a ajuns
   si trecerea urmatoare continua. Aici, trecerea urmatoare relua paginile 0, 1, 2 — ACELEASI.
   Un magazin cu peste 150 de cereri intr-o fereastra ramanea blocat pe primele 150 pentru
   totdeauna, iar restul nu se citeau NICIODATA.

   ⚠ Frana care apara datele devenise ea insasi zidul. Un „ok = false" cinstit, care nu pierde
   nimic, si totusi nu ajunge nicaieri.

   ⚠ SI NU SE POATE FACE CURSOR TEMPORAL. `getClaims` n-are parametru de sortare documentat,
   deci ordinea paginilor nu e garantata; un cursor cladit pe ea ar sari peste cereri fara sa se
   vada. De-aia se ingusteaza FEREASTRA, care e a noastra si o intelegem.
*/

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const mod = viu("src/lib/trendyol/retururi.ts");

test("⚠ cand fereastra nu incape, se INGUSTEAZA — nu se sta pe loc", () => {
  /* Se stie din `totalPages` cat de mult depaseste, deci se taie proportional, cu marja. */
  /* ⚠ Se imparte la CATE pagini s-au citit chiar, nu la constanta: la fundul ferestrei se
     citesc mai multe. Vezi `retur-stramtoare.test.ts`. */
  assert.match(mod, /const depasire = totalPagini \/ paginiDeCitit;/);
  assert.match(mod, /Math\.ceil\(depasire \* 1\.5\)/);
  assert.match(mod, /latimeUrmatoare: stransa/);
});

test("⚠ si ingustarea se TINE MINTE intre treceri", () => {
  /*
   * Ingustata doar in memoria unei treceri, n-ar fi folosit la nimic: trecerea urmatoare ar fi
   * cerut iar doua saptamani, ar fi gasit iar prea multe pagini, si tot asa — exact bucla pe
   * care o reparam.
   */
  assert.match(mod, /claims_fereastra_per_storefront/);
  assert.match(mod, /aduRetururile\(admin, ctxVitrina, marcaj, latimi\[vitrina\]\)/);
  /* ⚠ Se scrie SI cand marcajul n-a avansat: tocmai atunci s-a ingustat fereastra. */
  assert.match(mod, /Object\.keys\(noi\)\.length > 0 \|\| Object\.keys\(latimiNoi\)\.length > 0/);
});

test("⚠ dar se LARGESTE inapoi cand incape", () => {
  /* Un varf de retururi trece. N-are rost sa ramanem pe ferestre de-o ora pentru totdeauna. */
  assert.match(mod, /Math\.min\(latime \* 2, FEREASTRA_MAXIMA_MS\)/);
});

test("⚠ si nu coboara sub o ora", () => {
  /* Sub atat, ar insemna peste 150 de cereri intr-o ora la un singur magazin — si atunci
     problema nu mai e paginarea. */
  assert.match(mod, /const FEREASTRA_MINIMA_MS = 60 \* 60 \* 1000;/);
  assert.match(mod, /Math\.max\(\s*FEREASTRA_MINIMA_MS,/);
  assert.match(mod, /Math\.max\(latimeCeruta \?\? FEREASTRA_MAXIMA_MS, FEREASTRA_MINIMA_MS\)/);
});

test("⚠ suprapunerea se aplica O SINGURA data", () => {
  /*
   * Marcajul se SCRIE deja compensat cu cinci minute. Scazute inca o data la citire, ieseau
   * zece minute de suprapunere la fiecare trecere — nu se pierdea nimic, dar erau cereri si
   * munca degeaba, la fiecare zece minute, pentru totdeauna.
   */
  const i = mod.indexOf("const cerut =");
  const f = mod.slice(i, i + 200);
  assert.match(f, /\? marcajMs$/m, "marcajul se ia asa cum e");
  assert.doesNotMatch(f, /marcajMs - 5 \* 60_000/);
  /* ⚠ Si se scrie compensat, o data, la celalalt capat. */
  assert.match(mod, /new Date\(panaLa - 5 \* 60_000\)\.toISOString\(\)/);
});
