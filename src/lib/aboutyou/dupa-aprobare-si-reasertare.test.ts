import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   NU CONTROLAM ORDINEA LA EI — DECI SPUNEM ADEVARUL LA URMA (27.08.2026, tarziu)
   ══════════════════════════════════════════════════════════════════════════

   Generatia apara starea NOASTRA: un lot vechi care se aseaza nu mai scrie nimic la noi. Dar nu
   poate anula ce a facut el LA EI:

       GEN 10 → produsul ROSU → cererea ajunge la ei → conexiunea cade inainte de raspuns
       comerciantul schimba pe ALBASTRU
       GEN 11 → ALBASTRU → `completed` ✅
       mai tarziu, GEN 10 se prelucreaza la ei → ramane ROSU ❌

   Iar `inchideLoturileDepasite` scria ca „ce a trimis el a fost oricum inlocuit de ce am trimis
   dupa". Nu e garantat: loturile lor se prelucreaza asincron, si nicaieri in contract nu scrie ca
   doua loturi diferite se aseaza in ordinea trimiterii.

   ⚠ CE SE POATE FACE: nu presupunem ca noul a castigat - ne asiguram ca ULTIMUL lucru pe care il
   primesc e cel adevarat.
*/

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/^[ \t]*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const sync = viu("src/lib/aboutyou/sync.ts");
const actiuni = viu("src/lib/actions/aboutyou.actions.ts");

test("⚠ dupa un lot dintr-o generatie depasita se retrimite starea de ACUM", () => {
  assert.match(sync, /async function reasertaStareaCurenta\(/);
  /* Calea pe care il VEDEM asezandu-se: retrimitere imediata. */
  assert.match(sync, /await reasertaStareaCurenta\(admin, ctx\.businessId, listing\.product_id, listing\.style_key\);/);
  /* Si nu se mai spune „se ignora": lotul chiar a facut ceva la ei. */
  assert.doesNotMatch(sync, /se ignora`/);
});

test("⚠ si lotul ORB, pe care nu-l vom vedea niciodata, primeste o retrimitere AMANATA", () => {
  /*
   * Un `necunoscut` fara `batchRequestId` nu poate fi sondat. Deci nu-l asteptam: punem la coada o
   * retrimitere amanata cat sa fi apucat sa ajunga la ei. Ce vine la urma ramane.
   */
  assert.match(sync, /const ASTEPTAREA_LOTULUI_ORB_MS = 6 \* 60 \* 60 \* 1000;/);
  assert.match(sync, /reasertaStareaCurenta\(admin, businessId, l\.product_id, l\.style_key, ASTEPTAREA_LOTULUI_ORB_MS\)/);
  /* ⚠ Si numarul lor se citeste INAINTE de a-i inchide: dupa `update` n-am mai avea de unde sti. */
  const i = sync.indexOf('"aboutyou.loturiOrbe"');
  const j = sync.indexOf('status: "depasit"');
  assert.ok(i > 0 && j > i, "citirea trebuie sa fie inaintea inchiderii");
});

test("⚠ amanarea foloseste `next_retry_at`, pe care revendicarea il respecta deja", () => {
  /* Si `ignoreDuplicates` la varianta amanata: o retrimitere deja la coada face oricum treaba, iar
     impinsa inainte ar INTARZIA o lucrare gata de plecare. */
  assert.match(sync, /next_retry_at: new Date\(Date\.now\(\) \+ intarziereMs\)\.toISOString\(\)/);
  assert.match(sync, /ignoreDuplicates: true/);
});

test("⚠ o setare globala schimbata repune produsele la coada", () => {
  /*
   * Comerciantul schimba cursul din 5 in 4.5. Se salva `fx.updated_at` - corect - dar NU se punea
   * nimic la coada, deci la About You ramaneau preturile vechi pana cand produsul se schimba din
   * alt motiv, poate niciodata. `valid_at` nu ajuta cu nimic: el apara ordinea intre doua
   * trimiteri, nu inlocuieste o trimitere care nu se face deloc.
   */
  assert.match(actiuni, /const doarPret = fxChanged/);
  assert.match(actiuni, /await enqueueForListings\(g\.supabase, businessId, dinNou \? "upsert" : "price"\)/);
  /* ⚠ Si se alege ce e mai ieftin: `upsert` inseamna produsul intreg, cu verificari si loturi. */
  assert.match(actiuni, /input\.ship_countries != null/);
});

test("⚠ categoria nu se mai poate schimba dupa aprobare, si nu doar se avertizeaza", () => {
  /*
   * ⚠ Se opreste la SALVARE, nu la trimitere: oprita la trimitere, schimbarea era deja salvata la
   * noi, iar de-acolo orice comparatie intre ce credem si ce e la ei ar fi mintit.
   */
  assert.match(actiuni, /const APROBATE = new Set\(\["active", "published", "pending_active", "inactive"\]\);/);
  assert.match(actiuni, /nu mai acceptă schimbarea categoriei după ce produsul a fost aprobat/);
  /* ⚠ Si are o IESIRE scrisa: o regula care doar refuza e o usa incuiata fara clanta. */
  assert.match(actiuni, /elimină listarea și creează una nouă/);
});

test("⚠ marimea la fel, si comparata PE SKU, nu pe pozitie", () => {
  /* Variantele se pot reordona intre doua deschideri ale editorului; comparate pe indice, ar fi
     parut schimbate toate. */
  assert.match(actiuni, /const vechea = dupaSku\.get\(sku\);/);
  assert.match(actiuni, /nu mai acceptă schimbarea mărimii la varianta/);
  /* ⚠ O varianta NOUA n-are ce sa incalce: regula e despre schimbarea uneia deja aprobate. */
  assert.match(actiuni, /if \(!vechea\) continue;/);
});
