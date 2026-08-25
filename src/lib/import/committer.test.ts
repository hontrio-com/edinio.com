import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";


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

/* ══════════════════════════════════════════════════════════════════════════
   AUDITUL 9.6 (25.08.2026, seara tarziu) — DOUA DEFECTE DIN CALEA DE IMPORT
   ══════════════════════════════════════════════════════════════════════════ */

/* ⚠ `import`, nu `require`: fisierul e ESM. Cu `require`, `npx tsx --test` trecea vesel si
   `npm test` cadea cu „require is not defined" — adica proba ar fi fost verde la mine si
   rosie in integrare. */
const sursaCommitter = () => readFileSync("src/lib/import/committer.ts", "utf8");

test("⚠ produsul poarta randul care l-a creat, si de-aia reluarea nu-l dubleaza", () => {
  /*
   * ═══ INSERTUL SI MARCAREA RANDULUI NU SUNT ATOMICE ═══
   *
   * Se scrie produsul, apoi se marcheaza randul „created". Cada a doua scriere pica — o
   * pana de retea, o repornire, un timeout — randul ramane `pending`, trecerea urmatoare
   * il ia de la capat, si se creeaza AL DOILEA produs identic.
   *
   * ⚠ UNICITATEA CARE EXISTA DEJA NU AJUTA: `products_source_external_uidx` cere
   * `external_id`, iar importurile din fisier n-au. Slugul se dedubleaza singur, deci al
   * doilea primeste alt slug si trece nestingherit.
   *
   * ⚠ MASURAT IN PRODUCTIE, intr-o tranzactie intoarsa inapoi: cu acelasi `import_row_id`
   * si slug diferit, a doua inserare a fost refuzata cu
   * `duplicate key value violates unique constraint "products_import_row_uidx"`, iar
   * citirea pe `(business_id, import_row_id)` a intors chiar produsul dintai.
   */
  const c = sursaCommitter();
  assert.match(c, /import_row_id: it\.rowId/, "cheia pleaca in insert");
  assert.match(c, /products_import_row_uidx/, "si `23505` pe ea se recunoaste");
  /* ⚠ Numele indexului sta uneori in `details`, nu in `message`. Cautat doar in `message`,
     tocmai cazul pentru care s-a facut cheia ar fi fost raportat drept slug duplicat. */
  assert.match(c, /error\.message \?\? ""\} \$\{error\.details \?\? ""/);
  /* ⚠ Recuperarea se face pe magazin SI pe rand: fara `business_id`, o citire scapata ar
     fi putut adopta produsul altcuiva. */
  assert.match(c, /\.eq\("business_id", businessId\)\.eq\("import_row_id", it\.rowId\)/);
});

test("⚠ randurile peste limita planului nu se mai marcheaza tacut", () => {
  /*
   * `update ... status: "skipped"` fara citirea erorii. O pana lasa randurile `pending`,
   * iar jobul le numara la nesfarsit ca „mai am de facut" — sau, si mai rau, o trecere
   * ulterioara cu alt plan le scrie ca produse pe care omul nu le-a platit.
   */
  const c = sursaCommitter();
  assert.match(c, /\{ count, error: eSarite \}/);
  /* ⚠ Aruncarea sta pe randul urmator, deci potrivirea trece peste spatiul alb: o proba
     scrisa pe o singura linie ar fi cazut la prima reformatare, nu la un defect. */
  assert.match(c, /if \(eSarite\) \{\s*throw new Error\(/);
});

test("⚠ marcarea randului picata se scrie in jurnal, nu se pierde", () => {
  /* Cu cheia de idempotenta, o marcare picata nu mai dubleaza nimic — dar tot tine jobul
     in loc. Trebuie sa se vada CE nu se poate scrie, nu doar ca nu se termina. */
  const c = sursaCommitter();
  assert.match(c, /\{ error: eMarcaj \}/);
  assert.match(c, /produsul s-a creat dar randul n-a putut fi marcat/);
});

test("⚠ jobul necitit nu mai e job sters", () => {
  /*
   * `const { data: jobRaw } = ...` fara `error`. La o pana de o clipa, `jobRaw` vine `null`
   * si functia raspundea `status: "failed", done: true` — adica exact ce raspunde pentru un
   * import CHIAR sters. Si `done: true` nu opreste doar bucla: pe calea din panou, apelantul
   * sterge apoi FISIERUL BRUT. Un import intreg pierdut, nici macar reluabil, dintr-o
   * secunda de retea.
   *
   * ⚠ Aruncarea e alegerea buna, nu intoarcerea: din cron e prinsa si scrisa, jobul ramane
   * `importing` si se reia; din panou e prinsa de apelant, care marcheaza esecul DAR nu mai
   * sterge fisierul.
   */
  const c = sursaCommitter();
  assert.match(c, /const \{ data: jobRaw, error: eJob \}/);
  assert.match(c, /if \(eJob\) throw new Error\(`jobul de import nu s-a putut citi/);
  /* ⚠ Lipsa ADEVARATA ramane `failed`: un job sters chiar n-are ce continua. */
  assert.match(c, /if \(!jobRaw\) return \{ status: "failed"/);
});
