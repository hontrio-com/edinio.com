import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/* ══════════════════════════════════════════════════════════════════════════
   „TESTEAZA CONEXIUNEA" NU ARE VOIE SA SCRIE INAINTE DE A TESTA (14.09.2026)
   ══════════════════════════════════════════════════════════════════════════

   `WootConfigClient.handleTest` salva configul INAINTE de proba, ca actiunea de pe server
   sa aiba ce citi din baza („Save first so server action can read config").

   ⚠ CE COSTA. `pastreazaSecretele` pastreaza doar campurile venite GOALE. O cheie tastata
   gresit e negoala, deci o SUPRASCRIE pe cea care mergea. Omul apasa „Testeaza" tocmai ca
   sa afle daca e buna, si cu asta o pierde pe cea buna. Adica butonul de verificare devine
   butonul de deconectare.

   ⚠ SI CONTA: masurat pe 14.09.2026, 5 magazine au Woot configurat, 3 pornit, iar Woot e
   SINGURUL curier cu trafic real in productie (211 AWB-uri emise). Acolo o integrare
   cazuta inseamna livrarea oprita, nu o neplacere.

   ⚠ REGULA E DESPRE TIPAR, NU DESPRE WOOT. Erau 17 panouri si unul singur gresea; proba
   se uita la TOATE, ca al optsprezecelea sa nu poata repeta greseala. Drumul corect il au
   deja ceilalti: `test<Curier>ConnectionAction(businessId, construieste())`, iar secretul
   mascat se rezolva pe server cu `secretDinConfig`.
*/

const PANOURI = join(process.cwd(), "src", "components", "dashboard");

