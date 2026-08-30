import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { categoriaNuPrimesteProduse, atributeObligatoriiLipsa } from "./mapping";
import type { OlxAttributeDef } from "./types";

/* ══════════════════════════════════════════════════════════════════════════
   CE A MURIT SE POATE INTOARCE, SI ECRANUL SPUNE CARE E CARE (31.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Trei lucruri, si toate trei se vad din acelasi loc — ecranul OLX al comerciantului:

   1. O sesiune expirata omoara TOATA coada in cincisprezece minute, si reconectarea n-o invia.
   2. Numarul „in coada" le lua si pe cele moarte, iar rotita se invartea la nesfarsit deasupra
      unei cozi in care nu se mai misca nimic.
   3. Harta de categorii se scria intreaga, deci a doua fila stergea maparea primei.
*/

const coada = readFileSync("src/lib/olx/queue.ts", "utf8");
const actiuni = readFileSync("src/lib/actions/olx.actions.ts", "utf8");
const callback = readFileSync("src/app/api/olx/oauth/callback/route.ts", "utf8");
const ecran = readFileSync("src/components/dashboard/OlxClient.tsx", "utf8");
const mapper = readFileSync("src/components/dashboard/OlxCategoryMapper.tsx", "utf8");
const config = readFileSync("src/lib/olx/config.ts", "utf8");
const oauth = readFileSync("src/lib/olx/oauth.ts", "utf8");

