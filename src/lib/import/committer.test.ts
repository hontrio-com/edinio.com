import test from "node:test";
import assert from "node:assert/strict";


/* ══════════════════════════════════════════════════════════════════════════
   IMPORTUL ISI ANUNTA CANALELE (24.08.2026)
   ══════════════════════════════════════════════════════════════════════════ */

test("importul anunta TOATE cele cinci canale, nu doar eMAG", async () => {
  /*
   * ═══ `grep -ci enqueue` DADEA ZERO IN TOATA CALEA DE IMPORT ═══
   *
   * Committer-ul scria direct in `products` si tacea. Iar calea normala de salvare le
   * anunta pe toate cinci (`product.actions.ts`, la creare si la editare). Deci un produs
   * editat din panou pleaca peste tot, iar acelasi produs editat prin CSV nu pleaca
   * nicaieri.
   *
   * ⚠ Un produs publicat pe eMAG, actualizat prin CSV, ramanea acolo cu titlul,
   * descrierea si imaginile VECHI. Iar deriva NU repara asta: ea compara doar pret si
   * stoc, iar continutul n-are nicio ruta de reparatie acolo.
   *
   * ⚠ Auditul extern l-a incadrat ca defect eMAG. Reparat asa, ar fi ramas patru canale
   * rupte — de aceea proba cere toate cinci.
   */
  const { readFileSync } = await import("node:fs");
  const sursa = readFileSync("src/lib/import/committer.ts", "utf8");

  for (const canal of [
    "enqueueGmcSyncMany", "enqueueOlxSyncMany", "enqueueAboutYouSyncMany",
    "enqueueTrendyolSyncMany", "enqueueEmagSyncMany",
  ]) {
    assert.match(sursa, new RegExp(canal), `importul nu anunta ${canal}`);
  }
});

test("anuntul vine INAINTEA curatarii randurilor", async () => {
  /*
   * ⚠ `curataRandurileReusite` sterge chiar randurile din care se afla ce produse s-au
   * atins (`product_import_rows.product_id`). Chemat dupa, anuntul n-ar gasi nimic si ar
   * tacea — adica ar arata identic cu reparatia, si n-ar face nimic.
   */
  const { readFileSync } = await import("node:fs");
  const sursa = readFileSync("src/lib/import/committer.ts", "utf8");
  const faraNote = sursa.replace(/\/\*[\s\S]*?\*\//g, "");

  const anunt = faraNote.indexOf("await anuntaCanalele(");
  const curatare = faraNote.indexOf("await curataRandurileReusite(");
  assert.notEqual(anunt, -1, "importul nu-si anunta canalele");
  assert.ok(anunt < curatare, "anuntul trebuie sa vina inaintea curatarii randurilor");
});

test("anuntul nu poate rupe importul", async () => {
  /*
   * ⚠ Un import incheiat cu bine n-are voie sa para picat fiindca o coada de marketplace
   * n-a raspuns. Aceeasi regula ca la curatare, care isi inghite esecul dinadins.
   */
  const { readFileSync } = await import("node:fs");
  const sursa = readFileSync("src/lib/import/committer.ts", "utf8");
  const i = sursa.indexOf("async function anuntaCanalele(");
  const corp = sursa.slice(i, sursa.indexOf(String.fromCharCode(10) + "}", i));
  assert.match(corp, /Promise\.allSettled/, "cele cinci cozi nu se pot rupe una pe alta");
  assert.match(corp, /catch/, "si nimic din ele nu poate rupe importul");
});

test("produsele NOI din import respecta „Publica automat produsele noi”", async () => {
  /*
   * ═══ „PRODUS NOU" N-ARE ASTERISC PENTRU COMERCIANT ═══
   *
   * `enqueueEmagSyncMany` sincronizeaza numai ofertele care EXISTA deja la ei — asa
   * trebuie, altfel orice atingere in masa ar publica tot catalogul. Dar un produs nou din
   * import n-are inca oferta, deci pica prin filtru si nu se publica NICIODATA.
   *
   * Iar omul a bifat „Publică automat produsele noi". Din formular mergea, din CSV nu.
   */
  const { readFileSync } = await import("node:fs");
  const sursa = readFileSync("src/lib/import/committer.ts", "utf8");
  const i = sursa.indexOf("async function anuntaCanalele(");
  const corp = sursa.slice(i, sursa.indexOf(String.fromCharCode(10) + "}", i));

  assert.match(corp, /publicaPeEmagMany/, "produsele noi trebuie sa treaca pe calea de publicare");
  assert.match(corp, /auto_publish/, "si NUMAI daca omul a cerut-o");
  assert.match(
    corp, /status === "created"/,
    "cele noi se despart de cele actualizate: pentru actualizate intrebarea e `auto_sync`",
  );
});

test("publicarea automata din import NU se face neconditionat", async () => {
  /*
   * ⚠ `publicaPeEmagMany` are `publicaSiFaraOferta: true`, deci trece de filtrul care
   * opreste restul. Chemata neconditionat, ar fi publicat pe eMAG orice import — chiar si
   * al unui comerciant care n-a bifat nimic. Steagul e intrebarea, nu importul.
   */
  const { readFileSync } = await import("node:fs");
  const sursa = readFileSync("src/lib/import/committer.ts", "utf8");
  assert.match(
    sursa, /autoPublish \? publicaPeEmagMany/,
    "publicarea trebuie sa atarne de steag, nu sa fie chemata mereu",
  );
});
