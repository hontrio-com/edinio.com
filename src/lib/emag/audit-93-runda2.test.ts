import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mesajOmenesc } from "./errors";

/* ══════════════════════════════════════════════════════════════════════════
   AUDITUL 9.3, A DOUA RUNDA (25.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Auditul a fost facut pe un instantaneu dinaintea lui `2048c4de`, deci patru din sapte
   constatari erau deja inchise. Fisierul asta pazeste NUMAI cele trei ramase, plus un tipar
   gasit in trafic pe care auditul nu-l avea.

   ⚠ Trei dintre ele traiesc in cai care ating baza de date, deci se dovedesc pe SURSA. E
   tiparul casei si e o unealta cu tais: o proba pe sursa spune ca linia exista, nu ca merge.
   De aceea fiecare verifica FORMA care conteaza, nu prezenta unui cuvant.
*/

const fisier = (p: string) => readFileSync(p, "utf8");
const faraComentarii = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/* ── P2 #2: factura nu mai pleaca pe o citire picata ─────────────────────── */

test("⚠ garda facturii sta pe loc cand baza n-a raspuns", () => {
  /*
   * Cea mai scumpa dintre cele patru. `is_complete: 0` inseamna „comanda se mai poate
   * schimba"; facturata asa, documentul pleaca pe cantitati care apoi se modifica.
   *
   * PostgREST nu arunca la un refuz — intoarce `{ data: null, error }` — iar tot corpul e
   * intr-un `try/catch` care inghite. Deci forma dinainte, care destructura numai `data`,
   * dadea `complet === undefined`, garda `if (complet === 0)` NU se declansa, si comanda
   * pleca la facturare.
   *
   * ⚠ Aici se STA PE LOC, spre deosebire de restul functiei, si asimetria e dinadins: o
   * trecere sarita se reia — `maybeAutoInvoice` e chemata din douasprezece cronuri de
   * curier — dar o factura fiscala gresita nu se retrage, se storneaza.
   */
  const cod = faraComentarii(fisier("src/lib/actions/invoice-auto.actions.ts"));
  assert.match(cod, /const \{ data: randEmag, error: eRandEmag \}/, "eroarea se citeste");
  assert.match(cod, /if \(eRandEmag\) return;/, "si chiar opreste");

  /* ⚠ Iar `null` ramane „mergi mai departe": o comanda fara steag n-are voie sa ramana
     fara factura pe veci. Cele doua necunoscute NU se confunda. */
  assert.match(cod, /if \(complet === 0\) return;/, "steagul lor se citeste in continuare");
});

