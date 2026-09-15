import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * CARGUS ISI URMARESTE COLETUL, SI ISI NUMARA BANII         (15.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Doua cronuri, doua purtari, iar deosebirea nu e de gust: e a documentatiei lor.
 *
 *   * urmarirea INREGISTREAZA, fiindca ei nu publica nicio enumerare de stari;
 *   * rambursurile HOTARASC, fiindca acolo campurile sunt structurate si documentate.
 */

const viu = (cale: string) =>
  readFileSync(cale, "utf8").replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const URMARIRE = "src/app/api/cron/cargus-tracking/route.ts";
const RAMBURS = "src/app/api/cron/cargus-repayments/route.ts";

test("⚠ amandoua cronurile exista si sunt programate", () => {
  const vercel = readFileSync("vercel.json", "utf8");
  assert.match(vercel, /"\/api\/cron\/cargus-tracking"/, "urmarirea nu e programata");
  assert.match(vercel, /"\/api\/cron\/cargus-repayments"/, "rambursurile nu sunt programate");
  assert.ok(viu(URMARIRE).length > 1000 && viu(RAMBURS).length > 1000, "feliile nu pot fi goale");
});

test("⚠⚠ urmarirea NU muta comanda si NU factureaza", () => {
  /*
   * ASTA E HOTARAREA CENTRALA. Cargus nu publica nicio enumerare de stari: in toata
   * documentatia V3 statusul e TEXT liber, iar singurul exemplu e „Tiparit". Un `switch` pe
   * textul lor ar fi o presupunere imbracata in logica, iar un „Livrat" pus gresit ar emite si
   * factura, care e greu de intors.
   */
  const s = viu(URMARIRE);
  assert.ok(!s.includes("tranzitieComandaMarketplace"), "cronul nu are voie sa mute comanda");
  assert.ok(!s.includes("maybeAutoInvoice"), "cronul nu are voie sa emita facturi");
  assert.ok(!/status:\s*"delivered"/.test(s), "nicio stare de comanda nu se scrie de aici");
});

test("⚠ dar STRANGE vocabularul lor, ca harta sa se poata scrie din trafic", () => {
  /* Aceeasi cale ca la Woot, unde a si mers: cronul a strans perechile, iar harta s-a scris
     din date cateva ore mai tarziu. */
  const s = viu(URMARIRE);
  assert.match(s, /formulariNoi\.add\(stare\.stare\)/, "formularile noi trebuie stranse");
  assert.match(s, /formulariNoi: \[\.\.\.formulariNoi\]/, "si raportate pe nume");
});

test("⚠ fereastra se ancoreaza pe EMITEREA AWB-ului, si ancora chiar se scrie", () => {
  /*
   * Pe `created_at`, o comanda veche careia i se emite AWB abia azi ar fi din start in afara
   * ferestrei: n-ar fi intrebata niciodata. Iar ancora nescrisa la emitere face acelasi lucru,
   * pe dos: cronul n-ar avea ce citi.
   */
  const s = viu(URMARIRE);
  assert.match(s, /\.or\(`cargus_awb_at\.gte\.\$\{since\},cargus_awb_at\.is\.null`\)/);
  assert.match(s, /o\.cargus_awb_at !== null \|\| \(o\.created_at \?\? ""\) >= since/,
    "perechea din memorie a conditiei lipseste");

  const actiuni = viu("src/lib/actions/cargus.actions.ts");
  assert.match(actiuni, /cargus_awb_at: new Date\(\)\.toISOString\(\)/, "ancora nu se scrie la emitere");
  assert.match(actiuni, /cargus_awb_at: null/, "ancora nu se sterge la anulare");
});

test("⚠ conditia ferestrei e scrisa cu DOI termeni simpli, nu cu `and(...)` imbricat", () => {
  /* O sintaxa imbricata gresita NU da eroare la PostgREST: da LISTA GOALA. Adica urmarirea ar
     muri complet, raportand vesel `ok: true`. Lectie platita la Woot. */
  const s = viu(URMARIRE);
  assert.ok(!/\.or\([^)]*and\(/.test(s), "`and(...)` in `or(...)` a costat deja o data");
});

test("⚠ o citire picata NU raporteaza „zero de verificat”", () => {
  for (const cale of [URMARIRE, RAMBURS]) {
    const s = viu(cale);
    assert.match(s, /severity: "critical"/, `${cale}: eroarea de citire trebuie strigata`);
    assert.match(s, /status: 503/, `${cale}: si iesirea trebuie sa fie un esec, nu un ok`);
  }
});

test("⚠ marcajul se scrie SI cand apelul a picat, pentru TOATE cele cerute", () => {
  /* Altfel aceleasi comenzi ar sta vesnic in capul cozii si restul n-ar fi intrebat niciodata.
     Lectie platita la lotul de zece al DPD-ului. */
  const s = viu(URMARIRE);
  const iCatch = s.indexOf("console.error(\"[cargus-tracking] WithRedirect\"");
  assert.notEqual(iCatch, -1, "ramura de esec a lotului nu se mai gaseste");
  const felie = s.slice(iCatch, iCatch + 260);
  assert.match(felie, /for \(const o of lot\) await marcheaza\(o, null\)/,
    "pe esec, marcajul trebuie scris pentru tot lotul");
});

test("⚠ starea se scrie pe EXPEDIEREA CITITA, prin ajutorul comun", () => {
  const s = viu(URMARIRE);
  assert.match(s, /identitate: \{ coloana: "cargus_awb_number", valoare: o\.cargus_awb_number \}/);
  assert.match(s, /scrieUrmarirea\(admin, \{/);
});

test("⚠⚠ in decontari intra NUMAI ce a fost virat", () => {
  /*
   * `transfer_date` inseamna chiar ziua virarii, e `not null` si intra in cheia unica. Un
   * ramburs incasat si nevirat ar trebui sa imprumute o data care nu exista, iar tabelul ar
   * ajunge sa spuna ca banii au sosit cand n-au sosit.
   */
  const s = viu(RAMBURS);
  assert.match(s, /lista\.filter\(\(x\) => x\.ziuaVirarii !== null && x\.suma > 0\)/);
  assert.match(s, /transfer_date: x\.ziuaVirarii!/);
  /* Si cele incasate-dar-nevirate se NUMARA, ca sa nu dispara din raport. */
  assert.match(s, /incasateNevirate/);
});

test("⚠ rambursurile NU ating `payment_status`", () => {
  /* „Virat" chiar inseamna ca banii au ajuns, dar `payment_status` declanseaza si facturarea
     automata: o interpretare gresita ar emite facturi in lant. Aceeasi cumpana ca la Woot. */
  const s = viu(RAMBURS);
  assert.ok(!s.includes("payment_status"), "cronul de bani nu atinge starea platii");
});

test("⚠ decontarile se scriu cu `upsert` pe cheia naturala, nu cu `insert`", () => {
  /* Fereastra de 60 de zile reciteste in fiecare zi aceleasi virari; cu `insert` s-ar aduna. */
  const s = viu(RAMBURS);
  assert.match(s, /\.upsert\(randuri, \{ onConflict: "business_id,courier,awb_number,transfer_date" \}\)/);
});

test("⚠ cautarea comenzilor dupa AWB se sparge in bucati", () => {
  /* Adresa unei cereri PostgREST are o lungime, iar o lista lunga de AWB-uri o depaseste
     tacut. Vezi `limita-in-postgrest-adresa`. */
  const s = viu(RAMBURS);
  assert.match(s, /for \(const bucata of bucatiDeIduri\(awburi\)\)/);
});
