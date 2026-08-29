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
const mesaje = readFileSync("src/lib/actions/olx-mesaje.actions.ts", "utf8");
const cont = readFileSync("src/lib/actions/olx-cont.actions.ts", "utf8");
const importul = readFileSync("src/lib/actions/olx-import.actions.ts", "utf8");
const intentie = readFileSync("src/lib/olx/intentie-de-cumparare.ts", "utf8");
/*
 * ⚠ SE CITESC SI COMPONENTELE, nu doar actiunile. Proba de pana acum cauta `platiNelamurite:` in
 * SURSA actiunilor si trecea verde peste un panou care nu afisa cifra si un `totBine` care n-o
 * socotea: confirma ca se SCRIE campul, nu ca-l citeste cineva. Un capat de fir care nu se leaga
 * nicaieri arata, dintr-un inventar, exact ca o functie livrata.
 */
const panou = readFileSync("src/components/dashboard/OlxSanatate.tsx", "utf8");
const panouCont = readFileSync("src/components/dashboard/OlxAccountPanel.tsx", "utf8");
const ecran = readFileSync("src/components/dashboard/OlxClient.tsx", "utf8");

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
  const i = sync.indexOf("export async function deleteAdvertNow");
  assert.ok(i > 0, "butonul a disparut");
  const corp = sync.slice(i, i + 500);
  assert.doesNotMatch(corp, /stergeDacaProdusulChiarNuMaiE/,
    "paza pusa aici ar face butonul sa nu mai stearga niciodata nimic");
  /*
   * ⚠ SI EL E ASUPRA PRODUSULUI (01.09.2026). Ramasese pe vechiul drum — `getRow` si un singur
   * `olx_advert_id` — deci pe un produs cu duplicat istoric stergea 111 si lasa 222 la vanzare.
   * Iar butonul ii promite textual „Acțiunea nu poate fi anulată": ii spuneam ca s-a terminat ceva
   * ce nu se terminase.
   */
  assert.match(corp, /stergeTotulPentruProdus\(admin, ctx, businessId, offerId, await getRow/);
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
    assert.match(corp, /cheie: cheiaPlatii\(/, `${fn} n-are cheie de plata`);
    /*
     * ⚠ SI NIMENI NU-SI FACE SINGUR CHEIA. Un `cheieOperatie("plata", …)` scris de mana ar ocoli
     * `cheiaPlatii`, adica si intentia: cheia ar redeveni una compusa pe loc, si dedublarea peste
     * reincercari ar disparea fara ca nimic sa se planga.
     */
    assert.doesNotMatch(corp, /cheieOperatie\("plata"/,
      `${fn} isi compune cheia pe langa cheiaPlatii`);
    assert.match(corp, /if \(r\.fel === "blocat"\) return \{ error: r\.mesaj \}|raportCumparare\(r\)/,
      `${fn} nu duce mai departe mesajul registrului`);
    /* ⚠ Si apelul catre ei sta INAUNTRUL registrului, nu inaintea lui. */
    const iReg = corp.indexOf("await cuRegistru(");
    assert.ok(corp.indexOf("purchase", iReg) > iReg,
      `${fn} cheama furnizorul inaintea rezervarii`);
  }
  /*
   * ⚠ CE DOVEDESTE CE. Proba asta arata ca DRUMUL trece prin registru; ca registrul chiar nu
   * cheama furnizorul a doua oara e dovedit acolo unde e scris, in
   * `src/lib/operatii/registru.test.ts`:
   *
   *     „rezervare refuzata cu `reusit` -> se ADOPTA rezultatul, fara al doilea apel"
   *     „rezervare refuzata cu `in_curs` -> furnizorul NU e chemat"
   *     „implicitul e `necunoscut`: un timeout nu se ia drept refuz"
   *
   * Copiate aici, ar fi fost aceleasi probe cu alt nume — si s-ar fi despartit de original la
   * prima schimbare. Se cere doar sa existe, ca lantul sa se vada.
   */
  const registru = readFileSync("src/lib/operatii/registru.test.ts", "utf8");
  for (const garantie of [
    "se ADOPTA rezultatul, fara al doilea apel",
    "furnizorul NU e chemat",
    "un timeout nu se ia drept refuz",
  ]) {
    assert.ok(registru.includes(garantie),
      `garantia „${garantie}" nu mai e probata in registru — plata OLX se sprijina pe ea`);
  }
});

