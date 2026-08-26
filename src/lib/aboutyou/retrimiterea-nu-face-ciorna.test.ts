import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STARI_ALE_LOR, stareaDeTinutMinte, urmareaLotului } from "./sync";

/* ══════════════════════════════════════════════════════════════════════════
   O MODIFICARE LA UN PRODUS APROBAT IL DADEA INAPOI LA „CIORNA" (27.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   `pollOpenBatches` scria `draft` la FIECARE lot de produs incheiat cu bine, cu comentariul
   „exists as a draft on About You until published". Adevarat numai la prima trimitere: „Newly
   created products start in the `draft` state", iar un produs aprobat nu se mai intoarce acolo.

   Ce iesea, dupa orice modificare a unui produs activ:
     - panoul arata „Ciorna" pentru un produs care se vinde;
     - se punea la coada o publicare pe care n-o ceruse nimeni;
     - iar retragerea cerea `draft`, pe care documentatia il refuza dupa aprobare, deci
       comerciantul primea eroare la o retragere care ar fi mers.
*/

test("⚠ prima trimitere: ciorna, si publicarea se inlantuie", () => {
  /* Asta e singurul caz in care „draft" e adevarat, si singurul in care se publica singur. */
  assert.deepEqual(urmareaLotului("prima"), { status: "draft", publica: true });
});

test("⚠ retrimiterea unui produs ACTIV nu-l mai da inapoi la ciorna", () => {
  assert.deepEqual(urmareaLotului("active"), { status: "active", publica: false });
  assert.deepEqual(urmareaLotului("pending_approval"), { status: "pending_approval", publica: false });
  assert.deepEqual(urmareaLotului("published"), { status: "published", publica: false });
});

test("⚠ si ciorna lasata DINADINS nepublicata ramane nepublicata", () => {
  /*
   * Lantul de publicare exista tocmai ca „sa nu atinga ciornele vechi, lasate dinadins
   * nepublicate" \u2014 dar o retrimitere trecea exact prin `pending -> draft`, deci le publica la
   * prima modificare. Acum `draft` cunoscut inseamna `publica: false`.
   */
  assert.deepEqual(urmareaLotului("draft"), { status: "draft", publica: false });
});

test("⚠ cand nu stim unde ajunsese, nu se inventeaza o stare", () => {
  /*
   * `status: null` = „nu se atinge": ramane pe `pending`, si reconcilierea \u2014 care oricum trece
   * prin tot catalogul lor \u2014 scrie adevarul. Un `draft` inventat ar fi fost chiar minciuna
   * reparata.
   */
  assert.deepEqual(urmareaLotului("necunoscut"), { status: null, publica: false });
});

test("⚠ un rand vechi, fara coloana, se poarta ca o prima trimitere", () => {
  /*
   * Migratia adauga coloana cu `null` pe randurile existente. Citit ca „necunoscut", un produs
   * trimis prima oara ar fi ramas `pending` pentru totdeauna: nimeni nu i-ar mai fi cerut
   * publicarea, iar reconcilierea nu-l gaseste \u2014 nu exista inca la ei.
   */
  assert.deepEqual(urmareaLotului(null), { status: "draft", publica: true });
});

test("⚠ un status nou de-al lor nu e citit drept „prima trimitere”", () => {
  /* Lista lor se poate lungi fara sa ne intrebe. Necunoscutul cade pe „nu se atinge", nu pe
     „draft + publica": a doua ar fi republicat un produs viu. */
  assert.deepEqual(urmareaLotului("under_clarification"), { status: null, publica: false });
});

test("⚠ ce se tine minte inainte de a acoperi cu `pending`", () => {
  /* Fara `last_synced_at`, produsul n-a plecat niciodata: prima trimitere. */
  assert.equal(stareaDeTinutMinte({ status: "local", last_synced_at: null }), "prima");
  assert.equal(stareaDeTinutMinte({ status: "draft", last_synced_at: null }), "prima");
  /* A plecat si stim starea lui la ei. */
  assert.equal(stareaDeTinutMinte({ status: "active", last_synced_at: "2026-08-01" }), "active");
  /* A plecat, dar starea noastra e LOCALA si nu spune nimic despre ei. */
  for (const local of ["error", "pending", "local"]) {
    assert.equal(stareaDeTinutMinte({ status: local, last_synced_at: "2026-08-01" }), "necunoscut", local);
  }
});

test("⚠ `prima` si `necunoscut` nu se pot ciocni cu un status de-al lor", () => {
  /* Doua santinele intr-o coloana de text: daca About You ar avea vreodata un status cu acelasi
     nume, hotararea s-ar schimba tacut. */
  assert.ok(!STARI_ALE_LOR.has("prima"));
  assert.ok(!STARI_ALE_LOR.has("necunoscut"));
});

test("⚠ si cablajul: trimiterea scrie, lotul citeste, publicarea se supune", () => {
  /*
   * ⚠ Comentariile de LINIE se sterg PRIMELE: un `/*` intr-un comentariu de linie ar face
   * stergatorul de blocuri sa inghita restul fisierului, si proba ar trece pe gol.
   */
  const viu = readFileSync("src/lib/aboutyou/sync.ts", "utf8")
    .replace(/^[ \t]*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(viu.includes("stare_dinainte: stareaDeTinutMinte(listing)"), "trimiterea nu tine minte");
  assert.ok(viu.includes("const urmare = urmareaLotului(listing.stare_dinainte)"), "lotul nu citeste");
  assert.ok(viu.includes("if (listing.product_id && urmare.publica) {"), "publicarea nu se supune");
  /* Si `draft` nu se mai scrie neconditionat nicaieri pe calea lotului. */
  assert.ok(!viu.includes('setListingStatus(admin, listing.id, "draft", { error: null })'));
});
