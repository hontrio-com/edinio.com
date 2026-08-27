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
  assert.match(sync, /reasertaStareaCurenta\(admin, ctx\.businessId, listing\.product_id, listing\.style_key\)/);
  /* Si nu se mai spune „se ignora": lotul chiar a facut ceva la ei. */
  assert.doesNotMatch(sync, /se ignora`/);

  /*
   * ═══ ⚠ SI RETRIMITEREA NEPUSA LA COADA TINE LOTUL DESCHIS (27.08.2026, noaptea) ═══
   *
   * Raspunsul lui `reasertaStareaCurenta` se arunca aici: `await` gol, si mai departe. Deci exact
   * in clipa in care STIM ca la ei s-a asezat o versiune veche, o clipa proasta a bazei facea sa
   * nu mai ramana nimic care sa oblige retrimiterea — iar lotul se inchidea ca reusit.
   */
  assert.match(sync,
    /if \(!await reasertaStareaCurenta\(admin, ctx\.businessId, listing\.product_id, listing\.style_key\)\) \{[\s\S]{0,200}?asezat = false;/);
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
  assert.match(sync, /getProducts\(ctx\.auth, \{ style_key: listing\.style_key, page, per_page: 100 \}\)/);
  assert.match(sync, /if \(deriva\.fel === "diferit"\)/);
  /* Si amanarea ghicita a disparut cu totul. */
  assert.doesNotMatch(sync, /ASTEPTAREA_LOTULUI_ORB_MS/);
});

test("⚠ si citirea merge pana la capat, nu doar prima suta", () => {
  /*
   * ═══ ⚠ `per_page` E PLAFONAT LA 100 LA EI (27.08.2026, noaptea) ═══
   *
   * Chiar de-aia `POST /products/` se rupe in loturi de 100. Prima varianta a comparatiei cerea o
   * singura pagina, deci la un produs cu 250 de variante:
   *
   *     ce vrem noi:   250 de SKU-uri
   *     ce vedem:      primele 100
   *     concluzia:     varianta 101 „lipseste la ei" -> deriva -> retrimitere
   *
   * La FIECARE citire, pentru totdeauna. Iar SKU-urile in plus de pe paginile 2 si 3 — chiar
   * scurgerile pe care comparatia inversa le cauta — n-ar fi fost vazute niciodata.
   */
  assert.match(sync, /for \(let page = 1; page <= MAX_PAGINI_DERIVA; page\+\+\)/);
  /* ⚠ Oprirea se ia din LUNGIMEA lotului: `pagination.pages` e nulabil in schema lor. */
  assert.match(sync, /if \(items\.length < 100\) \{ taiat = false; break; \}/);
  /* ⚠ Si „n-am vazut tot" nu e „e bine": nu se declara nimic despre produsul acela. */
  assert.match(sync, /if \(taiat\) return \{ fel: "necitibil", \.\.\.nimic \};/);
});

test("⚠ si se compara SI INVERS: ce au ei si noi nu", () => {
  /*
   * ═══ ⚠ O VARIANTA RETRASA CARE REDEVINE VANDABILA (27.08.2026, noaptea) ═══
   *
   *     SKU A si SKU B publicate; SKU B se retrage -> stoc 0 la ei, `removed` la noi
   *     un lot vechi intarziat reaplica SKU B      -> la ei are iar stoc
   *     starea dorita de acum contine doar SKU A
   *
   * Comparatia mergea intr-o singura directie: fiecare SKU pe care il VREM trebuie sa fie la ei.
   * B nu e in lista noastra, deci nimeni nu-l cauta; iar fiindca local e `removed`,
   * `reconciliazaVariante` nu-l mai pune niciodata in `deScos`. Marfa scoasa de la vanzare se
   * vinde mai departe, si nimic la noi n-o arata vreodata.
   */
  assert.match(sync, /if \(aleNoastre\.has\(sku\)\) continue;/);
  assert.match(sync, /if \(\(alLor\.quantity \?\? 0\) > 0\) \{/);
  /* ⚠ Piatra de mormant se ridica: altfel retrimiterea n-ar folosi la nimic, `deScos` o sare. */
  assert.match(sync, /if \(local\.ay_status === "removed"\) dePiatraRidicata\.push\(local\.id\);/);
  assert.match(sync, /\.update\(\{ ay_status: null, updated_at: new Date\(\)\.toISOString\(\) \} as never\)/);
  /* ⚠ Iar daca ridicarea pietrei nu se scrie, nu se declara „diferit": s-ar trimite degeaba. */
  assert.match(sync, /if \(error\) return \{ fel: "necitibil", \.\.\.nimic \};/);
  /* ⚠ Un SKU cu totul strain NU se atinge: nu stim ce e, si nu luam hotarari in locul omului. */
  assert.match(sync, /straine\.push\(sku\); continue;/);
});

test("⚠ amprenta cuprinde ce s-a MASURAT ca se intoarce neschimbat", () => {
  /*
   * ═══ ⚠ CE INTRA SI CE NU, DUPA O MASURATOARE (27.08.2026, noaptea) ═══
   *
   * Amprenta lasa afara atributele si imaginile, cu explicatia ca „se pot rescrie sau reordona la
   * ei". Nu se masurase nimic. Pus langa raspunsul lor real, pe acelasi produs:
   *
   *   `attributes`  aceleasi numere, ALTA ORDINE  -> sortate, se compara exact
   *   materiale     identice pana la ordine       -> intra
   *   `weight`      300 trimis, 300 primit        -> intra
   *   `images`      REGAZDUITE si transcodate     -> NU intra deloc
   *
   * ⚠ URL-urile NU se compara, si nu din lene: plecam cu `edinio-cdn.com/….webp` si primim
   * `ayou-live-sellerscenter-s3.s3.amazonaws.com/….jpg`. Confruntate literal, fiecare citire ar
   * gasi „deriva" pe fiecare produs sanatos — o retrimitere fara capat a catalogului intreg.
   */
  assert.match(sync, /a: \[\.\.\.\(x\.attributes \?\? \[\]\)\]\.sort/);
  assert.match(sync, /g: x\.weight \?\? null,/);
  assert.match(sync, /mt: canonicMateriale\(x\.material_composition_textile\)/);
  assert.match(sync, /mn: canonicMateriale\(x\.material_composition_non_textile\)/);
  /*
   * ⚠ SI NICI MACAR NUMARUL DE IMAGINI. Produsul masurat are o singura culoare, iar noi trimitem
   * lista PE CULOARE: ce intorc ei pe unul multicolor nu stiu. Ramane doar comparatia intr-o
   * singura directie, din `derivaFataDeEi`. Vezi `veghea-lotului-orb.test.ts`.
   */
  assert.doesNotMatch(sync, /im: \(x\.images/);
});

test("⚠ „n-am putut verifica” nu inchide lotul", () => {
  /*
   * Inchis atunci, n-ar mai exista nimic care sa ne aduca inapoi la produsul asta. Se reia la
   * trecerea urmatoare - acelasi principiu ca peste tot: necunoscutul nu se trateaza ca „e bine".
   */
  assert.match(sync, /if \(deriva\.fel === "necitibil"\) \{[\s\S]{0,400}?continue;/);
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
  assert.match(actiuni, /await enqueueForListings\(g\.supabase, businessId, op, undefined, undefined, lucrare\.dupa\)/);

  /*
   * ═══ ⚠ SI „INCOMPLET" NU MAI E UN CAPAT DE DRUM (27.08.2026) ═══
   *
   * Se scria in jurnal si se raspundea `success`. La douazeci si cinci de mii de produse, primele
   * douazeci de mii intrau in coada si ultimele cinci mii NU - iar ecranul spunea „Salvat".
   * Preturile alea puteau ramane vechi la About You pentru totdeauna. Nu e o limitare de
   * comoditate: e deriva de date, tacuta.
   */
  const sync = viu("src/lib/aboutyou/sync.ts");
  assert.match(sync, /export async function continuaLucrarileInMasa\(/);
  /* ⚠ Reluarea e EXACTA: ordinea e `product_id` crescator, deci nu poate nici sari, nici repeta. */
  assert.match(sync, /if \(dupa\) q = q\.gt\("product_id", dupa\);/);
  assert.match(sync, /\.order\("product_id", \{ ascending: true \}\)/);
  /* ⚠ Si lucrarea se inchide ABIA cand s-a terminat. */
  assert.match(sync, /\.\.\.\(gata \? \{ status: "gata", terminat_la: acum \} : \{\}\)/);
  /* Si cronul chiar continua, altfel cursorul ar fi doar o nota. */
  const cron = viu("src/app/api/cron/aboutyou-sync/route.ts");
  assert.match(cron, /raspandite \+= await continuaLucrarileInMasa\(admin, ctx\)/);
  /* ⚠ Si se alege ce e mai ieftin: `upsert` inseamna produsul intreg, cu verificari si loturi. */
  assert.match(actiuni, /input\.ship_countries != null/);
});

test("⚠ urma lucrarii se scrie INAINTEA lucrului, nu dupa", () => {
  /*
   * ═══ ⚠ CURSORUL SE SCRIA LA SFARSIT, SI FARA SA I SE CITEASCA RASPUNSUL (27.08.2026, noaptea) ═══
   *
   *     25.000 de listari
   *     primele 20.000 intra in coada     ✅
   *     scrierea cursorului pica          ❌
   *     omul vede „Salvat"                ✅
   *
   * Ultimele 5.000 nu mai au NIMIC care sa le atinga vreodata. Aceeasi lectie ca la
   * `cuLotDurabil`, unde intentia se scrie inaintea cererii: ordinea nu e un amanunt.
   */
  const iDeschide = actiuni.indexOf("async function deschideLucrarea(");
  assert.ok(iDeschide > 0, "lucrarea trebuie sa se poata deschide inainte de lucru");
  /* ⚠ Randul se INSEREAZA, deci exista inainte ca vreo transa sa plece. */
  assert.match(actiuni, /\.from\("aboutyou_bulk_jobs"\)[\s\S]{0,80}?\.insert\(/);
  /* ⚠ Iar daca nu s-a putut deschide, actiunea NU spune ca a pornit. */
  assert.match(actiuni, /if \(!lucrare\) return \{ error: "Nu am putut porni sincronizarea/);
  assert.match(actiuni, /if \(!lucrare\) return \{ error: "Nu am putut porni publicarea/);
});

test("⚠ „Sincronizeaza tot” si „Publica toate” n-au plafon terminal", () => {
  /*
   * ═══ ⚠ LA 30.000 DE PRODUSE, ULTIMELE 10.000 NU PLECAU NICIODATA (27.08.2026, noaptea) ═══
   *
   * `enqueueForListings` se opreste la 20.000 si intoarce `incomplet`. Pentru schimbarile de
   * setari exista o reluare; pentru cele doua butoane manuale NU exista niciuna. Iar o noua
   * apasare pornea iar DE LA INCEPUT — deci nu era o intarziere, era infometare: exact ultimele
   * produse nu apucau sa plece vreodata.
   *
   * ⚠ SI UN SINGUR CAMP IN CONFIG SE CALCA IN PICIOARE: „Publica toate" scria `fanout = publish`,
   * iar o salvare de setari un minut mai tarziu il inlocuia cu `price`. Publicarea disparea in
   * tacere. Un RAND per lucrare nu are cum.
   */
  assert.match(actiuni, /deschideLucrarea\(businessId, "upsert"\)/);
  assert.match(actiuni, /deschideLucrarea\(businessId, "publish", "draft", true\)/);
  /* ⚠ Cursorul lucrarii se transmite mai departe, altfel fiecare trecere ar relua de la zero. */
  assert.match(actiuni, /"publish", "draft", true, lucrare\.dupa\)/);

  const sync = viu("src/lib/aboutyou/sync.ts");
  /* ⚠ Si reluarea din cron citeste ACEEASI multime: filtrele se tin minte pe rand. */
  assert.match(sync, /if \(lucrare\.status_filtru\) q = q\.eq\("status", lucrare\.status_filtru\);/);
  assert.match(sync, /if \(lucrare\.doar_trimise\) q = q\.not\("last_synced_at", "is", null\);/);
});

test("⚠ si mesajul de pe ecran nu mai cere ce nu mai trebuie facut", () => {
  /*
   * ⚠ „Repeta operatia" era ADEVARAT cat timp plafonul era terminal: ce nu incapea nu mai pleca
   * niciodata. Acum lucrarea se continua singura, iar a doua apasare nici macar nu porneste una
   * noua — o continua pe cea care merge. Cerut sa repete, omul ar apasa degeaba.
   *
   * ⚠ Un text ramas in urma codului minte, si minte cu incredere. E a patra oara luna asta.
   */
  const ecran = readFileSync("src/components/dashboard/AboutYouListings.tsx", "utf8");
  const viuEcran = ecran.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(viuEcran, /Repetă operația/);
  assert.match(viuEcran, /Restul catalogului continuă automat, în fundal/);
  assert.match(viuEcran, /Restul continuă automat, în fundal/);
});

test("⚠ si un `fanout` vechi din config nu se pierde la desfasurare", () => {
  /*
   * ⚠ INTRE COMIT SI DESFASURARE, baza poate avea magazine cu campul vechi inca plin — iar el
   * inseamna „mai am catalog de pus la coada". Codul nou care doar l-ar ignora ar lasa exact
   * produsele alea neatinse de nimic. Se preia intr-o lucrare, si abia atunci se sterge.
   */
  const sync = viu("src/lib/aboutyou/sync.ts");
  assert.match(sync, /const f = ctx\.config\.fanout;/);
  assert.match(sync, /if \(!error \|\| \(error as \{ code\?: string \}\)\.code === "23505"\) \{[\s\S]{0,160}?fanout: null/);
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
