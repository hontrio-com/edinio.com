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

test("⚠ si lotul ORB nu mai primeste o retrimitere GHICITA, ci una VERIFICATA", () => {
  /*
   * ═══ ⚠ SASE ORE NU ERA O GARANTIE A NIMANUI (27.08.2026) ═══
   *
   * Un `necunoscut` fara `batchRequestId` se poate aseza la ei ORICAND. Raspunsul de dimineata era
   * o retrimitere amanata sase ore, cu speranta ca intre timp s-a asezat. Daca lotul vechi ajungea
   * la a opta ora, ramanea el - si nu mai exista nimic care sa declanseze alta retrimitere.
   *
   * ⚠ SE POATE CITI CE AU EI. `GET /products/` intoarce 23 de campuri, printre care stocul,
   * preturile, culoarea si marimea - MASURAT pe sandbox, o cerere, raspuns 200. Comentariile
   * noastre spuneau de saptamani ca „nici deriva nu se poate masura"; era fals, si nimeni nu
   * ceruse vreodata.
   */
  assert.match(sync, /async function derivaFataDeEi\(/);
  assert.match(sync, /await getProducts\(ctx\.auth, \{ style_key: listing\.style_key, per_page: 100 \}\)/);
  assert.match(sync, /if \(deriva === "diferit"\)/);
  /* Si amanarea ghicita a disparut cu totul. */
  assert.doesNotMatch(sync, /ASTEPTAREA_LOTULUI_ORB_MS/);
});

test("⚠ „n-am putut verifica” nu inchide lotul", () => {
  /*
   * Inchis atunci, n-ar mai exista nimic care sa ne aduca inapoi la produsul asta. Se reia la
   * trecerea urmatoare - acelasi principiu ca peste tot: necunoscutul nu se trateaza ca „e bine".
   */
  assert.match(sync, /if \(deriva === "necitibil"\) \{[\s\S]{0,400}?continue;/);
});

test("⚠ si reasertarea trebuie sa REUSEASCA inainte de a inchide lotul", () => {
  /*
   * Inainte scria un `critical` si iesea `void`. Deci, exact in clipa in care STIM ca la ei poate
   * fi o stare veche, o clipa proasta a bazei facea sa nu mai ramana nimic care sa oblige
   * retrimiterea: lotul se inchidea, iar produsul ramanea stricat acolo, tacut.
   */
  assert.match(sync, /\): Promise<boolean> \{[\s\S]{0,900}?if \(!productId\) return false;/);
  assert.match(sync, /if \(!await reasertaStareaCurenta\(admin, businessId, listing\.product_id, styleKey\)\) continue;/);
});

test("⚠ si nu se mai scaneaza 500 de listari sanatoase", () => {
  /*
   * Prima varianta citea `aboutyou_listings … limit(500)`. La zece mii de produse listate vedea o
   * douazecime, mereu aceleasi primele: fara cursor si fara rotatie, un lot orb al produsului
   * numarul opt mii n-ar fi primit niciodata nici macar reasertarea.
   *
   * Se porneste invers, de la LOTURILE problematice - putine, trecatoare, si cu index partial.
   */
  assert.match(sync, /\.from\("aboutyou_batches"\)\.select\("id, related_ids, generatie"\)/);
  assert.doesNotMatch(sync, /from\("aboutyou_listings"\)\.select\("style_key, generatie, product_id"\)/);
  assert.match(sync, /const MAX_LOTURI_ORBE = 20;/);
});

test("⚠ o setare globala schimbata repune produsele la coada", () => {
  /*
   * Comerciantul schimba cursul din 5 in 4.5. Se salva `fx.updated_at` - corect - dar NU se punea
   * nimic la coada, deci la About You ramaneau preturile vechi pana cand produsul se schimba din
   * alt motiv, poate niciodata. `valid_at` nu ajuta cu nimic: el apara ordinea intre doua
   * trimiteri, nu inlocuieste o trimitere care nu se face deloc.
   */
  assert.match(actiuni, /const doarPret = fxChanged/);
  assert.match(actiuni, /const op = dinNou \? "upsert" as const : "price" as const;/);
  assert.match(actiuni, /await enqueueForListings\(g\.supabase, businessId, op\)/);

  /*
   * ═══ ⚠ SI „INCOMPLET" NU MAI E UN CAPAT DE DRUM (27.08.2026) ═══
   *
   * Se scria in jurnal si se raspundea `success`. La douazeci si cinci de mii de produse, primele
   * douazeci de mii intrau in coada si ultimele cinci mii NU - iar ecranul spunea „Salvat".
   * Preturile alea puteau ramane vechi la About You pentru totdeauna. Nu e o limitare de
   * comoditate: e deriva de date, tacuta.
   */
  assert.match(actiuni, /fanout: r\.incomplet \? \{ op, dupa: r\.ultimulId \} : null/);
  const sync = viu("src/lib/aboutyou/sync.ts");
  assert.match(sync, /export async function continuaRaspandirea\(/);
  /* ⚠ Reluarea e EXACTA: ordinea e `product_id` crescator, deci nu poate nici sari, nici repeta. */
  assert.match(sync, /if \(dupa\) q = q\.gt\("product_id", dupa\);/);
  assert.match(sync, /\.order\("product_id", \{ ascending: true \}\)/);
  /* ⚠ Si campul se sterge ABIA cand s-a terminat. */
  assert.match(sync, /fanout: gata \? null : \{ op: f\.op, dupa \}/);
  /* Si cronul chiar continua, altfel cursorul ar fi doar o nota. */
  const cron = viu("src/app/api/cron/aboutyou-sync/route.ts");
  assert.match(cron, /raspandite \+= await continuaRaspandirea\(admin, ctx\)/);
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