function faraComentarii(t: string): string {
  return t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

/* ── Harta de categorii ──────────────────────────────────────────────────── */

test("⚠ maparea unei categorii nu mai rescrie harta intreaga", () => {
  /*
   * `jsonb_merge_config` imbina SUPERFICIAL, deci un petic care poarta `category_map` inlocuieste
   * harta cu totul:
   *
   *     fila A si fila B au amandoua harta {Bijuterii}
   *     A mapeaza „Ceasuri" -> scrie {Bijuterii, Ceasuri}
   *     B mapeaza „Genti"   -> scrie {Bijuterii, Genti}
   *     -> „Ceasuri" a disparut, si nimeni n-a vazut nicio eroare
   *
   * ⚠ Iar pierderea nu se vede: produsele din categoria disparuta primesc chiar mesajul
   * „Categoria produsului nu este mapata" — adica exact ce omul crede ca a facut.
   */
  const i = actiuni.indexOf("export async function saveOlxCategoryMapEntry");
  const corp = faraComentarii(actiuni.slice(i, actiuni.indexOf("\nexport ", i + 10)));
  assert.doesNotMatch(corp, /category_map/, "harta nu se mai citeste ca s-o scriem inapoi");
  assert.match(corp, /await setOlxCategoryMapEntry\(createAdminClient\(\), businessId, edinioCategory, entry\)/);
  /* ⚠ Si scrierea chiar merge pe cheie, in baza, sub lacatul randului. */
  assert.match(config, /await admin\.rpc\("olx_seteaza_categoria", \{/);
  assert.match(config, /p_categorie: categorie,/);
  /* ⚠ Fara cale de rezerva: orice rezerva ar fi tot un citeste-modifica-scrie, adica defectul. */
  const j = config.indexOf("export async function setOlxCategoryMapEntry");
  assert.doesNotMatch(faraComentarii(config.slice(j)), /\.from\("store_settings"\)/);
});

test("⚠ o categorie de joburi nu primeste produse", () => {
  /*
   * ⚠ Arborele OLX tine si Locuri de munca: acolo pretul nu e pret, e SALARIU. Un anunt de vanzare
   * pus acolo e, in cel mai bun caz, refuzat — iar mesajul lor nu spune omului ce a gresit.
   *
   * ⚠ Se citeste TIPUL declarat de ei, nu numele categoriei: numele se traduc si se schimba.
   */
  const joburi: OlxAttributeDef[] = [
    { code: "salary_from", label: "Salariu de la", validation: { type: "salary" } },
    { code: "type", label: "Tip", validation: { type: "attribute", required: true } },
  ];
  assert.match(categoriaNuPrimesteProduse(joburi) ?? "", /Locuri de muncă/);
  const produse: OlxAttributeDef[] = [
    { code: "state", label: "Stare", validation: { type: "attribute", required: true } },
    { code: "price", label: "Preț", validation: { type: "price" } },
  ];
  assert.equal(categoriaNuPrimesteProduse(produse), null, "`price` e normal, `salary` nu");
  assert.equal(categoriaNuPrimesteProduse([]), null);
});

test("⚠ atributele obligatorii se cer, dar numai cele care se pun de mana", () => {
  const atr: OlxAttributeDef[] = [
    { code: "state", label: "Stare", validation: { type: "attribute", required: true } },
    { code: "brand", label: "Marcă", validation: { type: "attribute", required: true } },
    { code: "color", label: "Culoare", validation: { type: "attribute", required: false } },
    /* ⚠ `price` e obligatoriu la ei, dar se scoate din PRODUS — cerut in mapare, ar fi blocat-o. */
    { code: "price", label: "Preț", validation: { type: "price", required: true } },
  ];
  assert.deepEqual(atributeObligatoriiLipsa(atr, {}), ["Stare", "Marcă"]);
  assert.deepEqual(atributeObligatoriiLipsa(atr, { state: "nou", brand: "X" }), []);
  /* ⚠ Un sir gol si o lista goala inseamna „necompletat", nu „completat cu nimic". */
  assert.deepEqual(atributeObligatoriiLipsa(atr, { state: "  ", brand: [] }), ["Stare", "Marcă"]);
  assert.deepEqual(atributeObligatoriiLipsa(atr, undefined), ["Stare", "Marcă"]);
});

test("⚠ serverul verifica el insusi, si cu ACEEASI regula ca ecranul", () => {
  /*
   * `saveOlxCategoryMapEntry` e o adresa. Verificarile stateau numai in ecran, deci orice cerere
   * care nu trecea prin el salva ce voia — iar pretul se plateste mai tarziu si in alta parte:
   * produsul tace, si vina pare a lui, nu a maparii.
   */
  const i = actiuni.indexOf("export async function saveOlxCategoryMapEntry");
  const corp = actiuni.slice(i, actiuni.indexOf("\nexport ", i + 10));
  assert.match(corp, /const attributes = await getOlxCategoryAttributesCached\(entry\.category_id\)/);
  assert.match(corp, /if \(attributes === null\) return \{ error:/,
    "daca nu putem verifica, nu salvam");
  assert.match(corp, /categoriaNuPrimesteProduse\(attributes\)/);
  /*
   * ⚠ Ancora cerea `atributeObligatoriiLipsa(attributes, entry.attributes)`. **Avea dreptate sub
   * premisa de-atunci**: maparea ERA un `Record<string, string | string[]>`, deci se putea da
   * direct. De cand fiecare atribut are o SURSA — camp al produsului, specificatie, varianta —
   * valorile nu mai exista in clipa salvarii, si se verifica doar ca legatura EXISTA.
   *
   * Regula n-a schimbat-o nimic: serverul cheama ACEEASI functie ca ecranul.
   */
  assert.match(corp, /atributeObligatoriiLipsa\(attributes, legatoriDeAtribute\(entry\.attributes\)\)/);
  /* ⚠ Si tot aici se verifica regulile LOR, nu doar „obligatoriu". */
  assert.match(corp, /nereguliAtribute\(attributes, constante\)/);
  /*
   * ⚠ Si ecranul cheama ACELEASI functii, nu o copie a lor. Scrise de doua ori, s-ar fi despartit
   * la prima schimbare — iar ecranul ar fi lasat sa treaca exact ce serverul refuza.
   */
  assert.match(mapper, /categoriaNuPrimesteProduse\(attributes \?\? \[\]\)/);
  assert.match(mapper, /atributeObligatoriiLipsa\(attributes \?\? \[\], legatoriDeAtribute\(attrValues\)\)/);
  assert.doesNotMatch(faraComentarii(mapper), /validation\?\.required && a\.validation\?\.type === "attribute"/,
    "regula copiata in ecran se desparte de cea de pe server");
});

/* ── Scrisorile moarte ───────────────────────────────────────────────────── */

test("⚠ reconectarea reporneste ce a omorat expirarea", () => {
  /*
   * Cauza cea mai obisnuita a unei cozi moarte nu e un produs stricat, ci sesiunea: tokenul expira
   * dimineata, fiecare lucrare esueaza de cinci ori in cincisprezece minute, si tot ce avea
   * magazinul de trimis moare. Pana azi, omul reconecta seara si NIMIC nu repornea.
   */
  assert.match(callback, /const inviate = await invieScrisorileMoarteOlx\(admin, businessId\);/);
  /* ⚠ Si invierea NU opreste conectarea: codul de la OLX e deja consumat, deci un „n-a mers" l-ar
     trimite inapoi la un dans pe care nu-l mai poate relua. */
  const i = callback.indexOf("const inviate = await");
  const dupa = faraComentarii(callback.slice(i));
  assert.doesNotMatch(dupa, /return back\(req, "olx=(error|save_failed)"\)/,
    "o inviere picata n-are voie sa strice o conexiune buna");
  assert.match(dupa, /console\.error/);
});

test("⚠ invierea alege randurile moarte, si le da un ceas nou", () => {
  const i = coada.indexOf("export async function invieScrisorileMoarteOlx");
  const corp = coada.slice(i);
  /* ⚠ `not(..., "is", null)`: pe o coloana nulabila, un filtru de lista sare peste NULL. */
  assert.match(corp, /\.not\("abandonat_la", "is", null\)/);
  assert.match(corp, /abandonat_la: null,/);
  assert.match(corp, /attempts: 0,/);
  /*
   * ⚠ `created_at` REPORNESTE: ceasul de varsta al cronului masoara asteptarea INTENTIEI. Fara el,
   * o coada moarta de o saptamana s-ar reabandona la prima trecere.
   */
  assert.match(corp, /created_at: new Date\(\)\.toISOString\(\)/);
  /* ⚠ Si marcajul de revendicare se sterge: un rand abandonat nu poate fi tinut de nimeni. */
  assert.match(corp, /revendicat_pana: null,/);
  /* ⚠ Se citeste cate au fost, ca omul sa afle daca s-a intamplat ceva. */
  assert.match(corp, /if \(error\) return \{ ok: false, error: error\.message \};/);
});

test("⚠ „in coada” si „oprita” se numara deosebit", () => {
  /*
   * Numarul lua toate randurile, iar ecranul arata pentru el o rotita si „Se publică N produse pe
   * OLX…", cu reimprospatare din cinci in cinci secunde. Peste scrisori moarte, alea se invart la
   * nesfarsit deasupra unei cozi in care nu se mai misca NIMIC — ecranul minte, cu cea mai
   * linistitoare fata cu putinta.
   */
  assert.match(actiuni, /from\("olx_sync_queue"\)[^\n]*\.is\("abandonat_la", null\)/);
  assert.match(actiuni, /from\("olx_sync_queue"\)[^\n]*\.not\("abandonat_la", "is", null\)/);
  assert.match(actiuni, /oprite: oprite \?\? 0,/);
  /* ⚠ Si rotita se invarte numai peste lucrari VII. */
  assert.match(ecran, /if \(c\.queued <= 0\) return;/);
  const i = ecran.indexOf("{c.queued > 0 && (");
  const banner = ecran.slice(i, ecran.indexOf("{c.oprite > 0 && (", i));
  assert.match(banner, /animate-spin/);
  assert.doesNotMatch(banner, /c\.oprite/, "cele oprite n-au ce cauta sub rotita");
});

test("⚠ omul are o usa catre lucrarile oprite", () => {
  assert.match(ecran, /\{c\.oprite > 0 && \(/);
  assert.match(ecran, /await reincearcaOlxOprite\(businessId\)/);
  /* ⚠ Butonul se cheama cum il vede el, si actiunea exista chiar cu numele asta. */
  assert.match(ecran, /Reîncearcă/);
  assert.match(actiuni, /export async function reincearcaOlxOprite\(/);
  const i = actiuni.indexOf("export async function reincearcaOlxOprite");
  const corp = actiuni.slice(i, actiuni.indexOf("\nexport ", i + 10));
  assert.match(corp, /const g = await guard\(businessId\);/, "usa e a proprietarului, nu a oricui");
  assert.match(corp, /if \(!r\.ok\) return \{ error:/);
});

/* ── `state`, adica singura legatura dintre dans si cel care l-a pornit ──── */

test("⚠ `state` nu se mai semneaza cu o cheie scrisa in cod", () => {
  /*
   * ⚠ Caderea era `"edinio-olx-state"`, adica o cheie stiuta de oricine deschide depozitul. Cu ea,
   * `state` se poate FABRICA:
   *
   *     atacatorul isi autorizeaza propriul cont OLX si tine `code`-ul
   *     fabrica un `state` pentru magazinul victimei si o pacaleste sa deschida adresa
   *     -> contul LUI ajunge legat la magazinul EI, si produsele ei se publica la el
   *
   * (Paza de proprietate din callback nu prinde asta: businessul chiar e al ei, si ea chiar e
   * autentificata. Semnatura e ce lipseste.)
   */
  assert.doesNotMatch(faraComentarii(oauth), /"edinio-olx-state"/);
  assert.match(oauth, /if \(!s\) throw new Error\("OLX_CLIENT_SECRET lipseste/);
});

test("⚠ semnatura se compara in timp constant", async () => {
  /*
   * `!==` pe siruri iese la primul caracter deosebit, deci timpul de raspuns spune cate caractere
   * s-au potrivit — si semnatura se poate ghici caracter cu caracter, fara sa stii cheia.
   */
  assert.match(oauth, /crypto\.timingSafeEqual\(a, b\)/);
  assert.match(oauth, /a\.length !== b\.length \|\| !crypto\.timingSafeEqual/,
    "`timingSafeEqual` arunca la lungimi deosebite");

  process.env.OLX_CLIENT_SECRET = "cheie-de-proba-pentru-state";
  const { signState, verifyState } = await import("./oauth");
  const biz = "11111111-2222-3333-4444-555555555555";
  assert.equal(verifyState(signState(biz)), biz, "un `state` propriu se recunoaste");
  /* ⚠ Orice atingere il strica: semnatura acopera si businessId, si clipa. */
  const bun = signState(biz);
  const stricat = Buffer.from(
    Buffer.from(bun, "base64url").toString("utf8").replace(biz, "99999999-2222-3333-4444-555555555555"),
  ).toString("base64url");
  assert.equal(verifyState(stricat), null);
  assert.equal(verifyState("nu-e-nimic"), null);
  assert.equal(verifyState(""), null);
});

test("⚠ o clipa fara inteles nu inseamna „acum”", async () => {
  /*
   * ⚠ `Number("maine")` da `NaN`, iar `NaN > 15 * 60_000` e FALS — deci o clipa necitibila trecea
   * de paza de vechime ca si cum ar fi fost proaspata.
   */
  process.env.OLX_CLIENT_SECRET = "cheie-de-proba-pentru-state";
  const crypto = await import("node:crypto");
  const { verifyState } = await import("./oauth");
  const biz = "11111111-2222-3333-4444-555555555555";
  for (const ts of ["maine", "", "NaN"]) {
    const sig = crypto.createHmac("sha256", "cheie-de-proba-pentru-state")
      .update(`${biz}.${ts}`).digest("hex").slice(0, 32);
    const state = Buffer.from(`${biz}.${ts}.${sig}`).toString("base64url");
    assert.equal(verifyState(state), null, `„${ts}" a trecut ca proaspat`);
  }
  /* Si una veche de o ora e tot refuzata, ca pana acum. */
  const vechi = String(Date.now() - 60 * 60_000);
  const sig = crypto.createHmac("sha256", "cheie-de-proba-pentru-state")
    .update(`${biz}.${vechi}`).digest("hex").slice(0, 32);
  assert.equal(verifyState(Buffer.from(`${biz}.${vechi}.${sig}`).toString("base64url")), null);
});
