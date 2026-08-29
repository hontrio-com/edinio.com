import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   O INTENTIE SCRISA NU SE ARUNCA, SI O REZERVA NU REPETA DEFECTUL (31.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Runda a cincea de audit. Sub toate punctele ei sta aceeasi intrebare: cand doua lucruri
   trebuie sa se intample impreuna si numai unul reuseste, ce se face cu celalalt?

     - retragerea se scrie in coada, dar `DELETE`-ul produsului pica
     - `PUT`-ul reuseste, dar reactivarea de dupa el nu
     - imbinarea atomica nu se poate rula, si „rezerva" e chiar citeste-modifica-scrie
     - CAS-ul nu se poate rula, si caderea scrie fara conditie
*/

const sync = readFileSync("src/lib/olx/sync.ts", "utf8");
const oauth = readFileSync("src/lib/olx/oauth.ts", "utf8");
const config = readFileSync("src/lib/olx/config.ts", "utf8");
const cron = readFileSync("src/app/api/cron/olx-sync/route.ts", "utf8");
const actiuni = readFileSync("src/lib/actions/olx.actions.ts", "utf8");

function faraComentarii(t: string): string {
  return t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

/* ── Retragerea scrisa inaintea stergerii ────────────────────────────────── */

test("⚠ o retragere din coada se face doar daca produsul chiar a disparut", () => {
  /*
   * `deleteProduct` si stergerea in masa scriu intai lucrarea de retragere — dinadins, ca un produs
   * sters sa nu ramana la vanzare pe OLX. Dar cele doua nu sunt legate tranzactional:
   *
   *     retragerea se scrie in coada ✅
   *     `DELETE` pe `products` PICA (timeout, constrangere) ❌
   *     omul vede „Eroare la stergere", si produsul e tot acolo
   *     cronul executa oricum: dezactiveaza, STERGE anuntul, pune piatra
   *     -> produs viu in Edinio, anunt mort la OLX, cu istoricul si mesajele lui
   *
   * ⚠ La stergerea IN MASA e mai rau: `DELETE` merge pe bucati, iar o bucata picata la mijloc lasa
   * sute de produse vii cu retragerea deja scrisa pentru toate.
   */
  assert.match(sync, /async function stergeDacaProdusulChiarNuMaiE\(/);
  const i = sync.indexOf("async function stergeDacaProdusulChiarNuMaiE");
  const corp = sync.slice(i, sync.indexOf("\nexport async function processQueueItem", i));
  assert.match(corp, /\.from\("products"\)\.select\("id"\)/);
  assert.match(corp, /\.eq\("business_id", item\.business_id\)\.eq\("id", item\.offer_id\)/);
  /* ⚠ Si ramura de delete chiar trece prin ea. */
  assert.match(sync, /case "delete":\n {6}return stergeDacaProdusulChiarNuMaiE\(admin, ctx, item\);/);
});

test("⚠ „inca exista” inseamna „nu inca”, nu „nu e nimic de facut”", () => {
  /*
   * ═══ AICI E TOT ROSTUL, SI PRIMA VARIANTA IL RATASE ═══
   *
   * Intorsesem `{ ok: true, action: "skipped" }`. Gresit, si tocmai pe dos: `ok` face cronul sa
   * STEARGA randul din coada — adica arunca chiar intentia durabila scrisa INAINTE de `DELETE`.
   * Doua ferestre reale o pierdeau:
   *
   *   (a) stergerea in masa sterge pe bucati de cate sase sute, secunde bune; cronul porneste in
   *       fiecare minut si nu e sincronizat cu nimic. O trecere cazuta la mijloc vede produsele
   *       inca nesterse, arunca retragerile, iar `DELETE`-ul reuseste o clipa mai tarziu.
   *   (b) la magazinele cu `auto_sync` stins, randul asta e SINGURA retragere care va exista
   *       vreodata: amandoua plasele de dupa stergere ies devreme pe comutator, iar retragerea
   *       dinaintea stergerii il ignora dinadins.
   */
  const i = sync.indexOf("async function stergeDacaProdusulChiarNuMaiE");
  const corp = faraComentarii(sync.slice(i, sync.indexOf("\nexport async function processQueueItem", i)));
  const iInca = corp.indexOf("if (inca)");
  assert.ok(iInca > 0, "paza a disparut");
  const ramura = corp.slice(iInca, corp.indexOf("return removeRemote", iInca));
  assert.doesNotMatch(ramura, /ok: true/,
    "un `ok` aici goleste coada si arunca intentia scrisa inaintea stergerii");
  assert.match(ramura, /ok: false, permanent: false, asteptare:/,
    "se amana: nu e un esec al lucrarii, e o stare care inca nu s-a asezat");
  /* ⚠ Si o citire picata NU inseamna „produsul nu mai e": atunci nu se sterge nimic la ei. */
  assert.match(corp, /if \(eProdus\) \{[\s\S]{0,200}?ok: false, permanent: false,/);
});

test("⚠ butonul „Șterge anunțul” NU trece prin paza asta", () => {
  /*
   * ⚠ Acolo omul vrea ANUME anuntul sters, cu produsul pastrat. Paza e numai pe `op: "delete"` din
   * coada, si tocmai fiindca `deleteAdvertNow` merge direct la `removeRemote`, fara coada.
   */
  assert.match(sync, /export async function deleteAdvertNow\([\s\S]{0,300}?removeRemote\(admin, ctx, businessId, await getRow/);
  const i = sync.indexOf("export async function deleteAdvertNow");
  const corp = sync.slice(i, i + 400);
  assert.doesNotMatch(corp, /stergeDacaProdusulChiarNuMaiE/,
    "paza pusa aici ar face butonul sa nu mai stearga niciodata nimic");
});

/* ── Reactivarea ─────────────────────────────────────────────────────────── */

test("⚠ rezultatul reactivarii se citeste", () => {
  /*
   * Se chema si se arunca, iar mai jos se intorcea `ok`. Deci cronul stergea lucrarea din coada,
   * si tocmai drumul cel mai obisnuit ramanea neterminat:
   *
   *     stoc 10 -> 0   -> OLX dezactiveaza, `dezactivat_de = "stoc"`
   *     stoc 0  -> 10  -> `PUT` reuseste ✅, reactivarea da 429 sau 500 ❌
   *     -> se raporteaza `ok`, coada se goleste
   *     -> produsul e vandabil la noi si anuntul ramane STINS la ei
   *
   * ⚠ Si nimic nu-l mai aprinde: sondarea vede `removed_by_user` cu `dezactivat_de` scris, adica
   * exact ce se astepta sa vada.
   */
  const i = sync.indexOf('if (stareaAcum === "outdated" || stinsDeNoi)');
  assert.notEqual(i, -1);
  const bloc = faraComentarii(sync.slice(i, sync.indexOf('return { ok: true, action: "updated"', i)));
  assert.match(bloc, /const activare = await activateRemote\(admin, ctx, freshRow\);/);
  assert.match(bloc, /if \(!activare\.ok\) return activare;/);
  assert.doesNotMatch(bloc, /^\s*await activateRemote\(/m,
    "chemata fara sa i se citeasca raspunsul, reactivarea e o parere");
});

/* ── Rezervele care repeta chiar defectul ────────────────────────────────── */

test("⚠ imbinarea atomica n-are cale de rezerva", () => {
  /*
   * Pana azi, un RPC picat cobora pe citeste-modifica-scrie: se citea `olx_config` intreg si se
   * scria inapoi cu peticul deasupra. Adica exact cursa pentru care exista `jsonb_merge_config`:
   *
   *     rezerva citeste configul: refresh R1
   *     intre timp cronul roteste: R1 -> R2, si scrie R2
   *     rezerva scrie configul citit + petic -> R1 se intoarce peste R2
   *     -> la urmatoarea reimprospatare: „Reconectează contul OLX"
   *
   * ⚠ O rezerva care poate strica o conexiune OAuth e mai rea decat lipsa ei.
   */
  const i = config.indexOf("export async function patchOlxConfig");
  const corp = faraComentarii(config.slice(i));
  assert.match(corp, /if \(error\) throw new Error/);
  assert.doesNotMatch(corp, /\.from\("store_settings"\)/,
    "orice rezerva la o imbinare atomica e, prin fire, un citeste-modifica-scrie");
  /* ⚠ Iar cei doi care scriu marcaje din cron isi prind aruncarea: altfel ar opri restul trecerii. */
  for (const marcaj of ["last_sync_at: now", "reconcile_offset: r.urmatorul"]) {
    const j = cron.indexOf(marcaj);
    assert.ok(j > 0, `marcajul \`${marcaj}\` a disparut`);
    const inainte = cron.slice(Math.max(0, j - 200), j);
    assert.match(inainte, /try \{/, `scrierea lui \`${marcaj}\` nu-si prinde aruncarea`);
  }
});

test("⚠ un CAS picat nu coboara pe o scriere fara CAS", () => {
  /*
   * `const scris = eRotatie ? await persistConfig(…) : true;` desfacea tocmai paza pe care CAS-ul
   * o pune: cand RPC-ul nu se putea rula, se scria oricum, fara nicio conditie.
   *
   * ⚠ Pretul neplatit e mic: nescris, tokenul nou trait doar in memorie inseamna o reimprospatare
   * in plus la trecerea urmatoare — nu o conexiune moarta, fiindca paza `rotit` de mai jos refuza
   * sa raporteze sanatate cand refresh tokenul chiar s-a schimbat.
   */
  const cod = faraComentarii(oauth);
  assert.match(cod, /const scris = !eRotatie;/);
  assert.doesNotMatch(cod, /eRotatie \? await persistConfig/);
  /* ⚠ Si nu tace: un CAS care nu se poate rula se scrie in jurnal. */
  assert.match(oauth, /if \(eRotatie\) \{[\s\S]{0,300}?action: "olx\.rotatie"/);
  /* ⚠ Paza care da intelesul: rotit si nescris NU e sanatate. */
  assert.match(cod, /if \(!scris && rotit\)/);
});

/* ── Capete si stersaturi ────────────────────────────────────────────────── */

test("⚠ si cererea de token are un capat", () => {
  /*
   * Clientul Partner API primise unul, dar cererea de token ramasese fara — si e chemata mai
   * devreme decat el, din `loadOlxContext`. O cerere care atarna aici tine intreg cronul: nu
   * apuca niciun magazin, nici macar cele conectate la alt cont.
   */
  const fetchuri = [...oauth.matchAll(/await fetch\(/g)];
  assert.ok(fetchuri.length >= 1);
  for (const m of fetchuri) {
    const dupa = oauth.slice(m.index ?? 0, (m.index ?? 0) + 900);
    assert.match(dupa, /signal: AbortSignal\.timeout\(20_000\)/,
      "o cerere catre OLX fara capat tine lucratorul ocupat");
  }
});

test("⚠ cartierul se sterge cu `null`, nu cu `undefined`", () => {
  /*
   * ═══ `undefined` NU STERGE NIMIC ═══
   *
   * Cand omul schimba orasul si noul oras n-are cartierul ales, ecranul trimite `district_id:
   * null`. Peticul punea `undefined` — iar `JSON.stringify` scoate cheia cu totul din corpul
   * cererii, deci `jsonb_merge_config` nici n-o vede:
   *
   *     Cluj-Napoca + Mănăștur  ->  omul alege București
   *     peticul trimite doar orasul
   *     -> in baza ramane București cu ID-ul de cartier din Cluj
   */
  const i = actiuni.indexOf("export async function saveOlxSettings");
  const corp = faraComentarii(actiuni.slice(i, actiuni.indexOf("\nexport ", i + 10)));
  assert.match(corp, /default_district_id: input\.district_id === null \? null :/);
  assert.match(corp, /default_district_name: input\.district_id === null \? null :/);
  assert.doesNotMatch(corp, /=== null \? undefined :/,
    "`undefined` nu ajunge niciodata in baza: `JSON.stringify` il scoate din petic");
  /* ⚠ Si tipul chiar primeste `null`, altfel `tsc` ar fi cerut inapoi `undefined`. */
  const tipuri = readFileSync("src/lib/olx/types.ts", "utf8");
  assert.match(tipuri, /default_district_id\?: number \| null;/);
  assert.match(tipuri, /default_district_name\?: string \| null;/);
});

/* ── Reconcilierea, la scara ─────────────────────────────────────────────── */

test("⚠ debitul reconcilierii creste numai cu un ceas langa el", () => {
  /*
   * O pagina pe vizita inseamna, pentru un magazin cu cinci sute de anunturi, zece vizite — doua
   * ore si jumatate pana la o trecere completa, si asta doar daca ii vine randul de fiecare data.
   *
   * ⚠ Dar cronul mai are dupa reconciliere sondarea de stare si prelungirile. O reconciliere care
   * se intinde le taie pe alea, si taierea nu s-ar vedea nicaieri. Bugetul se verifica INAINTE de
   * fiecare cerere, nu dupa.
   */
  assert.match(cron, /const RECONCILE_BUGET_MS = 20_000;/);
  assert.match(cron, /if \(Date\.now\(\) >= pana\) break;/);
  assert.match(cron, /for \(let pagina = 0; pagina < RECONCILE_PAGINI && Date\.now\(\) < pana; pagina\+\+\)/);
  /* ⚠ Si roata inchisa opreste vizita: paginile de dupa n-ar avea ce citi. */
  assert.match(cron, /if \(r\.urmatorul === 0\) break;/);
});

test("⚠ ce n-a apucat reconcilierea SE SPUNE", () => {
  /*
   * ⚠ O plasa care acopera cinci magazine din o mie arata, din afara, exact ca una care le acopera
   * pe toate — si tocmai tacerea ar face-o sa para de ajuns. Cand numarul creste, se schimba
   * modelul; dar mai intai trebuie sa se poata vedea ca a crescut.
   */
  assert.match(cron, /if \(conectate\.length > vizitate\) \{/);
  assert.match(cron, /reconciliere: \$\{vizitate\}\/\$\{conectate\.length\} magazine/);
});

test("⚠ publicarea in masa nu mai numara produse pe care nu le-a citit", () => {
  /*
   * ═══ O BUCATA PICATA FACEA PRODUSELE SA DISPARA IN TACERE (31.08.2026) ═══
   *
   * `data ?? []` da acelasi lucru si pentru „interogare reusita, zero produse", si pentru
   * „interogarea a picat". Iar mai jos se raporteaza `queued: rows.length`, deci omul vedea
   * „250 produse trimise catre OLX" pentru o lucrare din care lipseau tocmai cele necitite — si
   * nimic, nicaieri, nu spunea ca s-a pierdut ceva.
   *
   * ⚠ SE CERE REGULA, NU TEXTUL: orice citire de produse din corpul functiei trebuie sa-si lege
   * eroarea SI sa iasa inainte de prima adaugare in lista. Un `if (error)` cerut literal ar trece
   * si peste un `void error;`.
   */
  const i = actiuni.indexOf("export async function publishProductsToOlx");
  assert.notEqual(i, -1);
  const corp = faraComentarii(actiuni.slice(i, actiuni.indexOf(`
export `, i + 10)));
  const iPush = corp.indexOf("prods.push(");
  assert.ok(iPush > 0, "adaugarea in lista a disparut");
  const citiri = [...corp.matchAll(/\.from\("products"\)/g)];
  assert.ok(citiri.length > 0, "citirea produselor a disparut");
  for (const m of citiri) {
    const inainte = corp.slice(Math.max(0, (m.index ?? 0) - 90), m.index);
    assert.match(inainte, /const \{ data, error \} = /,
      "o citire de produse care nu-si leaga eroarea pierde produse in tacere");
    const pana = corp.slice(m.index ?? 0, iPush);
    assert.match(pana, /if \(error\) return \{ error:/,
      "iesirea trebuie sa vina INAINTEA primei adaugari, nu dupa");
  }
});

/* ── Banii se cheltuiesc o singura data ──────────────────────────────────── */

test("⚠ toate cele trei cumparari trec prin registru", () => {
  /*
   * ═══ UN RASPUNS AMBIGUU NU ARE VOIE SA COSTE DE DOUA ORI (01.09.2026) ═══
   *
   *     omul apasa „Cumpără promovare"
   *     OLX ia banii si aplica promovarea ✅
   *     raspunsul se pierde ❌ -> ecranul arata eroare
   *     omul apasa din nou -> A DOUA promovare, platita
   *
   * ⚠ Registrul scrie rezervarea INAINTE de apel: daca incheierea se pierde, randul ramane
   * `in_curs` si a doua apasare e REFUZATA, cu cheia in mesaj.
   */
  for (const fn of ["buyOlxCategoryPacket", "buyOlxAdvertPacket", "buyOlxPaidFeature"]) {
    const i = actiuni.indexOf(`export async function ${fn}(`);
    assert.ok(i > 0, `${fn} a disparut`);
    const corp = faraComentarii(actiuni.slice(i, actiuni.indexOf(`
export `, i + 10)));
    assert.match(corp, /await cuRegistru\(/, `${fn} cheltuie bani fara registru`);
    assert.match(corp, /cheieOperatie\("plata", "olx",/, `${fn} n-are cheie de plata`);
    assert.match(corp, /if \(r\.fel === "blocat"\)/, `${fn} nu spune omului ca e una in curs`);
    /* ⚠ Si apelul catre ei sta INAUNTRUL registrului, nu inaintea lui. */
    const iReg = corp.indexOf("await cuRegistru(");
    assert.ok(corp.indexOf("purchase", iReg) > iReg,
      `${fn} cheama furnizorul inaintea rezervarii`);
  }
});

test("⚠ indoiala la o plata tine slotul, nu-l elibereaza", () => {
  /*
   * ⚠ „esuat" inseamna „sigur nu s-a intamplat nimic", deci slotul se elibereaza si omul poate
   * reincerca. Pentru o operatie cu bani, indoiala se plateste cu o intrebare, nu cu inca o plata
   * — deci IMPLICITUL e „necunoscut".
   */
  const i = actiuni.indexOf("function verdictOlxPlata(");
  assert.ok(i > 0);
  const corp = faraComentarii(actiuni.slice(i, actiuni.indexOf("}", actiuni.indexOf("return", i))));
  assert.match(corp, /\? "esuat" : "necunoscut"/,
    "implicitul trebuie sa fie `necunoscut`: altfel o indoiala devine a doua plata");
});

test("⚠ activarea de dupa pachet NU sta sub aceeasi cheie", () => {
  /*
   * ⚠ Doua efecte, si numai unul costa bani. Activarea e idempotenta la ei (`400 invalid status`
   * pe un anunt deja activ), deci se poate relua oricat. Pusa sub aceeasi cheie, o activare picata
   * ar fi tinut slotul „in curs" si a doua apasare ar fi fost refuzata — desi tocmai partea gratis
   * mai avea de facut.
   */
  const i = actiuni.indexOf("export async function buyOlxAdvertPacket(");
  const corp = faraComentarii(actiuni.slice(i, actiuni.indexOf(`
export `, i + 10)));
  const iReg = corp.indexOf("await cuRegistru(");
  const iBlocat = corp.indexOf('r.fel === "blocat"');
  const iActivare = corp.indexOf('advertCommand(token, advertId, "activate")');
  assert.ok(iActivare > iBlocat && iBlocat > iReg,
    "activarea trebuie sa vina DUPA ce registrul s-a incheiat");
  assert.match(corp.slice(iActivare - 200, iActivare + 200), /act\.status !== 400/,
    "un anunt deja activ nu e un esec al activarii");
});
