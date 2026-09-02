import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { credentialeComune, credentialeCorporate, credentialeCorporateSeparate } from "@/lib/google-analytics/oauth";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  DOUA APLICATII GOOGLE, SAU UNA — DAR NICIODATA AMESTECATE
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ CE APARA, SI DE CE E CEA MAI DELICATA PAZA DE AICI. Aceeasi aterizare
  (`/api/google-analytics/oauth/callback`) serveste si platforma, si comerciantii.
  Daca plecarea se face cu o aplicatie si intoarcerea cu alta, Google raspunde
  `invalid_client` — si atunci pica integrarea CLIENTILOR, nu a noastra.

  De aceea probele de mai jos cer doua lucruri deodata: fiecare drum corporate sa
  foloseasca creditele corporate, SI drumul comerciantilor sa nu le atinga.
*/

const CHEI = ["EDINIO_ANALYTICS_GOOGLE_CLIENT_ID", "EDINIO_ANALYTICS_GOOGLE_CLIENT_SECRET"] as const;

function cuMediu(valori: Partial<Record<(typeof CHEI)[number], string>>, ce: () => void) {
  const vechi = CHEI.map((k) => [k, process.env[k]] as const);
  try {
    for (const k of CHEI) delete process.env[k];
    for (const [k, v] of Object.entries(valori)) if (v !== undefined) process.env[k] = v;
    ce();
  } finally {
    for (const [k, v] of vechi) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("⚠ fara variabile corporate, creditele sunt EXACT cele de azi", () => {
  /*
    ⚠ ASTA E CE FACE DESFASURAREA SIGURA. Codul poate pleca in productie inainte
    ca variabilele sa existe, si nu schimba nimic: aceleasi credite, acelasi
    comportament. Separarea se intampla cand se adauga variabilele, nu cand se
    desfasoara codul.
  */
  cuMediu({}, () => {
    assert.deepEqual(credentialeCorporate(), credentialeComune());
    assert.equal(credentialeCorporateSeparate(), false);
  });
});

test("cu amandoua variabilele, creditele sunt ale platformei", () => {
  cuMediu({ EDINIO_ANALYTICS_GOOGLE_CLIENT_ID: "corp-id", EDINIO_ANALYTICS_GOOGLE_CLIENT_SECRET: "corp-secret" }, () => {
    assert.deepEqual(credentialeCorporate(), { id: "corp-id", secret: "corp-secret" });
    assert.equal(credentialeCorporateSeparate(), true);
  });
});

test("⚠ o JUMATATE de configurare cade inapoi, nu incearca", () => {
  /*
    ⚠ CE APARA. Cu id-ul nou si secretul vechi, Google raspunde `invalid_client`
    si nimic nu spune de ce — iar cine a pus doar una crede ca a terminat.
    Jumatatea cade inapoi pe configuratia care merge, si ecranul ramane conectat.
  */
  for (const doarUna of [
    { EDINIO_ANALYTICS_GOOGLE_CLIENT_ID: "corp-id" },
    { EDINIO_ANALYTICS_GOOGLE_CLIENT_SECRET: "corp-secret" },
    { EDINIO_ANALYTICS_GOOGLE_CLIENT_ID: "   ", EDINIO_ANALYTICS_GOOGLE_CLIENT_SECRET: "corp-secret" },
  ]) {
    cuMediu(doarUna, () => {
      assert.deepEqual(credentialeCorporate(), credentialeComune(),
        `configurare pe jumatate (${Object.keys(doarUna).join("+")}) n-a cazut inapoi`);
      assert.equal(credentialeCorporateSeparate(), false);
    });
  }
});

/* ═══ Si acum drumurile ═══ */

const RAND = String.fromCharCode(10);
const citeste = (p: string) => readFileSync(p, "utf8");

function faraComentarii(cod: string): string {
  const faraBlocuri = cod.split("/*").map((b, i) => {
    if (i === 0) return b;
    const k = b.indexOf("*/");
    return k < 0 ? "" : b.slice(k + 2);
  }).join("");
  return faraBlocuri.split(RAND).map((r) => {
    const k = r.indexOf("//");
    return k < 0 ? r : r.slice(0, k);
  }).join(RAND);
}

/** Cele trei drumuri ale platformei, si apelul care trebuie sa poarte creditele. */
const DRUMURI_CORPORATE: Array<[string, string]> = [
  ["src/lib/actions/admin-analytics.actions.ts", "buildAuthUrl("],
  ["src/lib/admin-analytics/aterizare-oauth.ts", "exchangeCode("],
  ["src/lib/admin-analytics/conexiune.ts", "getAccessToken("],
];

test("⚠ toate cele trei drumuri ale platformei folosesc creditele platformei", () => {
  for (const [f, apel] of DRUMURI_CORPORATE) {
    const cod = faraComentarii(citeste(f));
    const i = cod.indexOf(apel);
    assert.ok(i > 0, `${f}: nu mai cheama ${apel}`);
    assert.match(
      cod.slice(i, i + 160), /credentialeCorporate\(\)/,
      `${f}: pleaca pe creditele comerciantilor — plecarea si intoarcerea s-ar face cu aplicatii deosebite`,
    );
  }
});

test("⚠ drumul COMERCIANTILOR nu atinge creditele platformei", () => {
  /*
    ⚠ ASTA E PAZA CARE CONTEAZA CEL MAI MULT. Daca integrarea clientilor ar
    incepe sa foloseasca aplicatia noastra, ar pica pentru TOTI in clipa in care
    schimbam ceva la ea. Datele lor sunt ale lor; si drumul trebuie sa fie.
  */
  const merchant = faraComentarii(citeste("src/app/api/google-analytics/oauth/callback/route.ts"));
  const i = merchant.indexOf("exchangeCode(");
  assert.ok(i > 0, "aterizarea comerciantilor nu mai schimba codul");
  assert.doesNotMatch(merchant.slice(i, i + 160), /credentialeCorporate/,
    "aterizarea comerciantilor foloseste creditele platformei");

  const actiuni = faraComentarii(citeste("src/lib/actions/google-analytics.actions.ts"));
  assert.doesNotMatch(actiuni, /credentialeCorporate/,
    "actiunile comerciantilor ating creditele platformei");
});

test("⚠ semnatura starii RAMANE comuna", () => {
  /*
    ⚠ DE CE NU SE DESPARTE SI EA. Plecarea si intoarcerea trec prin ACEEASI
    aterizare, iar starea semnata e ce le leaga. Semnata cu un secret si
    verificata cu altul, fiecare conectare ar esua cu „stare nevalida" — si nu
    doar a noastra, ci si a comerciantilor, fiindca aterizarea e una singura.
  */
  const cod = faraComentarii(citeste("src/lib/google-analytics/oauth.ts"));
  const i = cod.indexOf("function stateSecret()");
  assert.ok(i > 0, "s-a pierdut secretul cu care se semneaza starea");
  assert.doesNotMatch(cod.slice(i, i + 200), /credentialeCorporate/,
    "semnatura starii s-a legat de creditele platformei — atunci pica si conectarile clientilor");
});