test("⚠ indoiala la o plata tine slotul, nu-l elibereaza", () => {
  /*
   * ⚠ „esuat" inseamna „sigur nu s-a intamplat nimic", deci slotul se elibereaza si omul poate
   * reincerca. Pentru o operatie cu bani, indoiala se plateste cu o intrebare, nu cu inca o plata
   * — deci IMPLICITUL e „necunoscut".
   */
  /*
   * ⚠ HOTARAREA S-A MUTAT INTR-UN MODUL CURAT, `src/lib/olx/verdictul-platii.ts`, unde se poate
   * proba cu mesaje adevarate — vezi `verdictul-platii.test.ts`. Aici ramane doar legatura: ca
   * `olx.actions.ts` chiar o foloseste si nu-si tine o a doua parere pe langa.
   */
  const i = actiuni.indexOf("function verdictOlxPlata(");
  assert.ok(i > 0);
  const corp = faraComentarii(actiuni.slice(i, actiuni.indexOf("\n}", i)));
  assert.match(corp, /verdictulPlatii\(\{ brut: e\.brut, status: e\.status \}\)/,
    "verdictul se ia din raspunsul LOR, prin functia probabila");
  assert.match(corp, /return "necunoscut";/,
    "implicitul trebuie sa fie `necunoscut`: altfel o indoiala devine a doua plata");
  assert.doesNotMatch(corp, /REFUZ_LIMPEDE/,
    "o a doua lista alba aici ar putea sa se departeze tacut de cea probata");
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

/* ── Ce ne spun ei si nu ceream ──────────────────────────────────────────── */

test("⚠ motivul respingerii se cere NUMAI cand starea o spune", () => {
  /*
   * ═══ „DE CE NU APARE PRODUSUL MEU PE OLX?" (01.09.2026) ═══
   *
   * Comerciantul vedea „Moderat" sau „Eroare", si atat. OLX are o ruta care spune EXACT ce n-a
   * mers, si n-o intrebam — deci singurul drum al omului era suportul, care nu stia nici el.
   *
   * ⚠ Dar se cere numai pe starile care chiar inseamna respingere: pe un anunt sanatos ruta
   * raspunde gol, iar o cerere in plus la fiecare sondare ar dubla traficul degeaba.
   */
  assert.match(sync, /const RESPINSE = \["moderated", "blocked", "disabled", "removed_by_moderator"\];/);
  assert.match(sync, /if \(RESPINSE\.includes\(stareaLor\) && inainte\?\.status !== stareaLor\) \{/);
  /* ⚠ Si nu se reintreaba la fiecare trecere: `inainte` deosebeste vestea NOUA de una stiuta. */
  const i = sync.indexOf("export async function ceruMotivulRespingerii");
  const corp = faraComentarii(sync.slice(i, sync.indexOf(`
/**`, i + 10)));
  assert.match(corp, /moderation_la: now/, "clipa se scrie si cand n-au avut ce spune");
  assert.match(corp, /if \(isOlxError\(res\)\) \{[\s\S]{0,300}?moderation_la: now/,
    "fara marcaj, un raspuns picat ne-ar face sa reintrebam la nesfarsit");
});

test("⚠ statisticile nu inventeaza zero", () => {
  /*
   * ⚠ `null` inseamna „nu stim", iar zero inseamna „nimeni nu s-a uitat". Sunt lucruri deosebite,
   * si al doilea e o veste proasta pe care n-avem dreptul s-o dam cand n-o stim.
   */
  const i = sync.indexOf("export async function ceruStatisticile");
  const corp = faraComentarii(sync.slice(i));
  assert.match(corp, /typeof st\.advert_views === "number" \? st\.advert_views : null/);
  assert.match(corp, /typeof st\.phone_views === "number" \? st\.phone_views : null/);
  assert.match(corp, /typeof st\.users_observing === "number" \? st\.users_observing : null/);
  /* ⚠ Si o linie pe ZI, nu pe cerere: altfel un cron care trece de trei ori pe zi face din
     „vizualizari" un grafic cu trei puncte pe zi si nicio poveste. */
  assert.match(corp, /onConflict: "business_id,olx_advert_id,zi"/);
  assert.match(corp, /zi: now\.slice\(0, 10\)/);
});

test("⚠ statisticile nu se cer pentru anunturi stinse", () => {
  /*
   * ⚠ E o citire PER ANUNT, deci la scara se plateste. Un anunt stins n-are ce statistici sa
   * adune, iar starea unui anunt — care spune daca marfa se vinde — are dreptul la mai mult din
   * bugetul de cereri decat cate vizualizari a avut.
   */
  assert.match(cron, /\.in\("status", \["active", "new"\]\)/);
  assert.match(cron, /const STAT_BATCH = 15;/);
  /* ⚠ Rotatia e a bazei, nu a noastra: cele despre care nu stim nimic vin primele. */
  assert.match(cron, /\.order\("stat_la", \{ ascending: true, nullsFirst: true \}\)/);
});

test("⚠ o mapare scoasa nu lasa anunturi care se vand mai departe", () => {
  /*
   * ═══ FARA MAPARE, SINCRONIZAREA TACE — DAR ANUNTUL RAMANE (01.09.2026) ═══
   *
   *     Edinio: pret 200 lei
   *     OLX:    pret 150 lei, ACTIV, se vinde
   *
   * ⚠ DAR NU HOTARAM NOI. Sunt comercianti care scot maparea tocmai ca sa opreasca sincronizarea
   * si sa lase anunturile in pace, si e o alegere legitima. Intrebarea li se pune o data, cu
   * numarul in fata; pana raspund, nu se sterge nimic.
   */
  const i = actiuni.indexOf("export async function saveOlxCategoryMapEntry");
  const corp = faraComentarii(actiuni.slice(i, actiuni.indexOf(`
export `, i + 10)));
  assert.match(corp, /if \(!politica\) return \{ intreaba: \{ cate: cuAnunturi\.ids\.length \} \};/);
  /* ⚠ Si dezactivarea se SCRIE inainte ca maparea sa dispara: ordinea inversa ar lasa lucrarea
     nescrisa peste o mapare deja stearsa. */
  const iCoada = corp.indexOf("enqueueOlxDezactivareMany");
  const iSterge = corp.indexOf("setOlxCategoryMapEntry");
  assert.ok(iCoada > 0 && iSterge > iCoada, "intentia se scrie INAINTEA stergerii maparii");
  /* ⚠ Si o punere la coada picata opreste stergerea, nu o lasa sa treaca. */
  assert.match(corp, /if \(r\.fel === "nesigur"\) \{[\s\S]{0,200}?return \{ error:/);
  /* ⚠ Se numara doar anunturile VII: unul deja stins n-are ce sa mai patä. */
  const j = actiuni.indexOf("async function produseleCuAnunturi");
  const corpNum = actiuni.slice(j, actiuni.indexOf(`
}`, j));
  assert.match(corpNum, /\.in\("status", \["active", "new", "unconfirmed", "limited"\]\)/);
  assert.match(corpNum, /\.not\("olx_advert_id", "is", null\)/);
});

test("⚠ plafonul sondarii se vede, nu se ghiceste", () => {
  /*
   * ═══ O PROMISIUNE CARE SE STRICA IN TACERE (01.09.2026) ═══
   *
   * Nota din cron promite „restul se reimprospateaza la fiecare doua ore". Tine doar cat timp
   * restantele incap in `STATUS_BATCH` pe minut — adica pana la vreo trei mii de anunturi. Peste,
   * comentariul devine neadevarat FARA ca ceva sa se strice vizibil: sondarea merge mai departe,
   * doar ca tot mai incet, iar starile invechite se acumuleaza.
   *
   * ⚠ Nu inseamna ca s-a stricat ceva; inseamna ca a venit clipa sa se schimbe modelul. Si nu
   * aflam despre ea dintr-o reclamatie.
   */
  assert.match(cron, /const CAPACITATE_PE_CICLU = STATUS_BATCH \* 120;/);
  assert.match(cron, /if \(\(restante \?\? 0\) > CAPACITATE_PE_CICLU\) \{/);
  /* ⚠ Numaratoarea nu aduce randuri: costa o cerere, nu o pagina. */
  const i = cron.indexOf("const { count: restante }");
  assert.ok(i > 0, "numaratoarea restantelor a disparut");
  assert.match(cron.slice(i, i + 300), /\{ count: "exact", head: true \}/);
});

/* ── Ecranele noi: doua reguli cu efect adevarat ─────────────────────────── */

test("⚠ marcarea „citit” nu se mai arunca", () => {
  /*
   * ═══ O BULINA CARE MINTE E MAI REA DECAT UNA CARE INTARZIE (01.09.2026) ═══
   *
   * `markThreadRead` se chema cu `void` — fire-and-forget. Daca pica, bulina se stingea in ecran
   * pentru un fir care ramanea NECITIT la ei, iar comerciantul nu se mai intorcea la el niciodata.
   *
   * ⚠ Starea din ecran e oglinda starii LOR, iar oglinda are voie sa arate doar ce s-a confirmat.
   */
  const i = mesaje.indexOf("export async function deschideOlxConversatia");
  assert.ok(i > 0, "actiunea de deschidere a conversatiei a disparut");
  const corp = faraComentarii(mesaje.slice(i));
  assert.match(corp, /marcatCitit/, "rezultatul marcarii trebuie dus mai departe");
  assert.doesNotMatch(corp, /void markThreadRead|void marcheaz/,
    "o marcare aruncata stinge bulina peste un fir ramas necitit la ei");
});

test("⚠ atasamentele se arata doar de la adrese `http`", () => {
  /*
   * ⚠ Adresele vin de la ei si ajung intr-un `href`. Un `javascript:` scapat acolo ar rula in
   * pagina comerciantului, cu sesiunea lui — iar noi n-am scris niciodata adresa aceea.
   */
  assert.match(mesaje, /\^https\?:/, "adresele atasamentelor trebuie filtrate");
});

test("⚠ profilul de firma se pazeste si la SCRIERE, nu doar la citire", () => {
  /*
   * ⚠ O actiune de server e o ADRESA, nu un formular ascuns. Pazita doar la citire, oricine ar
   * putea scrie profilul unui cont particular — si am fi trimis la ei o cerere pe care contul aceia
   * n-are dreptul s-o faca.
   */
  const scrieri = [...cont.matchAll(/advertiser_type !== "business"/g)];
  assert.ok(scrieri.length >= 2, `asteptam paza si la citire si la scriere, sunt ${scrieri.length}`);
  const i = cont.indexOf("export async function salveazaOlxProfilFirma");
  assert.ok(i > 0);
  const corp = cont.slice(i, i + 900);
  assert.match(corp, /advertiser_type !== "business"/, "scrierea nu-si verifica poarta");
});

test("⚠ importul nu atinge NIMIC la OLX", () => {
  /*
   * ⚠ Contul lui de OLX e al lui. Un import care ar modifica anunturi vechi ar fi cel mai rau fel
   * de a-l ajuta: ar strica lucruri care mergeau, in locul in care nici nu se uita.
   */
  const cod = faraComentarii(importul);
  for (const scriere of ["updateAdvert", "createAdvert", "deleteAdvert", "advertCommand", "purchase"]) {
    assert.ok(!cod.includes(scriere), `importul cheama \`${scriere}\`, deci scrie la ei`);
  }
});

test("⚠ importul nu propune un produs care are deja rand", () => {
  /*
   * ⚠ Conectarea l-ar rescrie, deci o legatura BUNA ar fi inlocuita cu o presupunere pe titlu.
   * Randul ramane exclus indiferent de starea lui: si unul sters de om, si unul respins, sunt
   * hotarari sau fapte deja scrise despre produs.
   */
  assert.match(importul, /produse\.filter\(\(p\) => !legaturi\.produseLuate\.has\(p\.id\)\)/);
});

test("⚠ „Ignoră” tine minte, si textul spune adevarul", () => {
  /*
   * ═══ RESPINS O DATA INSEAMNA RESPINS (01.09.2026) ═══
   *
   * Fara asta, butonul scotea randul doar din lista de ACUM. Un comerciant cu optzeci si patru de
   * anunturi vechi respinge saizeci si le vede pe toate din nou la scanarea urmatoare — iar a doua
   * oara nu le mai citeste una cate una, le sare pe toate, si atunci nici pe cele care chiar erau
   * ale lui.
   */
  assert.match(importul, /export async function ignoraAnuntOlx\(/);
  assert.match(importul, /if \(ignorate\.has\(a\.id\)\) continue;/, "lista respinsa trebuie sa si filtreze");
  /* ⚠ Se scrie prin peticul atomic: citit si scris intreg, ar fi putut calca un token rotit. */
  assert.match(importul, /await patchOlxConfig\(admin, businessId, \{ import_ignorate:/);
  /* ⚠ Si o citire picata NU se ia drept lista goala: am uita tot ce respinsese pana atunci. */
  const i = importul.indexOf("export async function ignoraAnuntOlx");
  assert.match(importul.slice(i), /if \(eConfig\) return \{ error:/);
  /* ⚠ Iar textul din ecran nu mai promite ce nu tinem, si nici invers. */
  const ecran = readFileSync("src/components/dashboard/OlxImport.tsx", "utf8");
  assert.match(ecran, /„Ignoră” ține minte alegerea/);
  assert.doesNotMatch(ecran, /anunțul apare din nou/, "textul vechi a ramas peste purtarea noua");
});

/* ── Platile: cheia, verdictul, si iesirea din indoiala ──────────────────── */

test("⚠ lista alba a refuzurilor traieste intr-un singur loc", () => {
  /*
   * ═══ LISTA E ALBA, NU NEAGRA (01.09.2026) ═══
   *
   * Prima varianta cauta `/insufficient|not enough|invalid|unknown|refuz/` si, la potrivire,
   * ELIBERA slotul. Dar „Unknown error" spune exact pe dos: serverul nu stie ce s-a intamplat.
   *
   * ═══ SI PROBA ASTA NU-I DADEA NICIODATA UN MESAJ ADEVARAT (02.09.2026) ═══
   *
   * Verifica doar ca lista EXISTA si ca nu contine „unknown". Daca i-ar fi dat un mesaj real, ar fi
   * aflat ca cel mai obisnuit refuz al lor — soldul insuficient — nu se potrivea cu niciun tipar,
   * fiindca il traduceam in romana INAINTE de confruntare. Mesajele adevarate se probeaza acum in
   * `verdictul-platii.test.ts`; aici ramane doar ca lista sa nu se dubleze.
   */
  const cod = faraComentarii(actiuni);
  assert.doesNotMatch(cod, /const REFUZ_LIMPEDE = \[/,
    "lista alba sta in `verdictul-platii.ts`, unde se poate proba cu mesaje adevarate");
  assert.match(cod, /verdictulPlatii\(/, "actiunile trebuie sa foloseasca hotararea probata");

  const verdict = readFileSync("src/lib/olx/verdictul-platii.ts", "utf8");
  const i = verdict.indexOf("const REFUZ_LIMPEDE");
  assert.ok(i > 0, "lista alba a disparut cu totul");
  const lista = verdict.slice(i, verdict.indexOf("]", i));
  assert.doesNotMatch(lista, /unknown/i, "un „unknown” inseamna „nu stiu”, nu „n-am facut”");
});

test("⚠ cheia unei plati poarta INTENTIA, si intentia vine de la apelant", () => {
  /*
   * ═══ ZIUA FACEA DOUA TREBURI, SI LE FACEA PROST PE AMANDOUA (02.09.2026) ═══
   *
   * Cheia era `promovare:${advertId}:${code}:${ziuaCheii()}`.
   *
   *   DEDUBLA PREA MULT: doua cumparari legitime ale aceluiasi lucru in aceeasi zi UTC primeau
   *   aceeasi cheie, a doua intorcea `deja`, OLX nu era chemat, si Edinio raporta succes.
   *
   *   DEDUBLA PREA PUTIN: un timeout inainte de hotarul zilei UTC, reluat dupa, primea alta cheie
   *   si putea plati a doua oara.
   *
   * ⚠ CE APARA PROBA ASTA nu e ca exista un id in cheie, ci ca id-ul VINE DE LA APELANT. Un
   * `randomUUID()` chemat in corpul actiunii ar da alta cheie la fiecare apasare si ar desfiinta
   * complet paza — fiecare reincercare ar deveni a doua plata. Cu o proba care cere doar „e un
   * uuid in cheie", stricaciunea aia ar trece verde.
   */
  assert.doesNotMatch(actiuni, /function ziuaCheii/, "ziua din cheie a fost inlocuita de intentie");

  for (const fn of ["buyOlxCategoryPacket", "buyOlxAdvertPacket", "buyOlxPaidFeature"]) {
    const i = actiuni.indexOf(`export async function ${fn}(`);
    assert.ok(i > 0, `${fn} a disparut`);
    const antet = actiuni.slice(i, actiuni.indexOf(")", actiuni.indexOf("(", i + 30)) + 1);
    assert.match(antet, /intentId: string/, `${fn} nu primeste intentia de la apelant`);
    const corp = faraComentarii(actiuni.slice(i, actiuni.indexOf(`
export `, i + 10)));
    assert.doesNotMatch(corp, /randomUUID/, `${fn} isi face singur intentia, deci n-o mai apara`);
    assert.match(corp, /intentieValida\(intentId\)/, `${fn} nu verifica forma intentiei`);
  }

  /*
   * ⚠ ID-UL STA LA COADA CHEII. `descrieCheiaDePlata` si lamurirea citesc cheia POZITIONAL: pus in
   * fata, `b[2]` ar deveni un id, nicio ramura nu s-ar mai potrivi, si orice plata nelamurita ar
   * raspunde pe veci „inca nu stim" — cu descrierea aratata omului ca sir brut.
   */
  const i2 = actiuni.indexOf("function cheiaPlatii(");
  assert.ok(i2 > 0, "cheiaPlatii a disparut");
  const corpCheie = faraComentarii(actiuni.slice(i2, actiuni.indexOf("\n}", i2)));
  assert.match(corpCheie, /\$\{ceSeCumpara\}:\$\{intentId\}/,
    "intentia trebuie sa fie ULTIMA bucata a cheii");

  /*
   * ⚠ SI INTENTIA TREBUIE SA SUPRAVIETUIASCA ECRANULUI. Prima varianta o tinea intr-un `useRef`;
   * panoul de cont e un acordeon, deci se demonteaza, iar a doua apasare ar fi trimis alt id si ar
   * fi chemat OLX A DOUA OARA. Ar fi fost mai rau decat ziua din cheie, care tinea pana la miezul
   * noptii. De-aia intentia sta in `localStorage`.
   */
  assert.match(intentie, /globalThis\.localStorage/, "intentia nu supravietuieste reincarcarii");
  assert.doesNotMatch(faraComentarii(intentie), /sessionStorage/,
    "sessionStorage nu se vede din a doua fila");
  /*
   * ⚠ SE CERE LA FIECARE APASARE, nu o data pe fisier. Prima forma a probei cauta
   * `incheieIntentia(businessId,` oriunde in componenta — si a trecut VERDE cand am scos-o de la
   * unul din cele doua butoane, fiindca celalalt o mai avea. Confruntarea cu defectul a aratat-o;
   * citita, parea sa apere amandoua drumurile.
   */
  for (const [nume, sursa] of [["OlxAccountPanel", panouCont], ["OlxClient", ecran]] as const) {
    const apeluri = [...sursa.matchAll(/await buyOlx[A-Za-z]+\(/g)];
    assert.ok(apeluri.length > 0, `${nume} nu mai cumpara nimic`);
    for (const m of apeluri) {
      const dupa = sursa.slice(m.index ?? 0, (m.index ?? 0) + 1200);
      assert.match(dupa, /intentiaPentru\(businessId,/,
        `${nume}: o cumparare fara intentie trimisa`);
      assert.match(dupa, /incheieIntentia\(businessId,/,
        `${nume}: o cumparare care nu arunca intentia dupa un raspuns limpede; a doua cumparare ar primi „deja"`);
    }
  }
});

test("⚠ promovarea se verifica la EI inainte sa se plateasca", () => {
  /*
   * ⚠ Cheia apara de APASAREA dubla; asta apara de HOTARAREA dubla — omul care a uitat ca a
   * cumparat saptamana trecuta. OLX nu refuza o promovare peste una activa: o ia si o incaseaza.
   */
  const i = actiuni.indexOf("export async function buyOlxPaidFeature");
  const corp = actiuni.slice(i, actiuni.indexOf(`
export `, i + 10));
  const iVerificare = corp.indexOf("getAdvertPaidFeatures");
  const iPlata = corp.indexOf("cuRegistru");
  assert.ok(iVerificare > 0 && iPlata > iVerificare, "intrebarea vine INAINTEA platii");
  assert.match(corp, /Promovarea e deja activă/);
});

test("⚠ o plata nelamurita se vede in panou, si are doua iesiri", () => {
  /*
   * ⚠ Registrul tine slotul dinadins cand nu stie ce s-a intamplat. Dar mecanismul generic de
   * deblocare lucreaza pe pagina unei COMENZI (`operatiiAtarnate` se ingusteaza cu `order_id`), iar
   * platile OLX au `orderId: null` — deci un `POST` cu raspuns pierdut lasa cumpararea blocata.
   *
   * ⚠ Si de cand cheia poarta intentia in loc de zi, blocajul nu mai expira peste noapte. Iesirea
   * asta a trecut din „bine de avut" in „obligatoriu": fara ea, reparatia ar fi inlocuit o plata
   * dubla cu un fund de sac.
   */
  assert.match(actiuni, /export async function getOlxPlatiNelamurite\(/);
  assert.match(actiuni, /export async function lamuresteOlxPlata\(/);
  assert.match(actiuni, /export async function renuntaLaOlxPlata\(/);

  const i = actiuni.indexOf("async function lamurestePlata(");
  assert.ok(i > 0, "miezul fara guard a disparut");
  const corp = faraComentarii(actiuni.slice(i, actiuni.indexOf("\n/**", i + 10)));

  /* ⚠ Se cauta DOVADA la ei, nu se intreaba omul „a mers?". El n-are de unde sti. */
  assert.match(corp, /getAdvertPaidFeatures\(token, advertId\)/);
  assert.match(corp, /p_stare: "reusit"/);
  assert.match(corp, /stare: "inca-nu-stim"/);

  /*
   * ⚠ LIPSA DOVEZII NU DESCHIDE NIMIC, si asta e insusirea cea mai importanta a functiei. Fiecare
   * dovada negativa pe care o putem lua de la OLX s-a dovedit nesigura: ruta de promovari intoarce
   * si intrarile EXPIRATE, un `200` cu corp stricat se citeste ca lista goala, iar pachetele nu se
   * pot lega de o cumparare anume. Deblocata pe un fals negativ, urmatoarea apasare plateste.
   */
  assert.doesNotMatch(corp, /deblocheazaOperatie/,
    "lamurirea nu are voie sa deblocheze: dovada pozitiva inchide, lipsa dovezii nu deschide");

  /*
   * ⚠ SI RASPUNSUL RPC-ULUI SE CITESTE, nu doar `error`. `incheie_operatie_externa` nu se plange pe
   * un rand deja asezat: intoarce `{ gasit: true, deja: true }` fara eroare. Citit doar pe `error`,
   * codul spunea „Plata a intrat" pe un rand pe care nu scrisese nimic.
   */
  assert.match(corp, /r\?\.gasit !== true/, "nu se citeste `gasit` din raspunsul RPC-ului");
  assert.match(corp, /r\.deja === true/, "nu se citeste `deja` din raspunsul RPC-ului");

  /* ⚠ Iar deblocarea asumata citeste `stabilizata`, altfel mesajul minte linistitor. */
  const iR = actiuni.indexOf("export async function renuntaLaOlxPlata");
  const corpR = faraComentarii(actiuni.slice(iR, actiuni.indexOf("\n/**", iR + 10)));
  /*
   * ⚠ SE CERE RAMURA, NU MENTIUNEA. `r.stabilizata` apare si in detaliile din jurnal, deci o
   * proba care cauta doar numele a trecut verde cand am facut ramura de neatins. Aceeasi lectie ca
   * la `if (false && …)`: inauntru era intacta, doar nu se mai deschidea.
   */
  assert.match(corpR, /if \(r\.stabilizata\)/,
    "deblocarea nu ramifica pe randul care se asezase intre timp, deci mesajul poate minti");
  assert.match(corpR, /logError\(/, "o deblocare asumata trebuie sa lase urma cine a luat-o");

  /*
   * ⚠ SI SE VEDE IN ECRAN. Proba de dinainte cauta `platiNelamurite: plati.count ?? 0,` in SURSA
   * actiunilor — deci era verde peste un panou care nu afisa cifra si un `totBine` care n-o socotea.
   * Confirma ca se scrie campul, nu ca-l citeste cineva.
   */
  assert.match(panou, /s\.platiNelamurite/, "panoul nu afiseaza plafile de verificat");
  assert.match(panou, /platiNelamurite === 0/, "`totBine` nu socoteste platile nelamurite");
  assert.match(panou, /lamuresteOlxPlata\(/, "panoul n-are butonul „Verifica la OLX”");
  assert.match(panou, /renuntaLaOlxPlata\(/, "panoul n-are iesirea asumata");
});

test("⚠ plafonul atins OPRESTE lucrarea, nu o incheie", () => {
  /*
   * ═══ COMENTARIUL SPUNEA UN LUCRU, `return`-UL FACEA ALTUL (01.09.2026) ═══
   *
   * Scria „nu se pretinde ca lista e completa" — si intorcea `ok: true`, adica exact asta. Iar cine
   * cheama foloseste raspunsul ca sa RETRAGA sau sa STINGA tot ce e al produsului: o curatenie
   * „exhaustiva" pe o lista incompleta lasa anunturi vii, si apoi raporteaza ca a terminat.
   */
  const i = sync.indexOf("cautarea dupa external_id a atins plafonul");
  assert.ok(i > 0, "strigatul de plafon a disparut");
  const dupa = sync.slice(i, i + 700);
  assert.match(dupa, /ok: false/, "plafonul atins nu are voie sa se raporteze ca lista completa");
  assert.match(dupa, /permanent: true/, "se opreste pana se uita un om, nu se reia la nesfarsit");
});

test("⚠ `finish` confirma starea, nu presupune din `400`", () => {
  /*
   * ⚠ `400` e familia intreaga de refuzuri de validare la ei. Concluzia gresita ii spune omului ca
   * anuntul s-a inchis cand el e in continuare acolo. Aceeasi regula ca la `stingeLaEi`.
   */
  const i = actiuni.indexOf("export async function finishOlxAdvert");
  const corp = faraComentarii(actiuni.slice(i, actiuni.indexOf(`
export `, i + 10)));
  assert.match(corp, /getAdvert\(token, advertId\)/, "un `400` se lamureste intrebandu-i");
  assert.match(corp, /INCHEIAT\.includes\(stare\)/);
  /* ⚠ Si activarea de dupa un pachet, la fel. */
  const j = actiuni.indexOf("export async function buyOlxAdvertPacket");
  const corpP = faraComentarii(actiuni.slice(j, actiuni.indexOf(`
export `, j + 10)));
  assert.match(corpP, /getAdvert\(token, advertId\)/,
    "un pachet cumparat cu activarea neconfirmata nu e o reusita");
});
