import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   O PLASA CARE REPUNE LA COADA STERGE CONTORUL, DECI NIMIC NU SE ABANDONEAZA
   ══════════════════════════════════════════════════════════════════════════

   Coada are un prag: dupa cinci refuzuri, elementul se marcheaza abandonat si nu mai arde
   cereri. Iar o punere NOUA la coada sterge dinadins `attempts`, `pauze` si `abandonat_la` —
   corect, fiindca „omul a atins produsul" chiar inseamna date noi.

   ⚠ DAR PLASELE PUN LA COADA SINGURE. `produse_nesincronizate_emag` compara amprenta de
   continut cu ce s-a trimis; deriva compara pretul si stocul. Cand trimiterea e REFUZATA,
   `last_synced_at` nu se scrie, amprenta nu se potriveste niciodata, si plasa repune acelasi
   produs la fiecare zece minute. Cu contorul sters de fiecare data, pragul nu se atinge
   NICIODATA — si o oferta pe care eMAG n-o va accepta fara mana omului se reincearca la
   nesfarsit.

   ⚠ MASURAT IN PRODUCTIE, 25.08.2026, ora 19: sapte oferte VetDepo la `generation` 16 dupa
   opt ore — repuse la coada de saisprezece ori — reincercate la fiecare doua minute.
   `product_offer/save` avea ZERO reusite in sase ore: 60 de cereri, 60 de refuzuri, toate pe
   aceleasi sapte oferte. Motivele lor cer mana omului: PNK duplicat, EAN nevalid.

   ⚠ CE COSTA: fiecare refuz arde una din cele 3 cereri pe secunda ale magazinului — aceleasi
   prin care pleaca o miscare de stoc dupa o vanzare — si eMAG numara la limita de ritm si
   cererile nevalide.

   ⚠ SI DE-AIA DEOSEBIREA E PE APELANT, nu pe functie: atingerea produsului de catre om
   TREBUIE sa reaprinda un element abandonat. Aia e singura cale de a-l repune in miscare
   dupa ce comerciantul chiar a reparat cauza.
*/

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const q = viu("src/lib/emag/queue.ts");
const cron = viu("src/app/api/cron/emag-sync/route.ts");

test("⚠ o plasa nu atinge ce e deja in coada", () => {
  assert.match(q, /reluareAutomata\?: boolean;/);
  assert.match(q, /if \(optiuni\.reluareAutomata\) \{/);
  assert.match(q, /\.from\("emag_sync_queue"\)\.select\("offer_id"\)/);
  assert.match(q, /\.filter\(\(id\) => !dejaInCoada\.has\(id\)\)/);
});

test("⚠ o citire picata nu inseamna „coada e goala”", () => {
  /* Citita ca goala, plasa ar fi repus TOT — adica ar fi sters exact contoarele pe care
     steagul le apara, si tocmai in clipa in care baza nu e in apele ei. */
  const i = q.indexOf("if (optiuni.reluareAutomata) {");
  assert.match(q.slice(i, i + 700), /if \(error\) throw error;/);
});

test("⚠ AMANDOUA plasele trec pe calea automata", () => {
  /*
   * Reparata doar una, cealalta ar fi sters contorul mai departe — iar cele doua ating
   * acelasi rand: `produse_nesincronizate_emag` pune `oferta`, deriva pune `pret` si `stoc`.
   */
  assert.match(cron, /neplecate \+= await reluaAutomatEmagMany\(businessId, ids, "oferta"\);/);
  assert.match(cron, /reluaAutomatEmagMany\(ctx\.businessId, \[\.\.\.dePusLaRand\.pret\], "pret"\)/);
  assert.match(cron, /reluaAutomatEmagMany\(ctx\.businessId, \[\.\.\.dePusLaRand\.stoc\], "stoc"\)/);
  /* ⚠ Si nu mai raman apeluri vechi pe drumul plaselor. */
  assert.doesNotMatch(cron, /enqueueEmagSyncMany\(businessId, ids\)/);
  assert.doesNotMatch(cron, /enqueueEmagPretMany\(ctx\.businessId/);
  assert.doesNotMatch(cron, /enqueueEmagStocMany\(ctx\.businessId/);
});

test("⚠ OMUL trece mai departe, si reaprinde randul", () => {
  /*
   * Cea mai importanta proba din fisier. Daca steagul ar fi ajuns pe calea obisnuita, un
   * element abandonat n-ar mai fi putut fi repus NICIODATA — nici dupa ce comerciantul
   * repara chiar cauza refuzului. Reparatia ar fi inchis singura usa care conta.
   */
  assert.match(
    q,
    /export function enqueueEmagSyncMany\(businessId: string, productIds: \(string \| null \| undefined\)\[\]\): Promise<number> \{\s*return enqueueMany\(businessId, productIds, "oferta"\);/,
    "punerea obisnuita ramane fara steag",
  );
  const iRelua = q.indexOf("export function reluaAutomatEmagMany(");
  assert.ok(iRelua > 0, "calea de plasa are nume propriu");
  assert.match(q.slice(iRelua, iRelua + 300), /\{ reluareAutomata: true \}/);
});

test("⚠ pragul de abandon exista si chiar marcheaza randul", () => {
  /* Fara el, tot restul n-ar avea rost: elementele s-ar reincerca la nesfarsit oricum. */
  assert.match(cron, /const INCERCARI_MAXIM = \d+;/);
  assert.match(cron, /if \(incercari >= INCERCARI_MAXIM\) \{/);
  const i = cron.indexOf("if (incercari >= INCERCARI_MAXIM) {");
  assert.match(cron.slice(i, i + 500), /abandonat_la: new Date\(\)\.toISOString\(\)/);
});
