import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   AUDITUL TRENDYOL, PRIMA TRANSA: INTEGRITATEA (26.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Patru feluri de pierdere tacuta, toate verificate in cod inainte de a fi atinse. Trei
   dintre ele erau deja rezolvate ALTUNDEVA in casa — la eMAG sau la About You — si pur si
   simplu nu ajunsesera la Trendyol. De-aia doua dintre reparatii au mutat regula intr-un loc
   pe care il vad toate integrarile, in loc s-o copieze a treia oara.
*/

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const sync = viu("src/lib/trendyol/sync.ts");
const cron = viu("src/app/api/cron/trendyol-sync/route.ts");
const coada = viu("src/lib/trendyol/queue.ts");

/* ── 1) Coada: generatia exista de mult, dar n-o citea nimeni ──────────────── */

test("⚠ elementul poarta generatia, si scrierile o cer", () => {
  /*
   * `trendyol_sync_queue.generation` si declansatorul care o creste existau in baza DE MULT,
   * iar `revendica_din_coada` intoarce randul intreg (`to_jsonb(q.*)`) — deci valoarea venea
   * deja in raspuns si se arunca. Toate scrierile erau `.eq("id", ...)` goale.
   *
   * ⚠ CE COSTA: omul schimba titlul, lucratorul pleaca la Trendyol, omul schimba si pretul
   * (cerere noua peste acelasi rand), lucratorul se intoarce si sterge randul. A doua
   * schimbare dispare fara sa fi plecat vreodata, si fara nicio eroare nicaieri.
   */
  assert.match(sync, /generation\?: number \| null;/);
  assert.match(cron, /await stergeDacaNeschimbat\(admin, "trendyol_sync_queue", item\);/);
  /* ⚠ Si scrierile de esec, nu doar stergerea: abandonul scris peste o cerere noua ar opri-o
     definitiv fara s-o fi incercat vreodata. */
  assert.equal(
    (cron.match(/scrieDacaNeschimbat\(admin, "trendyol_sync_queue", item/g) ?? []).length, 3,
    "pana, abandon si reincercare",
  );
  assert.doesNotMatch(cron, /from\("trendyol_sync_queue"\)\.delete\(\)\.eq\("id", item\.id\)/);
});

test("⚠ elementul epuizat se ABANDONEAZA, nu se sterge", () => {
  /*
   * Forma dinainte stergea randul dupa cinci refuzuri. Cu o linie in jurnal, dar stearsa din
   * coada: nimeni nu-l mai putea vedea, numara sau relua.
   *
   * ⚠ Coloana `abandonat_la` exista in `trendyol_sync_queue` DE LA INCEPUT si nu era scrisa
   * de nicaieri — masurat: zero folosiri in tot modulul. Iar `revendica_din_coada` o citeste
   * deja (`and c.abandonat_la is null`), deci randul marcat e sarit fara nicio schimbare in
   * baza.
   */
  assert.match(cron, /abandonat_la: new Date\(\)\.toISOString\(\)/);
  const i = cron.indexOf("if (attempts >= MAX_ATTEMPTS)");
  assert.ok(i > 0);
  assert.doesNotMatch(cron.slice(i, i + 900), /\.delete\(\)/, "abandonul nu mai sterge");
});

test("⚠ o cerere noua reaprinde randul abandonat", () => {
  /*
   * Cea mai importanta pereche din fisier. De cand elementul epuizat ramane marcat, punerea
   * la coada TREBUIE sa stearga marcajul — altfel comerciantul repara chiar cauza refuzului
   * (pune atributul lipsa, leaga categoria) si produsul tot nu mai pleaca NICIODATA.
   */
  assert.match(coada, /const CERERE_NOUA = \{/);
  for (const camp of ["attempts: 0", "next_retry_at: null", "abandonat_la: null", "last_error: null"]) {
    assert.match(coada, new RegExp(camp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), camp);
  }
  /*
   * ⚠ SE NUMARA CAILE, NU APARITIILE. Proba cerea pana azi exact doua aparitii, si a picat
   * cand a aparut a treia — `publicaProduseNoiTrendyolMany`, o cale NOUA si corecta. Un numar
   * fix ar fi pedepsit tocmai adaugarea pe care regula o cere.
   *
   * Regula adevarata e: ORICE cale care pune la coada trebuie sa stearga marcajul de abandon.
   */
  for (const cale of ["enqueueTrendyolSync", "enqueueMany", "publicaProduseNoiTrendyolMany"]) {
    const i = coada.indexOf(`function ${cale}(`);
    assert.ok(i > 0, `exista ${cale}`);
    /* Corpul functiei: de la ea pana la urmatorul `export`, oricare ar fi el. */
    const urm = coada.slice(i + 10).search(/^export /m);
    const corp = urm > 0 ? coada.slice(i, i + 10 + urm) : coada.slice(i);
    assert.match(corp, /\.\.\.CERERE_NOUA/, `${cale} sterge marcajul de abandon`);
  }
});

test("⚠ un refuz asteapta crescator, nu se reia din cinci in cinci minute", () => {
  /* Pana acum se scriau doar `attempts` si `last_error`, deci randul se relua imediat ce
     expira inchirierea. Dar un produs caruia ii lipseste un atribut va fi refuzat la fel si
     peste cinci minute, iar fiecare reincercare arde o cerere din bugetul magazinului. */
  assert.match(cron, /function asteptareaUrmatoare\(incercari: number\): number \{/);
  assert.match(cron, /next_retry_at: new Date\(Date\.now\(\) \+ asteptareaUrmatoare\(attempts\)\)/);
});

/* ── 2) „N-am putut intreba" nu e „nu exista" ──────────────────────────────── */

test("⚠ citirea produsului nu mai poate scoate marfa de la vanzare", () => {
  /*
   * CEA MAI SCUMPA CITIRE DIN MODUL. `syncProductNow` facea:
   *
   *     const { data: product } = await admin.from("products")...maybeSingle();
   *     if (!product) return removeProductNow(...)
   *
   * PostgREST nu arunca la refuz: intoarce `{ data: null, error }`. Deci o pana de o clipa a
   * bazei arata IDENTIC cu „produsul nu mai exista in magazin", si de acolo se pleaca pe
   * calea care scoate produsul de la vanzare de pe Trendyol. Una singura, picata la momentul
   * nepotrivit, goleste un canal intreg.
   */
  assert.match(sync, /randCitit<Record<string, unknown>>\("trendyol\.produsulDeSincronizat"/);
  assert.match(sync, /randCitit<Record<string, unknown>>\("trendyol\.produsulPentruStoc"/);
  assert.match(sync, /randCitit<ListingRow>\("trendyol\.listarea"/);
  assert.match(sync, /randuriCitite<\{ barcode: string; listing_id: string \}>\("trendyol\.barcodeLuat"/);
});

test("⚠ regula sta acum in casa, nu intr-un singur folder", () => {
  /*
   * `randCitit` era scris pentru eMAG si politat de `emag/citire.test.ts` DOAR in
   * `src/lib/emag`. Trendyol avea aceeasi gaura si n-avea de unde s-o vada. Mutat in
   * `@/lib/supabase/rand-citit`; fisierul eMAG ramane ca reexport, ca sa nu ceara rescrierea
   * a douazeci de importuri si a probei lui.
   */
  const partajat = viu("src/lib/supabase/rand-citit.ts");
  assert.match(partajat, /export class EroareCitireBaza/);
  assert.match(partajat, /export function randCitit</);
  assert.match(partajat, /export function randuriCitite</);
  const laEmag = readFileSync("src/lib/emag/citire.ts", "utf8");
  assert.match(laEmag, /export \{ EroareCitireBaza, randCitit, randuriCitite \} from "@\/lib\/supabase\/rand-citit";/);
});

test("⚠ aruncarea devine verdict TRECATOR, prins intr-un singur loc", () => {
  /*
   * Neprinsa, ar fi rupt bucla cronului: o pana pe UN produs ar fi oprit lucrarile TUTUROR
   * magazinelor din trecerea aceea. Prinsa mai adanc, fiecare citire ar fi trebuit sa stie
   * singura ce sa faca, si una uitata ar fi lasat gaura la loc.
   *
   * ⚠ `status: 0` nu e decor: `eTrecatoare` il citeste ca pana, deci elementul NU arde o
   * incercare si nu se abandoneaza fiindca baza noastra a clipit.
   */
  assert.match(sync, /if \(e instanceof EroareCitireBaza\) \{\s*return \{ ok: false, error: e\.message, status: 0 \};/);
  assert.equal(eTrecatoareDinSursa(0), true, "si zero chiar e trecator");
});

/** Citita din sursa, ca proba sa cada daca cineva schimba regula fara sa se uite aici. */
function eTrecatoareDinSursa(status: number): boolean {
  const m = /export function eTrecatoare\(status: number \| undefined\): boolean \{([\s\S]*?)\n\}/.exec(sync);
  assert.ok(m, "eTrecatoare se gaseste");
  return new Function("status", m![1])(status) as boolean;
}

test("⚠ nici numaratoarea listarilor nu mai arunca miscarea in tacere", () => {
  /*
   * `const { count } = ...; if (!count) return;` — o citire picata da `count: null`, iar
   * `!null` e `true`. Adica o pana arata identic cu „produsul n-are nicio listare", si
   * miscarea nu ajunge nici in coada, nici in jurnal. Aceeasi forma a fost inchisa la eMAG
   * cu o zi inainte, cu aceleasi cuvinte.
   */
  assert.match(coada, /const \{ count, error: eNumar \}/);
  assert.match(coada, /if \(eNumar\) \{[\s\S]{0,200}?inghiteDarScrie/);
});

/* ── 3) Registrul de loturi ────────────────────────────────────────────────── */

test("⚠ un lot primit de ei dar nescris la noi NU e o lucrare terminata", () => {
  /*
   *   POST la Trendyol   -> 200, `batchRequestId: ABC`
   *   insert in registru -> pica
   *   lucrarea           -> „submitted", iar cronul sterge elementul din coada
   *
   * Trendyol prelucreaza ABC mai departe. Daca il RESPINGE, noi nu aflam niciodata: n-avem
   * numarul dupa care sa intrebam si nici randul din care sa reluam. Produsul ramane
   * nelistat, iar panoul arata „trimis".
   */
  assert.match(sync, /async function recordBatch\([\s\S]{0,400}?\): Promise<boolean>/);
  assert.match(sync, /lotul a fost primit de Trendyol dar nu s-a scris in registru/);
  assert.equal(
    (sync.match(/if \(!scris\) return \{ ok: false, error: "lotul nu s-a putut scrie in registru", status: 0 \};/g) ?? []).length,
    2, "amandoua drumurile cozii",
  );
});

/* ── 4) O pana a lor nu e un lot esuat ─────────────────────────────────────── */

test("⚠ 429 si 5xx nu mai inchid un lot ca „esuat”", () => {
  /*
   * Forma dinainte crestea `attempts` la ORICE raspuns nereusit si, la a sasea, scria
   * `status: "failed"`. Dar sase indisponibilitati la rand inchideau ca esuat un lot pe care
   * Trendyol putea sa-l fi procesat cu succes — iar comerciantul vedea produse pe „eroare"
   * fara sa fie nimic in neregula cu ele.
   *
   * ⚠ SI TIPARUL EXISTA DEJA IN CASA: `aboutyou_batches` are `poll_errors` de mult, iar
   * `aboutyou/sync.ts` il foloseste exact asa. Trendyol pur si simplu nu-l primise.
   */
  assert.match(sync, /if \(eTrecatoare\(res\.status\)\) \{[\s\S]{0,400}?poll_errors: pene,/);
  /* ⚠ Si contorul se pune la zero cand legatura merge: altfel cinci pene rare de-a lungul
     unei luni ar fi asezat lotul deoparte pentru un sfert de ora degeaba. */
  assert.match(sync, /poll_errors: 0, next_poll_at: null/);
  /* ⚠ Un raspuns LIMPEDE al lor chiar spune ceva despre lot: acolo contorul vechi ramane. */
  assert.match(sync, /status: b\.attempts \+ 1 >= 6 \? "failed" : "retry"/);
});

test("⚠ si o citire picata a loturilor nu inseamna „niciun lot deschis”", () => {
  assert.match(sync, /randuriCitite<BatchRow>\("trendyol\.loturiDeschise"/);
  /* ⚠ Iar aruncarea nu rupe trecerea celorlalte magazine. */
  assert.match(cron, /loturile deschise nu s-au putut citi/);
});

/* ── 5) Returul nu repune stocul ───────────────────────────────────────────── */

test("⚠ „Returned” nu mai pune marfa inapoi pe raft singur", () => {
  /*
   * Trendyol are retururi pe LINIE si pe cantitate: dintr-o comanda de trei produse clientul
   * poate intoarce unul, iar pachetul devine `Returned`. Repus automat, stocul creste cu trei.
   * Si marfa intoarsa nu e mereu vandabila.
   *
   * ⚠ Anularile (`Cancelled`, `Unsupplied`, `UnPacked`) elibereaza mai departe: acolo marfa
   * n-a plecat nicaieri.
   */
  const orders = viu("src/lib/trendyol/orders.ts");
  const ful = viu("src/lib/trendyol/fulfillment.ts");
  assert.match(orders, /elibereazaStoc: edinioStatus !== "refunded",/);
  assert.match(ful, /elibereazaStoc: stareEdinio !== "refunded",/);
});

/* ── 6) Stergerea nu mai lasa marfa vandabila la ei ────────────────────────── */

test("⚠ listarea se uita NUMAI dupa ce marfa nu se mai vinde", () => {
  /*
   * ═══ CE ERA ═══
   *
   *   `zeroizeazaStocul` -> `console.warn` la esec (nici macar jurnal), apoi `return`
   *   apelantul          -> `delete from trendyol_listings` ORICUM
   *
   * Deci la Trendyol ramanea produsul, cu stoc > 0, IN CONTINUARE DE VANZARE, iar la noi nu
   * mai exista nicio urma ca a fost vreodata acolo. Se vinde marfa stearsa din magazin, si
   * nimeni nu mai are de unde afla.
   *
   * ⚠ ORDINEA E TOATA REPARATIA: arhivare (scoate din vanzare imediat), stoc zero (a doua
   * plasa), stergere adevarata, si abia apoi se uita listarea.
   */
  /*
   * ⚠ ORDINEA S-A LUNGIT (26.08.2026). Nu mai e „arhivare, stergere, uitare" intr-o singura
   * trecere: arhivarea si stergerea sunt LOTURI, iar ei cer o zi de arhiva intre ele. Deci:
   *
   *     scoateDeLaVanzare      stoc zero + arhivare + `removing`
   *     pollOpenBatches        arhivarea confirmata -> `arhivat_la`
   *     stergeCePoateFiSters   dupa 25 de ore -> DELETE
   *     pollOpenBatches        stergerea confirmata -> abia acum se uita randul
   *
   * Ce ramane neschimbat, si e chiar miezul: uitarea vine ULTIMA, dupa ce marfa chiar nu se mai
   * vinde. Proba cere acum ordinea peste tot lantul, nu doar in prima functie.
   */
  assert.match(sync, /async function scoateDeLaVanzare\(/);
  const f = sync.slice(sync.indexOf("async function scoateDeLaVanzare("), sync.indexOf("export async function removeProductNow("));
  const iArh = f.indexOf("setArchiveState(");
  const iSemn = f.indexOf('status: "removing"');
  assert.ok(iArh > 0 && iSemn > iArh, "arhivarea, apoi piatra de mormant");

  /* ⚠ Stergerea propriu-zisa e in ALTA functie, si dupa ceas. */
  const g = sync.slice(sync.indexOf("export async function stergeCePoateFiSters("));
  const iCeas = g.indexOf('.lt("arhivat_la", prag)');
  const iSter = g.indexOf("deleteProducts(");
  assert.ok(iCeas > 0 && iSter > iCeas, "intai ceasul de arhiva, apoi stergerea");

  /* ⚠ Si uitarea randului, numai pe ramura de reusita a lotului. */
  /* ⚠ Domeniul se margineste la RAMURA de stergere: `lastIndexOf` pe tot restul fisierului
     nimerea alt `else`, dintr-o functie cu totul diferita. */
  const iDel = sync.indexOf('b.kind === "delete"');
  const h = sync.slice(iDel, sync.indexOf('b.kind === "inventory" && hardFail', iDel));
  assert.match(h.slice(h.lastIndexOf("} else {")), /\.delete\(\)\.eq\("business_id", ctx\.businessId\)/);
});

test("⚠ randul NU se mai sterge la retragere. Niciodata", () => {
  /*
   * ═══ ⚠ „PRIMIT DE EI" NU E „FACUT", SI ASTA E VALABIL SI PENTRU ARHIVARE (26.08.2026) ═══
   *
   * Forma dinainte cerea arhivarea, cerea stergerea, si uita listarea pe loc. Amandoua sunt
   * insa LOTURI ASINCRONE: raspunsul HTTP spune ca au primit cererea, nu ca au facut-o. Masurat
   * pe registrul nostru: 632 din 1954 de loturi de stoc au esuat la ei, 78 din 150 la produs.
   *
   * Deci se putea intampla, si nu era o inlantuire nefireasca: arhivare esuata, stoc esuat,
   * stergere esuata — si randul, sters deja. Produsul ramanea la vanzare la ei, iar la noi nu
   * mai era nicio urma ca a existat.
   */
  const f = sync.slice(sync.indexOf("async function scoateDeLaVanzare("), sync.indexOf("export async function stergeCePoateFiSters("));
  assert.match(f, /status: "removing"/);
  /* ⚠ Singurele stergeri locale ramase sunt cele in care produsul N-A AJUNS niciodata la ei:
     `draft`, si cel fara barcoduri. */
  assert.equal((f.match(/\.delete\(\)/g) ?? []).length, 2, "numai draft si fara-barcoduri");
  assert.doesNotMatch(f, /deleteProducts\(/, "stergerea nu mai pleaca odata cu arhivarea");
});

test("⚠ lotul de arhivare se URMARESTE, si `recordBatch` se verifica", () => {
  /* Ei ne dau un `batchRequestId` si noi nu-l putem scrie => rezultat NECUNOSCUT, nu reusit.
     Elementul se reia; arhivarea e idempotenta, deci reincercarea nu strica. */
  const f = sync.slice(sync.indexOf("async function scoateDeLaVanzare("), sync.indexOf("export async function stergeCePoateFiSters("));
  assert.match(f, /recordBatch\(admin, ctx\.businessId, arh\.data\.batchRequestId, "archive", \[listing\.id\]\)/);
  assert.match(f, /if \(!scris\) return \{ ok: false/);
});

test("⚠ stergerea asteapta ZIUA de arhiva ceruta de ei", () => {
  /*
   * Pentru un produs aprobat, `DELETE /products` e ingaduit abia dupa ce a stat arhivat peste o
   * zi. Ceruta imediat dupa arhivare, e refuzata pe buna dreptate — iar noi o citeam „gata".
   *
   * ⚠ Douazeci si cinci de ore, nu douazeci si patru: ceasul lor si al nostru nu bat la fel.
   */
  assert.match(sync, /const ORE_ARHIVA_INAINTE_DE_STERGERE = 25;/);
  const f = sync.slice(sync.indexOf("export async function stergeCePoateFiSters("));
  assert.match(f, /\.not\("arhivat_la", "is", null\)\.lt\("arhivat_la", prag\)/);
});

test("⚠ ceasul porneste la CONFIRMAREA arhivarii, nu la trimiterea ei", () => {
  /* Pornit la trimitere, ar fi pornit de la ceva care poate n-a avut loc. La esec `arhivat_la`
     ramane gol, deci stergerea nu pleaca niciodata si randul sta vizibil cu motivul scris. */
  const i = sync.indexOf('b.kind === "archive"');
  const f = sync.slice(i, i + 1200);
  assert.match(f, /arhivat_la: now/);
  assert.match(f, /if \(hardFail\) \{/);
  assert.match(f, /sters_eroare: `Arhivarea a esuat la ei/);
});

test("⚠ o stergere ESUATA nu mai uita listarea", () => {
  /*
   * Forma dinainte o uita si la esec, cu argumentul „produsul e oricum arhivat si pe stoc zero".
   * Dar niciuna din cele doua nu fusese confirmata atunci. Argumentul se sprijinea pe doua
   * presupuneri, iar pretul greselii era sa pierdem orice urma a unui produs inca vandabil.
   */
  const i = sync.indexOf('b.kind === "delete"');
  const f = sync.slice(i, i + 1800);
  assert.match(f, /\} else if \(hardFail\) \{/);
  assert.match(f, /sters_eroare:/);
  /* Stergerea locala e NUMAI pe ramura de reusita. */
  const iElse = f.lastIndexOf("} else {");
  assert.ok(iElse > f.indexOf("hardFail"), "stergerea locala vine dupa ramura de esec");
  assert.match(f.slice(iElse), /\.delete\(\)\.eq\("business_id", ctx\.businessId\)/);
});

test("⚠ zeroizarea are TREI verdicte si scrie in jurnal, nu in consola", () => {
  assert.match(sync, /type VerdictScoatere = "gata" \| "trecatoare" \| "refuz";/);
  assert.match(sync, /stocul nu s-a putut pune pe zero/);
  assert.doesNotMatch(sync, /console\.warn\(`\[trendyol\] zeroizarea/);
});

test("⚠ si Trendyol chiar are stergere, pe care n-o foloseam", () => {
  /* Comentariile porneau de la ideea ca ei n-au stergere. Au: `DELETE /products`, cu
     `batchRequestId` ca orice alta scriere de produs. */
  const client = viu("src/lib/trendyol/client.ts");
  assert.match(client, /export function deleteProducts\(auth: TrendyolAuth, barcodes: string\[\]\)/);
  assert.match(client, /"DELETE", `\/integration\/product\/sellers\/\$\{auth\.supplierId\}\/products`/);
  /* ⚠ Si lotul de stergere intra in registru, ca sa se poata afla verdictul lor. */
  /*
   * ⚠ SI LOTUL POARTA ID-UL LISTARII, nu barcodurile: la confirmare trebuie sa stim ce rand sa
   * uitam, iar barcodurile n-ar duce inapoi la el decat printr-o a doua citire.
   *
   * ⚠ Randul NU se mai sterge la primirea lotului. „Primit de ei" nu e „facut": in registrul
   * nostru loturile pica la ei des (632 esuate din 1954 la stoc, 78 din 150 la produs). Sta pe
   * `removing` pana cand `pollOpenBatches` afla ce s-a intamplat cu adevarat.
   */
  /* ⚠ Lotul poarta id-ul LISTARII, iar `recordBatch` se VERIFICA: primit de ei si nescris de
     noi inseamna rezultat necunoscut, deci se reia. */
  assert.match(sync, /recordBatch\(admin, ctx\.businessId, idLot, "delete", \[l\.id\]\)/);
  assert.match(sync, /sters_eroare: scris \? null :/);
  assert.match(sync, /\} else if \(b\.kind === "delete"\) \{/, "si lotul se citeste la sondare");
});

/* ── 7) Configurarea nu se mai rescrie intreaga ────────────────────────────── */

test("⚠ configurarea se imbina in Postgres, pe randul incuiat", () => {
  /*
   * In acelasi JSON scriu oameni diferiti in acelasi timp: comerciantul (setari), cronul
   * (cursoare, `last_sync_at`), reconcilierea (`reconcile_page`), webhook-ul. Cu
   * citire-modificare-scriere, oricare il calca pe celalalt.
   *
   * ⚠ Un cursor intors inapoi se repara singur; un marcaj scris O SINGURA DATA, nu.
   */
  const cfg = viu("src/lib/trendyol/config.ts");
  assert.match(cfg, /export async function patchTrendyolConfig\(/);
  assert.match(cfg, /p_column: "trendyol_config"/);
  /* ⚠ Peticul gol nu se trimite: ar rescrie randul degeaba. */
  assert.match(cfg, /if \(Object\.keys\(patch\)\.length === 0\) return true;/);
});

test("⚠ si cronul, si panoul trec pe acolo", () => {
  /* Reparata doar o parte, cursa ar fi ramas intreaga: e nevoie de AMANDOI ca sa se piarda
     ceva. */
  assert.match(cron, /await patchTrendyolConfig\(admin, businessId, patch\);/);
  assert.match(sync, /await patchTrendyolConfig\(admin, ctx\.businessId, \{ reconcile_page: pagina \}\);/);
  const act = viu("src/lib/actions/trendyol.actions.ts");
  assert.match(act, /const petic: Partial<TrendyolConfig> = \{/);
  assert.match(act, /await patchTrendyolConfig\(createAdminClient\(\), businessId, petic\)/);
  /* ⚠ Si harta de categorii, care se scria tot cu obiectul intreg. */
  assert.equal(
    (act.match(/patchTrendyolConfig\(createAdminClient\(\), businessId, \{ category_map: map \}\)/g) ?? []).length,
    3, "toate cele trei scrieri de harta",
  );
});

test("⚠ campul golit pleaca `null`, nu lipsa", () => {
  /*
   * Cea mai usor de gresit parte a trecerii la petic. Intr-o imbinare, cheia absenta inseamna
   * „las-o cum e", iar `undefined` dispare la serializare — deci adresa stearsa de comerciant
   * ar fi ramas pe loc, si nimeni n-ar fi inteles de ce.
   */
  const act = viu("src/lib/actions/trendyol.actions.ts");
  assert.match(act, /shipment_address_id: input\.shipment_address_id \?\? null/);
  assert.match(act, /brand_id: input\.brand_id \?\? null/);
  /* ⚠ Iar tipul spune adevarul, ca sa nu se sprijine nimeni pe `!== undefined`. */
  const tipuri = readFileSync("src/lib/trendyol/types.ts", "utf8");
  assert.match(tipuri, /shipment_address_id\?: number \| null;/);
  assert.match(tipuri, /brand_name\?: string \| null;/);
});
