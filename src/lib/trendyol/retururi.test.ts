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
  assert.match(mod, /if \(r\.ok\) \{[\s\S]{0,300}?claims_synced_at/);
  assert.match(mod, /if \(pagina \+ 1 >= PAGINI_PE_TRECERE\) ok = false;/);
  /* ⚠ Si se scrie clipa de DINAINTE de citire, minus suprapunerea. */
  assert.match(mod, /new Date\(inceput - 5 \* 60_000\)\.toISOString\(\)/);
});

test("⚠ fereastra lor e de cel mult doua saptamani", () => {
  /* Ceruta mai larga, serviciul raspunde 400 si nu s-ar aduce nimic — iar cronul ar parea ca
     merge. */
  assert.match(mod, /const FEREASTRA_MAXIMA_MS = 14 \* 24 \* 60 \* 60 \* 1000;/);
  assert.match(mod, /Math\.max\(marcaj - 5 \* 60_000, acum - FEREASTRA_MAXIMA_MS\)/);
});

test("⚠ hotararea se scrie DUPA raspunsul lor, nu inainte", () => {
  /*
   * Cea mai importanta ordine din fisier. Marcata la noi si netrimisa la ei, comerciantul
   * crede ca a rezolvat, iar cererea le expira netratata — si atunci decide Trendyol in locul
   * lui.
   */
  const i = mod.indexOf("export async function hotarasteRetur(");
  const f = mod.slice(i, mod.indexOf("export async function repuneInStoc(", i));
  const iTrimis = Math.max(f.indexOf("approveClaimItems("), f.indexOf("rejectClaimItems("));
  const iScris = f.indexOf('from("trendyol_claim_items")');
  assert.ok(iTrimis > 0 && iScris > iTrimis, "intai la ei, apoi la noi");
});

test("⚠ respingerea cere motiv SI explicatie", () => {
  /* Cerute de ei, si pe buna dreptate: un retur respins fara explicatie ajunge la arbitrajul
     lor, iar acolo tacerea vanzatorului nu ajuta pe nimeni. */
  assert.match(mod, /if \(!p\.motivId\) return \{ error: "Alege motivul respingerii\." \};/);
  assert.match(mod, /if \(!explicatie\) return \{ error: "Scrie de ce respingi returul\." \};/);
  /* ⚠ Iar motivele se CITESC de la ei: un id inventat ar fi fost refuzat abia la respingere. */
  assert.match(client, /export function getClaimIssueReasons\(/);
});

test("⚠ repunerea in stoc e IDEMPOTENTA pe linie", () => {
  /* Fara `repus_in_stoc_la`, doua clicuri ar fi umflat stocul si nimeni n-ar fi stiut de unde
     vine diferenta. */
  assert.match(mod, /if \(linie\.repus_in_stoc_la\) return \{ ok: true, pus: 0 \};/);
  assert.match(mod, /repus_in_stoc_la: new Date\(\)\.toISOString\(\)/);
});

test("⚠ se pune inapoi CANTITATEA LINIEI, si prin functia casei", () => {
  /*
   * Retururile Trendyol sunt partiale: `quantity` pe linie poate fi mai mic decat cat s-a
   * cumparat. Un „pune inapoi toata comanda" ar fi gresit de doua ori.
   *
   * ⚠ Si se cheama `elibereaza_stoc_complet`, functia prin care se intoarce stocul la anulari.
   * O a doua adunare scrisa aici s-ar fi despartit de prima la prima schimbare.
   */
  assert.match(mod, /quantity: linie\.quantity/);
  assert.match(mod, /admin\.rpc\("elibereaza_stoc_complet"/);
  /* ⚠ Variantele pe `variant_title`, nu pe un indice: indicii se muta cand comerciantul
     rearanjeaza combinatiile. */
  assert.match(mod, /variant_title: varianta\.variant_title/);
});

test("⚠ fiecare actiune isi verifica magazinul", () => {
  /* Actiunile de server se pot chema cu orice argumente, printr-un POST direct: fara garda,
     cineva ar putea aproba retururile altui comerciant. */
  assert.equal((act.match(/const g = await guard\(businessId\);/g) ?? []).length, 4);
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
