import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   FEREASTRA DE TIMP NU MAI VEDE O CERERE DUPA CE TRECE DE EA (26.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Aducerea obisnuita cere `startDate`/`endDate` si muta marcajul inainte. Dar o cerere de retur
   traieste ZILE:

       Created -> WaitingInAction -> InAnalysis -> Accepted / Rejected

   iar in Romania comerciantul are pana la doua zile lucratoare sa se hotarasca.

   Deci: retur creat la 10:00, vazut la 10:04 si la 10:14 datorita suprapunerii. Marcajul ajunge
   la 10:09. Cererea se muta pe `Accepted` la ora 14:00 — si noi n-o mai vedem NICIODATA.

   ⚠ CE COSTA: in panou ramane „Așteaptă răspunsul tău" pentru ceva deja hotarat. Si, mai rau, nu
   mai aflam `dontShipBack` si `rejectedPackageInfo` — exact datele dupa care ii spunem
   comerciantului daca trebuie sa trimita coletul inapoi la client. Netrimis, returul se intoarce
   impotriva lui.

   ⚠ Reparatia e corecta indiferent de ce anume filtreaza `startDate`: chiar daca ar filtra dupa
   ultima modificare, fereastra care se ingusteaza singura poate trece oricum peste o cerere. O
   stare care se schimba in timp nu se urmareste cu o fereastra care merge inainte.
*/

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const mod = viu("src/lib/trendyol/retururi.ts");
const client = viu("src/lib/trendyol/client.ts");
const cron = viu("src/app/api/cron/trendyol-sync/route.ts");

test("⚠ cererile inca vii se reintreaba pe ID, nu pe timp", () => {
  assert.match(mod, /export async function reconciliazaRetururile\(/);
  assert.match(mod, /getClaims\(ctxVitrina\.auth, \{ claimIds: bucata, size: bucata\.length \}\)/);
  /* ⚠ Si `getClaims` primeste datele ca OPTIONALE: pe calea asta n-are fereastra de timp, si
     nici n-ar trebui sa aiba. */
  assert.match(client, /startDate\?: number; endDate\?: number;/);
  assert.match(client, /if \(params\.startDate != null\)/);
});

test("⚠ se numesc starile INCHEIATE, nu cele vii", () => {
  /*
   * ═══ ⚠ O LISTA DE STARI VII LASA PE DINAFARA TOT CE NU CUNOASTEM ═══
   *
   * Aici statea `["Created","WaitingInAction","InAnalysis","Rejected"]` — starile vii. Suna la
   * fel si nu e la fel: reconcilierea exista tocmai ca sa nu ramana nimic nevazut.
   *
   * ⚠ SI STIM CA NU LE CUNOASTEM PE TOATE. Enumul din specificatia lor turceasca are
   * `WaitingFraudCheck`; lista din ghidul international nu-l are deloc. O cerere ajunsa acolo
   * n-ar mai fi fost reintrebata niciodata — chiar paguba pentru care s-a scris reconcilierea.
   */
  assert.match(mod, /const STARI_INCHEIATE = \["Accepted", "Cancelled"\]/);
  assert.doesNotMatch(mod, /STARI_INCA_VII/);

  /* ⚠ `Rejected` NU e incheiata: dupa o respingere ei pot crea un colet catre client, iar
     `rejectedPackageInfo` apare abia atunci. */
  assert.doesNotMatch(mod, /STARI_INCHEIATE = \[[^\]]*Rejected/);
});

test("⚠ dar o respinsa care si-a ARATAT coletul iese din bazin", () => {
  /*
   * Odata aparut `colet_respins`, s-a aflat ce voiam sa aflam. Tinute in bazin, se aduna cu
   * timpul si ii inghesuie pe cei vii: roata face un tur mai lung, si o hotarare adevarata se
   * vede mai tarziu.
   *
   * ⚠ ABSENTA NU E ACELASI LUCRU — poate aparea maine — deci se iese numai cand a APARUT sau
   * cand ei au spus limpede ca nu se trimite nimic inapoi.
   *
   * ⚠ MASURAT pe noua cazuri, in tranzactie anulata pe schema adevarata:
   *     intra:  gol · Created · WaitingFraudCheck · Unresolved · Rejected-fara-colet
   *     ies:    Rejected-cu-colet · Rejected-fara-trimitere · Accepted · Cancelled
   */
  assert.match(mod, /and\(colet_respins\.is\.null,dont_ship_back\.not\.is\.true\)/);
});

test("⚠ si taierea e in INTEROGARE, nu dupa `limit`", () => {
  /*
   * Filtrat in cod dupa citire, o serie de 60 de cereri respinse-cu-colet ar fi golit bazinul,
   * `reintrebat_la` nu s-ar fi scris pe niciuna, iar trecerea urmatoare ar fi luat exact
   * aceleasi 60 — chiar blocajul reparat azi dimineata, reintrodus cu un rand mai jos.
   */
  const i = mod.indexOf("export async function reconciliazaRetururile(");
  const q = mod.slice(i, mod.indexOf("if (vii.length === 0)", i));
  assert.ok(q.indexOf("colet_respins.is.null") < q.indexOf(".limit(CERERI_DE_REINTREBAT)"),
    "filtrul trebuie sa fie inaintea taierii");
  assert.doesNotMatch(mod, /vii\.filter\(/, "nimic nu se mai taie in cod dupa citire");
});

test("⚠ si bazinul e marginit in timp, ca sa nu se umple de morti", () => {
  /*
   * De cand se scot starile incheiate in loc sa se aleaga cele vii, in bazin intra tot ce nu e
   * `Accepted`/`Cancelled`. Nemarginit, un magazin cu trei mii de cereri respinse stranse intr-un
   * an ar face roata sa se invarta o data la patru ORE — adica hotararea de acum s-ar vedea
   * diseara.
   *
   * ⚠ Pe `created_at`, care e AL NOSTRU si nu e niciodata gol — nu pe `last_modified`, unde
   * acelasi `null` ar fi scos randurile despre care stim cel mai putin.
   */
  assert.match(mod, /const ZILE_DE_REINTREBAT = 45;/);
  assert.match(mod, /\.gte\("created_at",/);
});

test("⚠ nu muta niciun marcaj", () => {
  /* E o reconciliere, nu o aducere: n-are fereastra, deci n-are ce pierde si n-are ce avansa.
     Cele doua cai sunt despartite anume. */
  const i = mod.indexOf("export async function reconciliazaRetururile(");
  const f = mod.slice(i);
  assert.doesNotMatch(f, /patchTrendyolConfig/, "nu scrie configurarea");
  assert.doesNotMatch(f, /claims_synced/, "si nu atinge marcajele");
});

test("⚠ grupate pe VITRINA, si taiate in bucati", () => {
  /* O cerere greceasca se intreaba pe vitrina greceasca; amestecate, n-ar fi gasite — iar Golful
     are de-a dreptul alte cai. Si `claimIds` pleaca in ADRESA, deci lista se taie. */
  assert.match(mod, /const peVitrina = new Map<string, string\[\]>\(\);/);
  assert.match(mod, /i \+= 20/);
});

test("⚠ roata se invarte pe un camp AL NOSTRU, nu pe unul de-al lor", () => {
  /*
   * ═══ ⚠ ROTATIA NU SE POATE FACE PE UN CAMP CARE NU SE MISCA (26.08.2026) ═══
   *
   * Aici scria `last_modified`, si ar fi fost gresit. Acela e valoarea LOR: se scrie din raspuns
   * si se schimba doar cand cererea chiar s-a schimbat. O cerere care sta in `WaitingInAction`
   * cat timp comerciantul se hotaraste — pana la doua zile lucratoare, in Romania — isi
   * pastreaza `last_modified`-ul neatins.
   *
   * ⚠ DECI UN MAGAZIN CU PESTE 60 DE CERERI VII AR FI REINTREBAT ACELEASI 60, la fiecare cinci
   * minute, pentru totdeauna. Restul, niciodata. Exact infometarea pe care reconcilierea venea
   * s-o inlature.
   *
   * ⚠ MASURAT PE SCHEMA ADEVARATA, in tranzactie anulata: 150 de cereri vii, toate cu acelasi
   * `last_modified` — cazul real, fiindca niciuna nu se schimbase.
   *
   *     ordonat pe `last_modified`  ->  tura 1 si tura 2 iau ACELEASI 60 din 60.
   *                                     90 din 150 n-ar fi fost vazute NICIODATA.
   *     ordonat pe `reintrebat_la`  ->  tura 1: 60, tura 2: 60, se repeta ZERO.
   *
   * Nu e o presupunere despre ce s-ar fi intamplat: sunt cele doua interogari, una langa alta,
   * pe acelasi tabel si acelasi index.
   */
  assert.match(mod, /\.order\("reintrebat_la", \{ ascending: true, nullsFirst: true \}\)/);
  assert.doesNotMatch(mod, /\.order\("last_modified"/);
});

test("⚠ si se invarte pe TOATA bucata ceruta, si la reusita si la esec", () => {
  /*
   * O cerere pe care ei n-o mai intorc — stearsa la ei, un id care nu mai inseamna nimic — ar fi
   * ramas cu `reintrebat_la` gol, ar fi fost mereu prima in rand, si ar fi tinut roata pe loc.
   * La fel o bucata care pica de fiecare data: o vitrina cu chei expirate ar fi tinut toate
   * celelalte cereri nevazute. Ceruta si nereturnata inseamna tot „am intrebat".
   */
  const i = mod.indexOf("export async function reconciliazaRetururile(");
  const f = mod.slice(i);
  const scrieri = f.match(/reintrebat_la: new Date\(\)\.toISOString\(\)/g) ?? [];
  assert.equal(scrieri.length, 2, "si pe calea reusita, si pe cea de esec");
  for (const bucata of f.split("reintrebat_la: new Date().toISOString()").slice(1)) {
    assert.match(bucata.slice(0, 200), /\.in\("claim_id", bucata\)/, "pe toata bucata, nu pe ce a raspuns");
  }

  /* ⚠ Si nu atinge `updated_at`: aici nu s-a schimbat nimic din cerere, doar am intrebat de ea. */
  const dinScriere = f.slice(f.indexOf("reintrebat_la: new Date()"));
  assert.doesNotMatch(dinScriere.slice(0, 300), /updated_at/);
});

test("⚠ si scrierea trece prin ACELASI drum ca aducerea", () => {
  /* Un al doilea loc care scrie cereri de retur s-ar fi despartit de primul la prima schimbare.
     Aceeasi functie, aceleasi reguli — inclusiv `dontShipBack` si coletul respins. */
  assert.match(mod, /await scrieCererea\(admin, ctxVitrina, c, idCerere\);/);
});

test("⚠ cronul chiar o cheama", () => {
  assert.match(cron, /await reconciliazaRetururile\(admin, ctx\);/);
  assert.match(cron, /getMinutes\(\) % 5 === 3/);
});
