import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hotarareaReconcilierii, RECONCILE_PAGINA } from "./sync";

/* ══════════════════════════════════════════════════════════════════════════
   CE E VIU LA EI SI NECUNOSCUT LA NOI (31.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Sondarea de stare porneste de la `olx_adverts`, adica intreaba numai despre randurile pe care
   le AVEM. Deci un anunt viu la OLX fara rand la noi e invizibil pentru totdeauna:

       crearea reuseste la ei, dar scrierea legaturii pica
       lucrarea se reia... si moare dupa cinci incercari
       -> anuntul ramane ACTIV la OLX, si nimeni nu-l mai atinge
       -> stocul ajunge la zero, si el vinde mai departe fiindca noi nu stim de el

   ⚠ DAR CONTUL LUI DE OLX E AL LUI. Poate avea acolo zeci de anunturi puse de mana, care n-au
   nicio treaba cu Edinio. Reconcilierea adopta doar ce e limpede al nostru, si nu sterge nimic.
*/

const sync = readFileSync("src/lib/olx/sync.ts", "utf8");
const cron = readFileSync("src/app/api/cron/olx-sync/route.ts", "utf8");

function faraComentarii(t: string): string {
  return t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

const AL_NOSTRU = { advertId: 77, eAlNostru: true, cunoscut: false };

test("⚠ un anunt al lui, pus de mana, nu e al nostru", () => {
  /*
   * ⚠ AICI E PAZA CEA MAI IMPORTANTA. `external_id` care nu e id-ul unui produs al magazinului
   * inseamna un anunt pe care nu l-am facut noi. Adoptat, l-am fi rescris cu datele altui produs
   * la prima trecere — adica i-am fi stricat un anunt care mergea, in contul lui.
   */
  assert.deepEqual(
    hotarareaReconcilierii({ advertId: 77, eAlNostru: false, cunoscut: false }),
    { fel: "nu-e-al-nostru" },
  );
  /* Si nici cand exista un rand cu acel `offer_id`: ce hotaraste e daca PRODUSUL e al magazinului. */
  assert.deepEqual(
    hotarareaReconcilierii({ advertId: 77, eAlNostru: false, cunoscut: false, randul: { olx_advert_id: null, sters_de_om_la: null } }),
    { fel: "nu-e-al-nostru" },
  );
});

test("⚠ ce stim deja nu se atinge", () => {
  assert.deepEqual(hotarareaReconcilierii({ ...AL_NOSTRU, cunoscut: true }), { fel: "stim" });
  /* ⚠ Si „il stim" bate tot restul: un rand legat corect n-are nevoie de nicio hotarare. */
  assert.deepEqual(
    hotarareaReconcilierii({ ...AL_NOSTRU, cunoscut: true, randul: { olx_advert_id: 77, sters_de_om_la: "2026-08-30T10:00:00Z" } }),
    { fel: "stim" },
  );
});

test("⚠ ce a sters omul nu se readuce, nici de reconciliere", () => {
  /*
   * ⚠ Aceeasi regula ca peste tot in integrarea asta: nu conteaza pe ce usa a intrat hotararea
   * lui, ci ca a fost a lui. Ca anuntul sa mai fie viu la ei inseamna doar ca stergerea n-a mers
   * pana la capat — nu ca s-a razgandit.
   */
  assert.deepEqual(
    hotarareaReconcilierii({ ...AL_NOSTRU, randul: { olx_advert_id: null, sters_de_om_la: "2026-08-30T10:00:00Z" } }),
    { fel: "sters-de-om" },
  );
  /* ⚠ Si piatra bate si duplicatul: nu se leaga „celalalt" anunt peste o hotarare de stergere. */
  assert.deepEqual(
    hotarareaReconcilierii({ ...AL_NOSTRU, randul: { olx_advert_id: 55, sters_de_om_la: "2026-08-30T10:00:00Z" } }),
    { fel: "sters-de-om" },
  );
});

test("⚠ doua anunturi pentru acelasi produs se SPUN, nu se rezolva", () => {
  /*
   * Care dintre ele e „cel bun" nu poate hotari un cron: unul are istoric, mesaje, poate si o
   * vanzare in curs. Si mai ales — stergerea nu se poate desface de la noi.
   */
  assert.deepEqual(
    hotarareaReconcilierii({ ...AL_NOSTRU, randul: { olx_advert_id: 55, sters_de_om_la: null } }),
    { fel: "duplicat", legat: 55 },
  );
  /* Acelasi id pe rand nu e duplicat, e chiar el. */
  assert.deepEqual(
    hotarareaReconcilierii({ ...AL_NOSTRU, randul: { olx_advert_id: 77, sters_de_om_la: null } }),
    { fel: "leaga" },
  );
});

test("⚠ ce e al nostru si nelegat se leaga inapoi", () => {
  /* Randul lipseste cu totul: crearea a reusit la ei si n-a apucat sa se scrie la noi. */
  assert.deepEqual(hotarareaReconcilierii(AL_NOSTRU), { fel: "leaga" });
  /* Randul exista, dar fara id: sondarea a scris `404` cu o clipa inainte, sau legatura a picat. */
  assert.deepEqual(
    hotarareaReconcilierii({ ...AL_NOSTRU, randul: { olx_advert_id: null, sters_de_om_la: null } }),
    { fel: "leaga" },
  );
});

test("⚠ reconcilierea nu sterge NIMIC", () => {
  /*
   * ⚠ Stergerea unui anunt e singurul efect din tot marketplace-ul care nu se poate desface de la
   * noi: al doilea anunt are alt id, nu e in `olx_adverts`, si nimeni nu-l mai gaseste vreodata.
   * O reconciliere care sterge pe o presupunere e cel mai scump fel de a gresi.
   */
  const i = sync.indexOf("export async function reconciliazaAnunturile");
  assert.notEqual(i, -1);
  const corp = faraComentarii(sync.slice(i));
  assert.doesNotMatch(corp, /deleteAdvert\(/);
  assert.doesNotMatch(corp, /advertCommand\(/);
  assert.doesNotMatch(corp, /\.delete\(\)/);
  /* Si nici nu scrie peste anunt la ei: singura scriere e randul local. */
  assert.doesNotMatch(corp, /updateAdvert\(|createAdvert\(/);
});

test("⚠ o citire picata nu devine „nu-l stim”", () => {
  /*
   * ⚠ Aceeasi regula ca la preluarea produselor din cron: `null` are voie sa insemne un singur
   * lucru — „am putut intreba, si chiar nu e". Randurile locale necitite ar fi facut din FIECARE
   * anunt al lor un orfan, iar reconcilierea le-ar fi rescris pe toate.
   */
  const i = sync.indexOf("export async function reconciliazaAnunturile");
  const corp = sync.slice(i);
  assert.match(corp, /if \(eRanduri\) return \{ ok: false,/);
  assert.match(corp, /if \(eProduse\) return \{ ok: false,/);
  assert.match(corp, /if \(isOlxError\(lor\)\) return \{ ok: false,/);
});

test("⚠ cursorul se invarte, si nu sare peste o pagina necitita", () => {
  /*
   * ⚠ FEREASTRA FIXA E DEFECTUL DE LA TRENDYOL: o scanare pornita mereu de la zero n-a vazut
   * NICIODATA nimic dupa produsul 500 dintr-un catalog de 1033.
   */
  const i = sync.indexOf("export async function reconciliazaAnunturile");
  const corp = sync.slice(i);
  assert.match(corp, /if \(anunturi\.length === 0\) return \{ ok: true, urmatorul: 0/,
    "la capat, roata se intoarce la zero");
  assert.match(corp, /anunturi\.length < RECONCILE_PAGINA \? 0 : deLa \+ anunturi\.length/,
    "o pagina scurta inseamna tot capat");
  /* ⚠ Iar cronul NU muta cursorul cand trecerea n-a reusit: ar sari peste pagina aceea. */
  const j = cron.indexOf("const r = await reconciliazaAnunturile(");
  assert.notEqual(j, -1);
  const ramura = cron.slice(j, cron.indexOf("await pause(PACE_MS);", j));
  const iEsec = ramura.indexOf("if (!r.ok)");
  assert.ok(iEsec >= 0, "ramura de esec a disparut");
  /*
   * SE CERE REGULA, NU FORMA. Prima varianta cerea doar ca scrierea cursorului sa vina DUPA ramura
   * de esec, cu un `continue` intre ele — si a lasat sa treaca o mutatie care scria cursorul
   * INAUNTRUL ramurii de esec si il mai scria o data si dupa. Regula e ca in ramura aceea sa nu
   * existe NICIO scriere de cursor.
   */
  const ramuraEsec = ramura.slice(iEsec, ramura.indexOf("continue;", iEsec));
  assert.doesNotMatch(ramuraEsec, /reconcile_offset/,
    "o pagina necitita nu are voie sa mute cursorul: ar sari peste ea pe veci");
  assert.ok(ramura.indexOf("reconcile_offset: r.urmatorul") > iEsec,
    "cursorul se scrie numai dupa o trecere reusita");
});

test("⚠ rotatia are pasul portii, nu al minutului", () => {
  /*
   * ⚠ Cu `pas = 1`, rotatia se invarte in fiecare MINUT peste o poarta care se deschide o data la
   * cincisprezece: aceleasi doua magazine ar fi alese de fiecare data cand poarta chiar e
   * deschisa, iar restul n-ar fi reconciliate niciodata. E chiar infometarea scrisa la Trendyol.
   */
  assert.match(cron, /new Date\(\)\.getMinutes\(\) % 15 === 0/);
  assert.match(cron, /alegeInRotatie\(conectate, RECONCILE_MAGAZINE, 15\)/);
  assert.equal(RECONCILE_PAGINA, 50);
});
