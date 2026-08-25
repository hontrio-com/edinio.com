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
  assert.equal((coada.match(/\.\.\.CERERE_NOUA/g) ?? []).length, 2, "si la unul, si la mai multe");
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
