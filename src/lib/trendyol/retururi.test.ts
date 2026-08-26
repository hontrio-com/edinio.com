import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   RETURURILE TRENDYOL: PANA AZI STIAM DOAR CA „PACHETUL E RETURNAT" (26.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Din statusul grosier al pachetului nu se poate afla nimic din ce conteaza: ce articol s-a
   intors, cate bucati, de ce, in ce stare e cererea, si daca asteapta o hotarare de la
   comerciant. El afla din panoul LOR si decidea acolo.

   ⚠ Iar noi tocmai oprisem repunerea automata in stoc — fara un ecran de retururi, nu-i mai
   dadeam nicio cale sa puna marfa inapoi dupa ce o verifica.
*/

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const mod = viu("src/lib/trendyol/retururi.ts");
const client = viu("src/lib/trendyol/client.ts");
const act = viu("src/lib/actions/trendyol-retururi.actions.ts");
const ui = viu("src/components/dashboard/TrendyolReturns.tsx");

test("⚠ aducerea NU hotaraste nimic si NU atinge stocul", () => {
  /* Aduce si arata. Hotararea e a comerciantului — altfel am fi luat in locul lui exact
     decizia pe care restul reparatiei o apara. */
  const i = mod.indexOf("export async function aduRetururile(");
  const f = mod.slice(i, mod.indexOf("async function scrieCererea(", i));
  assert.doesNotMatch(f, /approveClaimItems|rejectClaimItems/, "nu aproba si nu respinge");
  assert.doesNotMatch(f, /elibereaza_stoc_complet/, "si nu pune nimic in stoc");
});

test("⚠ marcajul avanseaza NUMAI la o trecere intreaga", () => {
  /*
   * Pus la „acum" dupa una trunchiata, cererile necitite ar ramane in urma ferestrei si nu
   * s-ar mai citi niciodata — fara nicio eroare, fiindca fiecare trecere in parte a reusit.
   * E chiar incidentul pentru care exista `marcaj.ts` la comenzi.
   */
  /* ⚠ Forma s-a schimbat odata cu marcajele pe vitrina: nu mai e un singur `if (r.ok)` care
     scrie configurarea, ci cate o pozitie pe fiecare vitrina. Regula e insa aceeasi. */
  assert.match(mod, /if \(r\.ok\) noi\[vitrina\] = /);
  assert.match(mod, /claims_synced_per_storefront: \{ \.\.\.marcaje, \.\.\.noi \}/);
  assert.match(mod, /if \(pagina \+ 1 >= PAGINI_PE_TRECERE\) ok = false;/);
  /* ⚠ Si se scrie clipa de DINAINTE de citire, minus suprapunerea. */
  assert.match(mod, /new Date\(inceput - 5 \* 60_000\)\.toISOString\(\)/);
});

test("⚠ fereastra lor e de cel mult doua saptamani", () => {
  /* Ceruta mai larga, serviciul raspunde 400 si nu s-ar aduce nimic — iar cronul ar parea ca
     merge. */
  assert.match(mod, /const FEREASTRA_MAXIMA_MS = 14 \* 24 \* 60 \* 60 \* 1000;/);
  assert.match(mod, /Math\.max\(marcajMs - 5 \* 60_000, acum - FEREASTRA_MAXIMA_MS\)/);
});

test("⚠ hotararea se scrie DUPA raspunsul lor, nu inainte", () => {
  /*
   * Cea mai importanta ordine din fisier. Marcata la noi si netrimisa la ei, comerciantul
   * crede ca a rezolvat, iar cererea le expira netratata — si atunci decide Trendyol in locul
   * lui.
   *
   * ⚠ SE MASOARA SCRIEREA, NU ORICE ATINGERE A TABELEI. Proba cauta pana azi prima aparitie a
   * tabelei si iesea gresit de indata ce a aparut CITIREA de verificare a apartenentei — care
   * trebuie sa fie inaintea apelului, nu dupa.
   */
  const i = mod.indexOf("export async function hotarasteRetur(");
  const f = mod.slice(i, mod.indexOf("export async function repuneInStoc(", i));
  const iTrimis = Math.max(f.indexOf("approveClaimItems("), f.indexOf("rejectClaimItems("));
  const iScris = f.indexOf("decizie: p.accepta");
  assert.ok(iTrimis > 0 && iScris > iTrimis, "intai la ei, apoi la noi");
});