test("⚠ numaratoarea din cronul de facturi nu mai tace", () => {
  /* `bazin ?? 0` facea dintr-o citire picata un „nicio comanda fara factura", si pasul se
     intorcea cu 0 fara sa scrie nimic. Ironia: nota care explica exact defectul asta statea
     optsprezece linii mai jos, pentru citirea urmatoare. */
  const cod = faraComentarii(fisier("src/app/api/cron/emag-sync/route.ts"));
  assert.match(cod, /const \{ count: bazin, error: eBazin \}/);
  assert.match(cod, /if \(eBazin\) \{[\s\S]{0,400}?logError\(/, "si se scrie in jurnal");
});

test("citirile de pe caile de AWB deosebesc caderea de lipsa", () => {
  /*
   * Cinci locuri, toate de aceeasi forma: `{ data }` fara `error`, urmat de „nu exista".
   * ⚠ Niciunul nu emitea ceva gresit — garzile de dedesubt tin — dar toate dadeau un
   * MOTIV fals, iar un motiv fals il trimite pe om sa caute unde nu e.
   */
  const cod = faraComentarii(fisier("src/lib/actions/emag.actions.ts"));
  for (const nume of ["eRand", "eAwbRand", "eRma", "eComandaRma"]) {
    assert.ok(cod.includes(nume), `eroarea ${nume} nu se citeste`);
  }
  /* ⚠ Aceeasi propozitie peste tot: comerciantul invata un singur mesaj, nu cinci. */
  const cate = (cod.match(/Baza de date nu a răspuns\. Încearcă din nou peste puțin\./g) ?? []).length;
  assert.ok(cate >= 5, `asteptam cel putin 5 locuri, sunt ${cate}`);
});

/* ── P1 #3: trecerea a doua chiar exista ─────────────────────────────────── */

test("⚠ codul omis nu mai asteapta o trecere care nu vine", () => {
  /*
   * eMAG refuza sa primeasca numele si codul in aceeasi cerere, deci codul se omite.
   * Forma dinainte se bizuia pe plasa sa aduca produsul inapoi — dar plasa taie anume
   * `when o.amprenta_continut is null then false`, IAR AMPRENTA E GOALA CHIAR FIINDCA NE-AM
   * ABTINUT S-O SCRIEM. Deci nu se intorcea niciodata, si se auto-intretinea.
   *
   * Leacul nu mai trece prin plasa: se scrie `nume_emag` cu ce am trimis, si se repune in
   * coada de-a dreptul.
   */
  const cod = faraComentarii(fisier("src/lib/emag/trimite.ts"));
  assert.match(cod, /sAIncheiat\(r\.verdict as VerdictEmag\) && aRamasCeva/, "ramura noua");
  assert.match(cod, /await maiTrebuieOTrecere\(admin, ctx, produs\.id, oferte as EmagProdusOferta\[\]\)/);
  assert.match(cod, /await enqueueEmagSyncMany\(ctx\.businessId, \[productId\]\)/, "chiar se repune in coada");

  /*
   * ⚠ SE SCRIE DIN INCARCATURA, NU DIN `produs.titlu`. Ce am trimis a fost TAIAT la limita
   * lor. Scris din titlul intreg, un produs cu nume lung ar fi parut mereu „schimbat", si
   * codul n-ar mai fi plecat NICIODATA — acelasi defect, mutat cu un pas mai incolo.
   */
  assert.match(cod, /nume_emag: \(o\.name \?\? ""\)\.trim\(\) \|\| null/, "numele TRIMIS, nu titlul");
  assert.doesNotMatch(cod, /nume_emag: taiat\(produs\.titlu/, "nu se re-socoteste");

  /* ⚠ Si numai randurilor carora chiar li s-a omis codul. */
  assert.match(cod, /oferte\.filter\(\(o\) => !o\.part_number/);
});

test("⚠ amprenta ramane scrisa NUMAI cand a plecat totul", () => {
  /* Perechea probei de sus. Scrisa si cand a ramas ceva, ar fi confirmat un continut pe
     care nu l-am trimis — chiar orbirea pe care amprenta o repara. */
  const cod = faraComentarii(fisier("src/lib/emag/trimite.ts"));
  assert.match(cod, /sAIncheiat\(r\.verdict as VerdictEmag\) && !aRamasCeva/);
  const i = cod.indexOf("amprenta_continut: amprentaContinutului(produs)");
  const j = cod.indexOf("sAIncheiat(r.verdict as VerdictEmag) && !aRamasCeva");
  assert.ok(j > 0 && i > j, "scrierea amprentei sta sub garda cu `!aRamasCeva`");
});

/* ── P1 #5: aprinsul steagului chiar porneste ceva ───────────────────────── */

test("⚠ „pornește sincronizarea” pune ofertele in coada", () => {
  /*
   * Filtrul din `identitatiUsoare` era deja reparat, dar butonul aprindea un steag si nu
   * facea nimic: oferta intra in coada abia la urmatoarea atingere a produsului, iar plasa
   * n-o prinde fiindca cere `last_synced_at is not null` — si o oferta preluata are gol
   * exact acolo.
   */
  const cod = faraComentarii(fisier("src/lib/actions/emag.actions.ts"));
  assert.match(cod, /if \(pornit\) await enqueueEmagSyncMany\(businessId, \[productId\]\)/, "una singura");
  assert.match(cod, /await enqueueEmagSyncMany\(businessId, produse\)/, "si toate");
});

test("⚠ cele 3.714 se citesc cu fetchAllRowsStrict, nu orbeste", () => {
  /* PostgREST taie la 1000 FARA sa spuna. Citite normal, doua mii sapte sute de oferte
     n-ar fi intrat in coada si nimeni n-ar fi aflat — chiar tiparul din §12.2. */
  const cod = faraComentarii(fisier("src/lib/actions/emag.actions.ts"));
  assert.match(cod, /fetchAllRowsStrict<\{ product_id: string \| null \}>\(\s*"emag\.porneste-toate"/);

  /* ⚠ Id-urile se iau INAINTE de UPDATE: dupa el nu mai poti deosebi ofertele tocmai
     aprinse de cele care erau deja pornite. */
  const iCitire = cod.indexOf('"emag.porneste-toate"');
  const iUpdate = cod.indexOf("update({ auto_sync: true");
  assert.ok(iCitire > 0 && iUpdate > iCitire, "citirea sta INAINTEA update-ului");

  /* ⚠ Coada e pe PRODUS, iar un produs poate avea 40 de oferte. Fara `Set`, intra de 40 de ori. */
  assert.match(cod, /new Set\(stinse\.map\(\(r\) => r\.product_id\)/);
});

/* ── Gasit in trafic, nu in audit ────────────────────────────────────────── */

test("⚠ „duplicate product documentation” nu mai iese in engleza", () => {
  /*
   * Prins in trafic pe 25.08.2026, pe `offer/save`:
   *
   *   „The offer is associated to a duplicate product documentation. In order to reactivate
   *    the offer, please attach it to product documentation with PNK D5VDPSBBM - Product id: 273"
   *
   * ⚠ Ramura de dublura se potriveste pe „is a duplicated product" si NU prinde formularea
   * asta. Masurat pe tot tabelul: era SINGURUL mesaj ramas netradus, si se repeta la
   * fiecare reincercare in fata comerciantului.
   */
  const m = mesajOmenesc(
    "ERROR: The offer is associated to a duplicate product documentation. In order to " +
    "reactivate the offer, please attach it to product documentation with PNK D5VDPSBBM - Product id: 273",
  );
  assert.match(m, /dublură/);
  assert.match(m, /D5VDPSBBM/, "fisa ceruta de ei se scoate din mesaj");
  assert.doesNotMatch(m, /The offer is associated/, "engleza a plecat");

  /* ⚠ Deosebirea fata de sora ei: acolo oferta NU S-A CREAT, aici oferta EXISTA dar nu se
     poate repune in vanzare. Doua stari diferite nu se spun la fel. */
  assert.doesNotMatch(m, /nu s-a creat/);
});

test("cele doua dubluri raman despartite", () => {
  const existent = mesajOmenesc("The offer is associated to a duplicate product documentation. …with PNK AAAAAA1BM");
  const nou = mesajOmenesc("The product you have tried to associate this offer to is a duplicated product. …with PNK BBBBBB2BM");
  assert.match(nou, /nu s-a creat/, "la creare se spune ca nu exista");
  assert.doesNotMatch(existent, /nu s-a creat/, "la reactivare oferta exista");
  assert.match(existent, /AAAAAA1BM/);
  assert.match(nou, /BBBBBB2BM/);
});
