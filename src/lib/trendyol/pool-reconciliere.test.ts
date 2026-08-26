import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   DOUA MAGAZINE NU-SI RECONCILIAU NICIODATA APROBARILE (26.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Pasul 3 din cron isi lua magazinele citind `trendyol_listings` cu `.limit(1000)`, ordonat pe
   `business_id`, si deduplica ABIA DUPA. Trunchierea fiind inaintea deduplicarii, rotatia n-o
   repara. Masurat pe datele reale:

       19c5146c    14 randuri   0..13     in pool
       635bc524   986 randuri  14..999    in pool, umple restul
       bdba3cc6    —                      NU AJUNGE NICIODATA
       fa126de4    —                      NU AJUNGE NICIODATA

   Un singur vanzator cu aproape o mie de listari umplea singur fereastra. Celelalte magazine
   nu erau reconciliate mai rar — nu erau reconciliate DELOC. 76 de listari ale lui Okxi stateau
   in `created` de pana la 24 de ore fara ca cineva sa intrebe daca s-au aprobat.

   ⚠ E CHIAR DEFECTUL DESPRE CARE AVERTIZEAZA COMENTARIUL DIN PASUL 4, unde s-a reparat pentru
   comenzi. Aici a ramas — si a doua oara cand un „1000" rotund ascunde o taietura tacuta.
*/

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const cron = viu("src/app/api/cron/trendyol-sync/route.ts");
const mig = readFileSync("migrations/2026-11-03-trendyol-magazine-de-reconciliat.sql", "utf8");

test("⚠ pool-ul de reconciliere NU se mai citeste ca randuri de listari", () => {
  assert.match(cron, /admin\.rpc\("trendyol_magazine_de_reconciliat"\)/);
  /* ⚠ Forma veche, cu tot cu plafonul ei, n-are voie sa se intoarca. */
  assert.doesNotMatch(cron, /from\("trendyol_listings"\)\.select\("business_id"\)/);
  assert.doesNotMatch(cron, /\.order\("business_id", \{ ascending: true \}\)\.limit\(1000\)/);
});

test("⚠ se numara in Postgres: un rand pe MAGAZIN, nu unul pe listare", () => {
  /* Un `group by` intoarce cate un rand pe magazin, deci nu mai exista nimic de trunchiat.
     Numarate ca randuri de listari, PostgREST taie la 1000 si tace. */
  assert.match(mig, /group by l\.business_id/);
  assert.match(mig, /count\(\*\) as cate/);
});

test("⚠ o citire picata NU inseamna „niciun magazin de reconciliat”", () => {
  /*
   * PostgREST nu arunca la refuz. Fara `error`, `pendingBiz` iesea `null`, pool-ul iesea gol,
   * si tot pasul se sarea TACUT — statusurile ar fi stat pe loc fara ca nimeni sa afle de ce.
   */
  const i = cron.indexOf('admin.rpc("trendyol_magazine_de_reconciliat")');
  const f = cron.slice(i, i + 500);
  assert.match(f, /if \(ePending\) \{/);
  assert.match(f, /magazinele de reconciliat nu s-au putut citi/);
});

test("⚠ usa functiei e inchisa", () => {
  assert.match(
    mig,
    /revoke execute on function public\.trendyol_magazine_de_reconciliat\(\) from public, anon, authenticated;/,
  );
});

test("⚠ si pasul de LOTURI avea acelasi plafon, gasit de proba de mai sus", () => {
  /*
   * Proba pentru pasul 3 cerea ca forma veche sa nu se mai gaseasca NICAIERI in cron — si a
   * dat de ea in pasul 2, unde comentariul se ingrijea deja de rotatie. Dar rotatia nu repara
   * o taietura care se face INAINTEA deduplicarii.
   *
   * ⚠ Azi nu doare (zero loturi deschise), dar de azi costa mai mult: stergerea unui produs
   * asteapta confirmarea lotului inainte sa uite listarea, deci un magazin cazut dupa taietura
   * si-ar fi lasat listarile in `removing` pe veci.
   */
  assert.match(cron, /admin\.rpc\("trendyol_magazine_cu_loturi_deschise"\)/);
  assert.match(mig, /from public\.trendyol_batches b/);
  assert.match(cron, /if \(eBatchBiz\) \{/);
});

test("⚠ si pasul de COMENZI ramane pe magazinele conectate, nu pe listari", () => {
  /* Acolo defectul a fost reparat mai demult, si nota lui e chiar cea care l-a dat de gol si pe
     asta. Proba le tine legate, ca sa nu se intoarca niciunul. */
  assert.match(cron, /magazineConectate\(admin, "trendyol_config"\)/);
});
