import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   REPARAREA TACERII PUTEA PRODUCE O CADERE MAI MARE (27.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Citirile din baza ARUNCA acum, in loc sa intoarca `null` - altfel o pana de-o clipa trecea drept
   „nu exista" si se luau hotarari pe ea. Dar aruncarea trebuie sa aiba unde sa cada, si erau trei
   locuri unde n-avea:

     1. `processQueueItem` - fara plasa, aruncarea iesea din bucla magazinelor si oprea pasii 2, 3
        si 4 pentru TOATA platforma;
     2. pasii 2, 3 si 4 din cron - la fel, un magazin ii dobora pe ceilalti;
     3. `reconciliazaComenzile` - prima comanda picata oprea lotul SI sarea peste scrierea lui
        `reintrebat_la`, deci aceleasi douazeci de comenzi reveneau la nesfarsit. Roata nu se mai
        invartea.

   ⚠ A treia e cea mai urata, fiindca nu se vede: nimic nu pare stricat, doar ca restul comenzilor
   nu mai sunt reintrebate NICIODATA.
*/

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/^[ \t]*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const sync = viu("src/lib/aboutyou/sync.ts");
const cron = viu("src/app/api/cron/aboutyou-sync/route.ts");
const orders = viu("src/lib/aboutyou/orders.ts");

test("⚠ citirea picata devine `trecatoare` la marginea lucratorului de coada", () => {
  /*
   * Regula e scrisa chiar in `rand-citit.ts`: „se prinde intr-un singur loc, la marginea lui
   * `trimiteElement`, si devine verdictul `trecatoare` - cel care nu arde nicio incercare".
   * Prinsa mai adanc, fiecare citire ar fi trebuit sa stie ce sa faca, si una uitata ar fi lasat
   * gaura la loc.
   */
  assert.match(sync, /if \(e instanceof EroareCitireBaza\) \{\s*return \{ ok: false, error: e\.message, status: 0 \};/);
  assert.match(sync, /return await trimiteElement\(admin, ctx, item\);/);
  /* Si `0` e chiar codul pe care cronul il stie trecator. */
  assert.match(cron, /eTrecatoare\(res\.status\)/);
});

test("⚠ un magazin picat nu-i doboara pe ceilalti, la niciun pas", () => {
  assert.match(cron, /async function peMagazin\(businessId: string, pas: string, treaba: \(\) => Promise<void>\)/);
  for (const pas of ["loturi", "reconciliere", "comenzi"]) {
    assert.ok(cron.includes(`peMagazin(businessId, "${pas}"`), `pasul ${pas} nu e izolat`);
  }
  /* ⚠ Si nu e o inghitire: se scrie si se numara. */
  assert.match(cron, /a picat pentru un magazin/);
  assert.match(cron, /failed\+\+;/);
});

test("⚠ marcajul comenzilor NU se muta cand aducerea a picat", () => {
  /* Mutat, comenzile din fereastra aia n-ar mai fi cerute niciodata. */
  assert.match(cron, /if \(pr == null\) \{ await pause\(PACE_MS\); continue; \}/);
  const i = cron.indexOf("if (pr == null)");
  /* ⚠ Ancora e SCRIEREA marcajului, nu prima aparitie a numelui: prima e CITIREA lui, cu vreo opt
     randuri mai sus, iar pe ea proba trecea pe dos si eu am crezut o clipa ca e codul de vina. */
  const j = cron.indexOf("patchAboutYouConfig(admin, businessId, { orders_synced_at:");
  assert.ok(i > 0 && j > i, "iesirea trebuie sa fie inaintea scrierii marcajului");
});

test("⚠ si o comanda picata nu mai tine roata reconcilierii pe loc", () => {
  /*
   * Reconcilierea e o PLASA, nu calea principala: o comanda care nu se poate citi acum se
   * reintreaba peste o tura, dupa ce roata s-a invartit. Ce n-are voie e sa opreasca lotul.
   */
  const i = orders.indexOf("for (const r of deIntrebat)");
  const bucata = orders.slice(i, i + 1200);
  assert.match(bucata, /try \{/);
  assert.match(bucata, /picate\+\+;/);
  /* Si scrierea lui `reintrebat_la` vine DUPA bucla, deci se face oricum. */
  assert.ok(orders.indexOf("reintrebat_la: new Date().toISOString()") > i);
});

test("⚠ toate picate inseamna o cauza comuna, si se spune ca atare", () => {
  /* Nu e o comanda proasta: e cheia invalidata sau o pana la ei. `critical`, o data. */
  assert.match(orders, /if \(picate > 0 && verificate === 0 && deIntrebat\.length > 0\) \{/);
  assert.match(orders, /niciuna din cele \$\{deIntrebat\.length\} comenzi reintrebate/);
});
