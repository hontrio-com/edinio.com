import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   DOUA REGULI ALE LOR PE CARE NU LE PUTEM CITI (27.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Auditul spune ca (1) un produs `pending_approval` nu poate fi modificat - trebuie intors in
   `draft`, actualizat, si retrimis - si ca (2) categoria nu se mai poate schimba dupa aprobare.
   Documentatia lor sta in spatele contului de partener, deci n-am putut citi niciuna.

   ⚠ SE SPUN, NU SE IMPUN. Un blocaj construit pe o regula neverificata opreste lucruri care poate
   merg - si asta e mai rau decat o cerere respinsa, fiindca respingerea se vede si se poate relua,
   iar blocajul nostru nu se poate ocoli deloc. Aceeasi hotarare ca la `valid_at` si la schema de
   semnatura a webhook-urilor.
*/

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/^[ \t]*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const actiuni = viu("src/lib/actions/aboutyou.actions.ts");

test("⚠ produsul in aprobare primeste un avertisment, nu un blocaj", () => {
  assert.match(actiuni, /if \(rand\?\.status === "pending_approval"\) \{/);
  /* ⚠ `warnings`, nu `issues`: `issues` opreste trimiterea. */
  const i = actiuni.indexOf('rand?.status === "pending_approval"');
  const bucata = actiuni.slice(i, i + 500);
  assert.match(bucata, /warnings\.push\(/);
  assert.doesNotMatch(bucata, /issues\.push\(/);
});

test("⚠ retragerea in ciorna se FACE, nu se cere omului", () => {
  /*
   * ═══ ⚠ ERA DOAR UN AVERTISMENT (27.08.2026, seara) ═══
   *
   * Documentatia lor spune ca un produs in aprobare nu se modifica: se retrage in `draft`, se
   * schimba, si se retrimite. Noi doar avertizam si trimiteam oricum - „incearca si afla". Merge,
   * dar prost: cererea e refuzata dupa minute, iar omul afla tarziu si nu stie ce sa faca.
   *
   * Pasul exista de mult (`tintaRetragere` intoarce `draft` chiar pentru `pending_approval`); ce
   * lipsea era sa-l chemam noi.
   */
  const sync = viu("src/lib/aboutyou/sync.ts");
  assert.match(sync, /if \(listing\.status === "pending_approval"\) \{/);
  assert.match(sync, /await setRemoteStatus\(admin, ctx, productId, "draft"\)/);

  /*
   * ⚠ SI NU SE MERGE MAI DEPARTE IN ACEEASI TRECERE: `PUT /products/status` e tot asincron, deci
   * pana se aseaza lotul lui produsul E INCA in aprobare la ei. `status: 0` inseamna trecator,
   * deci elementul ramane in coada fara sa arda o incercare.
   */
  const i = sync.indexOf('if (listing.status === "pending_approval") {');
  const bucata = sync.slice(i, i + 800);
  assert.match(bucata, /status: 0,/);
  /* Si vine INAINTEA deschiderii unei generatii noi: altfel am fi ars una degeaba. */
  assert.ok(i < sync.indexOf('await admin.rpc("aboutyou_generatie_noua"'));
});

test("⚠ si textul din editor s-a schimbat odata cu codul", () => {
  /*
   * ⚠ Spunea „daca trimiterea e respinsa, apasa «Retrage»" - adevarat cat timp trimiteam oricum
   * si asteptam refuzul. Lasat asa, ar fi trimis omul sa faca de mana un lucru deja facut.
   */
  assert.match(actiuni, /Îl retragem automat în ciornă la trimitere/);
  assert.doesNotMatch(actiuni, /apasă „Retrage” în lista de produse/);
});

test("⚠ schimbarea categoriei dupa aprobare se semnaleaza, si numai atunci", () => {
  /*
   * Numai cand produsul e chiar dincolo de aprobare SI categoria ceruta difera de cea trimisa.
   * Pornit pe orice listare, avertismentul ar fi devenit zgomot si nimeni nu l-ar mai fi citit.
   */
  assert.match(actiuni, /const dupaAprobare = new Set\(\["active", "published", "pending_active", "inactive"\]\);/);
  assert.match(actiuni, /categoriaCeruta != null && categoriaCeruta !== rand\.category_id/);
  /* ⚠ Si categoria ceruta cade pe harta magazinului cand editorul n-o suprascrie - altfel fiecare
     produs fara categorie aleasa de mana ar fi parut ca si-o schimba. */
  assert.match(actiuni, /input\.category_id \?\? config\.category_map\?\.\[produs\.category \?\? ""\]\?\.category_id \?\? null/);
});

test("⚠ listarea se citeste strict: o pana nu inseamna „nu e in aprobare”", () => {
  assert.match(actiuni, /randCitit<\{ status: string; category_id: number \| null \}>\(/);
});