test("⚠ liniile bifate TREBUIE sa fie ale cererii din apel", () => {
  /*
   * Panoul tinea o singura lista de bifate peste toate cererile de pe ecran: cu doua deschise,
   * „Acceptă" de la prima trimitea si liniile bifate la a doua. Iar noi le trimiteam mai
   * departe fara sa ne uitam.
   *
   * ⚠ VERIFICAREA E PE SERVER, nu in ecran: actiunile se pot chema cu orice argumente, printr-un
   * POST direct.
   *
   * ⚠ Si scrierea locala e legata de cerere (`claim_row_id`), nu doar de id-uri — altfel ce
   * refuza ei ramane marcat hotarat la noi.
   */
  const i = mod.indexOf("export async function hotarasteRetur(");
  const f = mod.slice(i, mod.indexOf("export async function repuneInStoc(", i));
  const iPaza = f.indexOf("const straine = p.claimItemIds.filter");
  const iTrimis = Math.max(f.indexOf("approveClaimItems("), f.indexOf("rejectClaimItems("));
  assert.ok(iPaza > 0 && iPaza < iTrimis, "se verifica INAINTE de apelul catre ei");
  assert.match(f, /if \(straine\.length > 0\) \{/);
  assert.match(f, /\.eq\("claim_row_id", cerere\.id\)/);
});

test("⚠ respingerea pleaca in forma CERUTA de ei: multipart, lista prin virgula", () => {
  /*
   * Trimiteam JSON cu `claimItemIdList` ca tablou. Referinta lor cere `multipart/form-data`,
   * lista ca SIR despartit prin virgula, si explicatie de cel mult 500 de caractere. In forma
   * veche, serviciul refuza cererea intreaga — iar comerciantul ramane cu „am respins" apasat
   * si cu returul netratat la ei, care le expira in favoarea clientului.
   */
  assert.match(client, /const corp = new FormData\(\);/);
  assert.match(client, /corp\.set\("claimItemIdList", p\.claimItemIdList\.join\(","\)\);/);
  assert.match(client, /corp\.set\("description", p\.description\.slice\(0, 500\)\);/);
  /* ⚠ Antetul NU se scrie de mana: `fetch` il pune singur, cu granita. Scris de noi, granita
     ar lipsi si corpul n-ar putea fi despartit de nimeni. */
  assert.match(client, /!\(body instanceof FormData\)/);
  /* ⚠ Si plafonul e verificat si sus, ca omul sa afle inainte de trimitere, nu dupa refuz. */
  assert.match(mod, /const MAX_EXPLICATIE = 500;/);
});

test("⚠ respingerea cere motiv SI explicatie", () => {
  /* Cerute de ei, si pe buna dreptate: un retur respins fara explicatie ajunge la arbitrajul
     lor, iar acolo tacerea vanzatorului nu ajuta pe nimeni. */
  assert.match(mod, /if \(!p\.motivId\) return \{ error: "Alege motivul respingerii\." \};/);
  assert.match(mod, /if \(!explicatie\) return \{ error: "Scrie de ce respingi returul\." \};/);
  /* ⚠ Iar motivele se CITESC de la ei: un id inventat ar fi fost refuzat abia la respingere. */
  assert.match(client, /export function getClaimIssueReasons\(/);
});

test("⚠ repunerea in stoc e o SINGURA tranzactie, cu randul blocat", () => {
  /*
   * ═══ ⚠ PROBA ASTA CEREA PANA AZI PREA PUTIN ═══
   *
   * Cerea doar sa existe marcajul `repus_in_stoc_la` si o citire a lui. Dar flow-ul era in trei
   * pasi — citeste marcajul, aduna stocul, scrie marcajul — iar cei trei pasi nu erau legati.
   * Doua apasari repezi treceau amandoua de citire cu marcajul gol si adunau amandoua. Sau
   * adunarea reusea si scrierea marcajului pica, iar omul incerca din nou.
   *
   * „Idempotent" scris in comentariu nu tine loc de blocare.
   *
   * ⚠ MASURAT IN PRODUCTIE, in tranzactie intoarsa inapoi (26.08.2026):
   *
   *     stoc inainte         50
   *     dupa prima apasare   53   r = {"pus": 3, "stare": "pus"}
   *     dupa a doua          53   r = {"pus": 0, "stare": "deja"}
   *
   * Se pune CANTITATEA LINIEI (3), nu una singura, si a doua apasare nu mai adauga.
   */
  const mig = readFileSync("migrations/2026-11-01-retur-repunere-atomica.sql", "utf8");
  assert.match(mig, /for update;/, "randul se ia blocat");
  const iSelect = mig.indexOf("for update;");
  const iMarcaj = mig.indexOf("if v_linie.repus_in_stoc_la is not null then");
  const iStoc = mig.indexOf("elibereaza_stoc_complet");
  assert.ok(iSelect > 0 && iMarcaj > iSelect && iStoc > iMarcaj,
    "blocare, apoi marcajul, apoi stocul");
  /* ⚠ Si codul cheama RPC-ul, nu mai face pasii singur. */
  assert.match(mod, /admin\.rpc\("trendyol_repune_stoc_retur"/);
  assert.doesNotMatch(mod, /elibereaza_stoc_complet/, "adunarea nu mai e in TypeScript");
});

test("⚠ se pune inapoi CANTITATEA LINIEI, si prin functia casei", () => {
  /*
   * ⚠ Se cheama `elibereaza_stoc_complet`, functia prin care se intoarce stocul la anulari. O a
   * doua adunare scrisa alaturi s-ar fi despartit de prima la prima schimbare — si stocul e
   * ultimul loc unde iti permiti doua socoteli.
   *
   * ⚠ Variantele pe `variant_title`, nu pe un indice: indicii se muta cand comerciantul
   * rearanjeaza combinatiile, titlurile nu.
   */
  const mig = readFileSync("migrations/2026-11-01-retur-repunere-atomica.sql", "utf8");
  assert.match(mig, /'quantity', v_linie\.quantity/);
  assert.match(mig, /'variant_title', v_variant_title/);
  assert.match(mig, /perform public\.elibereaza_stoc_complet\(/);
  /* ⚠ Usa functiei e inchisa: `security definer` peste stocul oricui. */
  assert.match(mig, /revoke execute on function public\.trendyol_repune_stoc_retur\(uuid, text\) from public, anon, authenticated;/);
});

test("⚠ fiecare actiune isi verifica magazinul", () => {
  /* Actiunile de server se pot chema cu orice argumente, printr-un POST direct: fara garda,
     cineva ar putea aproba retururile altui comerciant. */
  /* ⚠ NUMARUL CRESTE ODATA CU ACTIUNILE, si de-aia se cere „toate", nu „patru": o actiune noua
     fara garda ar fi trecut nevazuta printr-un numar fix. */
  const cateActiuni = (act.match(/export async function \w+\(/g) ?? []).length;
  assert.equal((act.match(/const g = await guard\(businessId\);/g) ?? []).length, cateActiuni,
    "fiecare actiune exportata isi verifica magazinul");
  assert.ok(cateActiuni >= 5, "si sunt cel putin cinci");
  /* ⚠ Si o citire picata nu se citeste ca „nu e magazinul lui". */
  assert.match(act, /if \(error\) return \{ error: "Nu am putut verifica magazinul/);
});

test("⚠ DOUA apasari in ecran, nu una", () => {
  /*
   * „Accept returul" = banii se intorc. „Am primit marfa si e buna" = produsul se pune la loc
   * pe raft. Un singur buton care le face pe amandoua ar fi umflat stocul cu marfa
   * nevandabila — chiar lucrul oprit cu o zi inainte.
   */
  assert.match(ui, /Acceptă returul/);
  assert.match(ui, /Am primit marfa și e bună/);
  assert.match(ui, /pusă în stoc/, "si se vede cand s-a facut deja");
});

test("⚠ tabelele au RLS, si numai proprietarul citeste", () => {
  const baseline = readFileSync("migrations/000-schema-baseline.sql", "utf8");
  for (const t of ["trendyol_claims", "trendyol_claim_items"]) {
    assert.match(baseline, new RegExp(`alter table public\.${t} enable row level security;`), t);
    assert.match(baseline, new RegExp(`owner_select_${t}`), `politica pentru ${t}`);
  }
});

test("⚠ fiecare vitrina isi tine POZITIA ei, ca la comenzi", () => {
  /*
   * ═══ ⚠ ERA UN SINGUR MARCAJ PENTRU TOATE (26.08.2026) ═══
   *
   * Comenzile isi tin de mult pozitia pe fiecare vitrina, si din motiv temeinic: cu un marcaj
   * comun, o vitrina care cade ii tine pe loc pe celelalte, iar una care merge inainte o poate
   * SARI pe cea cazuta. Retururile aveau exact defectul de care comenzile fusesera aparate.
   *
   * ⚠ Cu Cross-Country pornit, un 429 pe Grecia ar fi impins marcajul comun mai departe, iar
   * retururile grecesti ar fi iesit din fereastra de doua saptamani si nu s-ar mai fi citit
   * NICIODATA — fara nicio eroare, fiindca trecerea „a reusit".
   */
  assert.match(mod, /claims_synced_per_storefront/);
  assert.match(mod, /if \(r\.ok\) noi\[vitrina\] = /, "numai trecerea intreaga muta marcajul");
  /* ⚠ Si marcajul vechi ramane punct de plecare pentru vitrina de origine: fara asta, prima
     trecere de dupa schimbare ar fi recitit doua saptamani pe fiecare vitrina. */
  assert.match(mod, /vitrina === origine && Number\.isFinite\(vechi\)/);
});

test("⚠ hotararea pleaca pe vitrina de pe care a VENIT returul", () => {
  /*
   * Cu Cross-Country pornit, un retur grecesc aprobat pe vitrina romaneasca ar cauta o cerere
   * care acolo nu exista. Iar Golful are de-a dreptul alte cai.
   */
  assert.match(mod, /storefront: ctx\.auth\.storefront \?\? TRENDYOL_DEFAULT_STOREFRONT/, "se scrie la aducere");
  assert.match(mod, /const ctxCerere = cerere\.storefront && cerere\.storefront !== ctx\.auth\.storefront/);
  assert.match(mod, /approveClaimItems\(ctxCerere\.auth/);
  assert.match(mod, /rejectClaimItems\(ctxCerere\.auth/);
});

test("⚠ Golful are capetele LUI — vezi `cai-golf.test.ts`", () => {
  /*
   * ⚠ PROBA S-A MUTAT, si nu din comoditate. Cea de aici cerea doar ca sufixul „-gulf" sa fie
   * lipit dupa „claims" — si trecea verde peste chiar defectul urmator: ei nu pun marcajul in
   * acelasi loc la toate capetele. `/claims-gulf/{id}/items/approve` contine „gulf" si e gresit.
   *
   * Proba adevarata, pe URL-uri exacte, sta in `cai-golf.test.ts`. Aici ramane doar legatura,
   * ca sa nu para ca s-a pierdut.
   */
  const golf = readFileSync("src/lib/trendyol/cai-golf.test.ts", "utf8");
  assert.match(golf, /APROBAREA: marcajul vine la SFARSITUL caii/);
  assert.match(golf, /RESPINGEREA: are marcaj, si tot la sfarsit/);
});

test("⚠ motivele de respingere se traduc, fiindca ei le dau doar in turca", () => {
  /*
   * Probat direct pe API-ul lor, cu `storeFrontCode: RO` si `Accept-Language: ro`, apoi cu
   * `INT`/`en`: aceleasi propozitii turcesti de fiecare data. Ecranul ar fi aratat
   * „Müşteriden gelen ürün defolu/zarar görmüş" unui comerciant din Romania, intr-o lista din
   * care trebuie sa aleaga inainte sa respinga un retur.
   *
   * ⚠ ID-URILE RAMAN ALE LOR: se traduce doar eticheta, iar un motiv pe care ei il adauga si
   * noi nu-l stim se arata cu numele lui turcesc — nu dispare din lista.
   */
  const t = readFileSync("src/lib/trendyol/types.ts", "utf8");
  assert.match(t, /export const MOTIVE_RETUR_RO: Record<number, string> = \{/);
  for (const id of [51, 151, 201, 251, 401, 1651, 1751, 2201]) {
    assert.ok(t.includes(`  ${id}: "`), `motivul ${id} e tradus`);
  }
  assert.match(act, /MOTIVE_RETUR_RO\[m\.id\] \?\? m\.name/, "necunoscutul pastreaza numele lor");
});