/** Apel catre o actiune de proba: `testXConnection(`, `testXConfig(`, `probaX(`. */
const APEL_PROBA = /\b(test[A-Z]\w*|proba[A-Z]\w*)\s*\(/;
/** Apel care SCRIE configul: `saveXConfig(`, `updateXConfig(`. */
const APEL_SCRIERE = /\b(save|update)[A-Z]\w*\s*\(/;

/** Corpul functiei care incepe la `de`, delimitat pe acolade. */
function corp(sursa: string, de: number): string {
  const deschis = sursa.indexOf("{", de);
  if (deschis === -1) return "";
  let adancime = 0;
  for (let i = deschis; i < sursa.length; i++) {
    if (sursa[i] === "{") adancime++;
    else if (sursa[i] === "}") {
      adancime--;
      if (adancime === 0) return sursa.slice(deschis, i + 1);
    }
  }
  return sursa.slice(deschis);
}

function fisierePanouri(): string[] {
  return readdirSync(PANOURI).filter((f) => /ConfigClient\.tsx$/.test(f));
}

test("⚠⚠ NICIUN panou de integrare nu salveaza inainte sa testeze conexiunea", () => {
  const fisiere = fisierePanouri();
  /* ⚠ Prag masurat: daca cautarea se strica si nu mai gaseste panourile, proba ar trece
     verde peste tot. Se cere sa fie gasite cel putin cate stim ca exista. */
  assert.ok(fisiere.length >= 15, `am gasit doar ${fisiere.length} panouri de configurare`);

  const vinovati: string[] = [];
  let functiiVerificate = 0;

  for (const nume of fisiere) {
    const sursa = readFileSync(join(PANOURI, nume), "utf8");
    /* Fiecare functie declarata in panou. */
    for (const m of sursa.matchAll(/\b(?:async\s+)?function\s+(\w+)\s*\(/g)) {
      const c = corp(sursa, m.index!);
      if (!c) continue;
      const iProba = c.search(APEL_PROBA);
      if (iProba === -1) continue;

      functiiVerificate++;
      /*
       * ⚠ SE UITA DOAR LA CE E INAINTEA PROBEI. O salvare de DUPA test e legitima si chiar
       * buna (unele panouri salveaza automat dupa o proba reusita). Defectul e strict
       * ordinea: scrierea inaintea verdictului.
       */
      const inainteDeProba = c.slice(0, iProba);
      const scriere = APEL_SCRIERE.exec(inainteDeProba);
      if (scriere) vinovati.push(`${nume}: ${m[1]}() cheama ${scriere[0]} inaintea probei`);
    }
  }

  assert.ok(functiiVerificate >= 10, `am verificat doar ${functiiVerificate} functii de proba`);
  assert.deepEqual(
    vinovati,
    [],
    "o proba de conexiune scrie configul INAINTE de verdict: o credentiala gresita o "
      + "suprascrie pe cea buna, si butonul de verificare devine butonul de deconectare",
  );
});

test("⚠ si actiunea de pe server primeste configul, ca sa nu mai fie nevoie de salvare", () => {
  /*
   * Cealalta jumatate a regulii. Daca `testWootConnection` ar citi iar DOAR din baza,
   * clientul ar fi silit sa salveze inainte, si prima proba ar redeveni distructiva.
   */
  const sursa = readFileSync(join(process.cwd(), "src", "lib", "actions", "woot.actions.ts"), "utf8");
  assert.match(
    sursa,
    /export async function testWootConnection\(businessId: string, config\?: WootConfig\)/,
    "proba Woot nu mai primeste configul din formular",
  );
  /* ⚠ Si secretul mascat se rezolva pe server, prin ajutorul casei: altfel o reprobare
     fara retastarea cheilor ar raspunde „Chei API lipsa" pe o integrare buna. */
  for (const camp of ["public_key", "secret_key"]) {
    assert.match(
      sursa,
      new RegExp(`secretDinConfig\\(businessId, "woot_config", "${camp}"`),
      `${camp} nu mai trece prin secretDinConfig`,
    );
  }
  /* ⚠ Si NU mai citeste configul din baza in proba. */
  const i = sursa.indexOf("export async function testWootConnection(");
  assert.ok(i > 0);
  assert.doesNotMatch(
    corp(sursa, i),
    /loadConfig\(/,
    "proba citeste iar direct din baza, deci clientul va fi silit sa salveze inainte",
  );
});

test("⚠ SmartBill: si actiunea, si panoul, la fel ca la Woot", () => {
  /*
   * ⚠ SMARTBILL N-A FOST GASIT DE NICIUNUL DIN CELE DOUA AUDITURI, si nici de mine cand
   * m-am uitat la Woot: el nu e curier, deci era in afara multimii cercetate. L-a gasit
   * proba de mai sus, fiindca ea intreaba despre TIPAR, nu despre o instanta.
   *
   * ⚠ SI ATINGE MAI MULTI OAMENI: masurat pe 14.09.2026, 7 magazine au token SmartBill,
   * toate 7 cu integrarea pornita, fata de 3 la Woot. Un token suprascris acolo opreste
   * facturarea, nu livrarea.
   */
  const sursa = readFileSync(join(process.cwd(), "src", "lib", "actions", "smartbill.actions.ts"), "utf8");
  assert.match(
    sursa,
    /export async function testSmartbillConnection\(\s*businessId: string,\s*dinFormular\?: SmartbillConfig,/,
    "proba SmartBill nu mai primeste configul din formular",
  );
  assert.match(
    sursa,
    /secretDinConfig\(businessId, "smartbill_config", "token"/,
    "tokenul mascat nu mai trece prin secretDinConfig, deci o reprobare fara retastare ar minti",
  );

  const ui = readFileSync(join(PANOURI, "SmartbillConfigClient.tsx"), "utf8");
  const i = ui.indexOf("async function testConnection(");
  assert.ok(i > 0, "testConnection nu mai exista");
  const c = corp(ui, i);
  assert.doesNotMatch(c, /updateSmartbillConfig\s*\(/, "testConnection inca salveaza inainte de proba");
  assert.match(c, /testSmartbillConnection\(businessId, cfg\)/, "proba nu mai primeste configul tastat");
});

test("⚠ panoul Woot chiar nu mai salveaza in handleTest", () => {
  const ui = readFileSync(join(PANOURI, "WootConfigClient.tsx"), "utf8");
  const i = ui.indexOf("async function handleTest(");
  assert.ok(i > 0, "handleTest nu mai exista");
  const c = corp(ui, i);
  assert.doesNotMatch(c, /saveWootConfig\s*\(/, "handleTest inca salveaza");
  assert.match(c, /testWootConnection\(businessId, cfg\)/, "proba nu mai primeste configul tastat");
});
