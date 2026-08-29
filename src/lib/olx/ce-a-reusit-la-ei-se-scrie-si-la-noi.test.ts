import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   „S-A FACUT LA EI, DAR NU S-A SCRIS LA NOI" NU E UN SUCCES (30.08.2026, tarziu)
   ══════════════════════════════════════════════════════════════════════════

   Scrierile locale de dupa un apel remote reusit mergeau oarbe, iar functia raporta `ok`. Cronul
   stergea atunci elementul din coada — deci nimic nu mai reincerca, si starea locala ramanea in
   urma pentru totdeauna.

   ⚠ CEL MAI SCUMP EXEMPLU E CHIAR LEACUL DE IERI:

       stoc 5 -> 0 -> OLX dezactiveaza ✅
       scrierea lui `dezactivat_de = "stoc"` PICA ❌ -> se raporteaza `ok`, coada se goleste
       mai tarziu randul spune `removed_by_user` cu `dezactivat_de` NULL
       iar `null` se citeste prudent, ca „omul a hotarat"
       -> stocul se intoarce, anuntul NU se mai reactiveaza niciodata

   Adica insusirea reparata ieri, pierduta printr-o singura eroare de baza.

   ⚠ RELUAREA E SIGURA, si de-aia `permanent: false`: comenzile OLX sunt idempotente — a dezactiva
   un anunt deja dezactivat raspunde `400 invalid status`, pe care il tratam ca „gata".
*/

const sync = readFileSync("src/lib/olx/sync.ts", "utf8");
const oauth = readFileSync("src/lib/olx/oauth.ts", "utf8");
const client = readFileSync("src/lib/olx/client.ts", "utf8");
const actiuni = readFileSync("src/lib/actions/olx.actions.ts", "utf8");

/** Corpul unei functii din `sync.ts`, pana la urmatoarea declaratie de acelasi fel. */
function corpul(nume: string): string {
  const i = sync.indexOf(`function ${nume}(`);
  assert.notEqual(i, -1, `n-am gasit ${nume}`);
  const j = sync.indexOf("\nasync function", i + 10);
  const k = sync.indexOf("\nexport async function", i + 10);
  const sfarsit = Math.min(j > 0 ? j : sync.length, k > 0 ? k : sync.length);
  return sync.slice(i, sfarsit);
}

test("⚠ dezactivarea nu se raporteaza reusita daca motivul nu s-a scris", () => {
  const corp = corpul("deactivateRemote");
  assert.match(corp, /const scris = await scrieStareaLocala\(admin, row\.id, \{[\s\S]{0,220}?dezactivat_de: sursa/);
  assert.match(corp, /if \(!scris\.ok\) return scris;/,
    "un `ok` peste o scriere picata goleste coada si pierde motivul pe veci");
  /* ⚠ Si ramura `400` („deja inactiv") la fel: si ea scrie o stare pe care ne bizuim. */
  assert.equal((corp.match(/if \(!scris\.ok\) return scris;/g) ?? []).length, 2);
});

test("⚠ activarea stinge motivul dezactivarii", () => {
  /*
   * ⚠ Lasat, `dezactivat_de` ramanea „stoc" pe un anunt ACTIV. Iar daca mai tarziu comerciantul
   * intra pe OLX si il dezactiveaza EL, sondarea vede `removed_by_user` peste un motiv invechit —
   * si il reactivam noi, desfacand hotararea lui. Motivul apartine dezactivarii curente.
   */
  const corp = corpul("activateRemote");
  assert.match(corp, /status: "new", dezactivat_de: null,/);
  assert.match(corp, /if \(!scris\.ok\) return scris;/);
});

test("⚠ un `404` inseamna ca omul l-a sters pe OLX, nu ca poate fi recreat", () => {
  /*
   * Randul se STERGEA, iar cu el si singura urma a hotararii lui. Coada se umple dupa fiecare
   * editare de pret, deci la prima atingere a produsului `getRow` nu gasea nimic, se intra pe
   * ramura de creare, si anuntul REAPAREA — impotriva a ceea ce facuse el in contul lui.
   */
  const corp = corpul("refreshAdvertStatus");
  /*
   * ⚠ Fereastra e larga dinadins: intre `404` si scrierea pietrei sta o nota lunga, iar o limita
   * strans potrivita pe lungimea comentariului de azi ar pica maine, la prima reformulare — fara ca
   * regula sa se fi schimbat cu ceva.
   */
  const i404 = corp.indexOf("res.status === 404");
  assert.ok(i404 > 0, "ramura de 404 a disparut");
  const ramura404 = corp.slice(i404, corp.indexOf("return;", i404));
  assert.match(ramura404, /sters_de_om_la: now/);
  assert.match(ramura404, /status: "sters_de_om"/);
  assert.doesNotMatch(corp, /\.delete\(\)\.eq\("id", rowId\)/,
    "stergerea randului ia cu ea urma hotararii omului");
});

test("⚠ o dezactivare facuta direct pe OLX se insemneaza ca fiind a omului", () => {
  /*
   * ⚠ Daca noi am stins anuntul, `deactivateRemote` a scris deja `dezactivat_de`. Deci un
   * `removed_by_user` aparut la sondare, peste un rand care nu era asa si n-are motiv scris, nu
   * poate veni decat din contul lui.
   */
  const corp = corpul("refreshAdvertStatus");
  assert.match(corp, /const aStinsElInsusi = stareaLor === "removed_by_user"/);
  assert.match(corp, /inainte\?\.status !== "removed_by_user"/);
  assert.match(corp, /\(inainte\?\.dezactivat_de \?\? null\) === null/);
  assert.match(corp, /\.\.\.\(aStinsElInsusi \? \{ dezactivat_de: "om" \} : \{\}\)/);
  /* ⚠ Si cronul chiar ii da ce stia dinainte — altfel paza n-ar avea cu ce compara. */
  const cron = readFileSync("src/app/api/cron/olx-sync/route.ts", "utf8");
  assert.match(cron, /\.select\("id, business_id, olx_advert_id, status, dezactivat_de"\)/);
  assert.match(cron, /\{ status: row\.status, dezactivat_de: row\.dezactivat_de \}/);
});

test("⚠ `invalid_grant` inseamna chiar `invalid_grant`", () => {
  /*
   * ⚠ `invalidGrant` duce la `needs_reconnect`. Dar OLX raspunde `400` si pentru `invalid_client`,
   * `invalid_scope`, `invalid_request`, iar `401` si pentru un antet gresit. Un `400` venit dintr-o
   * greseala de-a NOASTRA in configurarea aplicatiei ar fi trimis TOTI comerciantii sa reconecteze
   * conturi perfect sanatoase.
   */
  assert.match(oauth, /invalidGrant: data\.error === "invalid_grant",/);
  assert.doesNotMatch(oauth, /invalidGrant:[^\n]*res\.status === 400/);
});

test("⚠ cine pierde cursa rotatiei nu declara sesiunea moarta", () => {
  /*
   * Doua fire pornesc cu R1. Primul primeste R2 si scrie. Al doilea cere tot cu R1 — deja consumat
   * — si primeste `invalid_grant`. Pana azi scria `needs_reconnect` peste configul SANATOS al
   * primului. Iar CAS-ul nu-l prindea, fiindca iesea inainte de el.
   */
  const i = oauth.indexOf("if (res.invalidGrant) {");
  assert.notEqual(i, -1);
  const ramura = oauth.slice(i, oauth.indexOf("needsReconnect: true };", i) + 30);
  assert.match(ramura, /const proaspat = await citesteConfig\(db, businessId\);/);
  assert.match(ramura, /const altcinevaARotit = proaspat != null[\s\S]{0,220}?token_updated_at/);
  /* ⚠ Si intoarcerea „tokenul lui e bun" vine INAINTEA marcarii reconectarii. */
  const iBun = ramura.indexOf("return { token: proaspat.access_token");
  const iRau = ramura.indexOf("needs_reconnect: true");
  assert.ok(iBun > 0 && iRau > iBun, "vestea proasta se da numai dupa ce am intrebat martorul");
});

test("⚠ setarile trimit un petic, nu configul intreg", () => {
  /*
   * ⚠ Comentariul spunea „PETIC, NU CONFIG INTREG" — dar obiectul incepea cu `...config`, deci
   * peticul purta si `refresh_token`-ul citit cu o clipa inainte. `jsonb_merge_config` nu ajuta cu
   * nimic cand peticul E configul vechi:
   *
   *     Setarile citesc R1 -> cronul roteste R1 -> R2 -> omul salveaza telefonul
   *     -> peticul contine R1 -> R2 e inlocuit, si conexiunea moare
   */
  const i = actiuni.indexOf("export async function saveOlxSettings");
  const corp = actiuni.slice(i, actiuni.indexOf("\nexport ", i + 10));
  assert.doesNotMatch(corp, /\.\.\.config,/, "peticul n-are voie sa poarte configul vechi");
  assert.match(corp, /await patchOlxConfig\(createAdminClient\(\), businessId, next\)/);
  /* ⚠ Si nu poarta niciunul din campurile de sesiune. */
  for (const camp of ["access_token", "refresh_token", "token_updated_at"]) {
    assert.doesNotMatch(corp, new RegExp(`${camp}:`), `peticul poarta \`${camp}\``);
  }
});

test("⚠ o cerere catre OLX are un capat", () => {
  /*
   * Cronul lucreaza cu randuri REVENDICATE, cu termen de cinci minute. O cerere care atarna nu doar
   * ca pierde elementul ei: tine lucratorul ocupat, iar celelalte revendicate cu el asteapta
   * degeaba, si raman marcate pana expira termenul.
   */
  assert.match(client, /signal: AbortSignal\.timeout\(20_000\)/);
});
