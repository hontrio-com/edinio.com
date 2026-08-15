import assert from "node:assert/strict";
import { test } from "node:test";
import { testFgoConnection, hashOperatii, type FgoConfig } from "@/lib/fgo";

/**
 * Proba de conexiune fGO, rescrisa dupa 15.08.2026.
 *
 * CE ERA GRESIT. `testFgoConnection` chema `/nomenclator/judet`, un GET PUBLIC care
 * nu primeste `cod_unic`, nu primeste `private_key` si nu semneaza nimic. Butonul
 * „Testeaza conexiunea" raspundea „Conexiune reusita" pentru ORICE CUI si ORICE
 * cheie privata. Comerciantul primea confirmare verde, salva, si afla ca integrarea
 * nu merge abia la prima comanda cu facturare automata.
 *
 * DE CE TESTELE DE AICI POT ESUA. Prima verificare nu se uita la verdict, ci la
 * CEREREA TRIMISA: daca reintorci varianta veche, cererea nu mai are `Hash`, si
 * testul pica. Un test care s-ar uita doar la „a raspuns ok?" ar fi trecut si cu
 * defectul, fiindca defectul raspundea `ok: true` — asta l-a tinut ascuns.
 *
 * Raspunsurile simulate sunt cele REALE, culese de pe mediul de test fGO
 * (api-testuat.fgo.ro) pe 15.08.2026: fGO da HTTP 500 cu JSON valid in corp si o
 * exceptie .NET cu tot cu urma de stiva chiar si la refuzurile obisnuite.
 */

const CONFIG: FgoConfig = {
  enabled: true,
  sandbox: true,
  cod_unic: "12345678",
  private_key: "CHEIE-DE-PROBA",
  serie: "EDN",
  platforma_url: "https://edinio.com",
  tip_factura: "Factura",
  valuta: "RON",
};

/** Inlocuieste `fetch` si retine cererile, ca sa se poata verifica CE s-a trimis. */
function stubFetch(raspuns: { status: number; corp: string } | { aruncaRetea: true }) {
  const original = globalThis.fetch;
  const cereri: { url: string; body: Record<string, unknown> }[] = [];
  globalThis.fetch = (async (input: unknown, init?: { body?: string }) => {
    cereri.push({ url: String(input), body: JSON.parse(init?.body ?? "{}") });
    if ("aruncaRetea" in raspuns) throw new Error("ECONNRESET");
    return {
      status: raspuns.status,
      ok: raspuns.status >= 200 && raspuns.status < 300,
      text: async () => raspuns.corp,
    };
  }) as unknown as typeof globalThis.fetch;
  return { cereri, restaureaza: () => { globalThis.fetch = original; } };
}

// Raspunsul REAL al lui fGO pentru un CUI neinregistrat (cules 15.08.2026).
const REFUZ_CREDENTIALE = JSON.stringify({
  Success: false,
  Message: "System.Exception: Codul unic nu exista sau nu este asociat.\r\n   at Fgo.PublicApi.Controllers.FacturaController.<GetStatus>d__14.MoveNext()",
});

test("cererea e SEMNATA: duce cod_unic si hash, nu e nomenclatorul public", async () => {
  const s = stubFetch({ status: 200, corp: JSON.stringify({ Success: true }) });
  try {
    await testFgoConnection(CONFIG);
  } finally { s.restaureaza(); }

  assert.equal(s.cereri.length, 1);
  const { url, body } = s.cereri[0];
  assert.ok(!url.includes("/nomenclator/"), "proba nu are voie sa cada inapoi pe nomenclatorul PUBLIC");
  assert.equal(body.CodUnic, CONFIG.cod_unic);
  assert.ok(typeof body.Hash === "string" && (body.Hash as string).length === 40, "lipseste hash-ul SHA-1");
  // Hash-ul trebuie sa fie cel al operatiilor, calculat CU cheia privata: daca
  // cheia e goala sau alta, valoarea difera si testul pica.
  assert.equal(body.Hash, hashOperatii(CONFIG.cod_unic, CONFIG.private_key, "0"));
});

test("credentiale respinse de fGO -> esec, cu mesajul curatat de urma de stiva", async () => {
  const s = stubFetch({ status: 500, corp: REFUZ_CREDENTIALE });
  let rez;
  try { rez = await testFgoConnection(CONFIG); } finally { s.restaureaza(); }

  assert.equal(rez.ok, false);
  const err = (rez as { ok: false; error: string }).error;
  assert.ok(err.includes("Codul unic nu exista sau nu este asociat."), err);
  assert.ok(!err.includes("System.Exception"), "comerciantul nu are ce face cu urma de stiva .NET");
  assert.ok(!err.includes("Fgo.PublicApi"), err);
});

test("cheie privata gresita -> alt hash, deci acelasi refuz", async () => {
  const s = stubFetch({ status: 500, corp: REFUZ_CREDENTIALE });
  let rez;
  try { rez = await testFgoConnection({ ...CONFIG, private_key: "ALTCEVA" }); } finally { s.restaureaza(); }
  assert.equal(rez.ok, false);
  assert.notEqual(s.cereri[0].body.Hash, hashOperatii(CONFIG.cod_unic, CONFIG.private_key, "0"));
});

/*
 * Partea contraintuitiva, si motivul pentru care merita teste separate: raspunsul
 * se citeste PE DOS. Daca fGO a trecut de autentificare si se plange de altceva —
 * factura inexistenta, abonament fara acces la endpoint — credentialele sunt bune.
 * Citita normal, proba ar da negativ FALS pe planurile mici, iar un comerciant cu
 * credentiale corecte ar fi trimis sa le schimbe degeaba.
 */
test("factura inexistenta -> credentiale ACCEPTATE", async () => {
  const s = stubFetch({
    status: 500,
    corp: JSON.stringify({ Success: false, Message: "System.Exception: Factura nu a fost gasita.\r\n   at Fgo.PublicApi" }),
  });
  let rez;
  try { rez = await testFgoConnection(CONFIG); } finally { s.restaureaza(); }
  assert.equal(rez.ok, true);
});

test("limitare de abonament -> credentiale ACCEPTATE", async () => {
  const s = stubFetch({
    status: 500,
    corp: JSON.stringify({ Success: false, Message: "Aceasta functionalitate este disponibila doar pentru abonamentul ENTERPRISE." }),
  });
  let rez;
  try { rez = await testFgoConnection(CONFIG); } finally { s.restaureaza(); }
  assert.equal(rez.ok, true);
});

test("succes curat -> reusita", async () => {
  const s = stubFetch({ status: 200, corp: JSON.stringify({ Success: true, Factura: { Numar: "1" } }) });
  let rez;
  try { rez = await testFgoConnection(CONFIG); } finally { s.restaureaza(); }
  assert.equal(rez.ok, true);
});

test("retea cazuta -> esec, nu reusita tacuta", async () => {
  const s = stubFetch({ aruncaRetea: true });
  let rez;
  try { rez = await testFgoConnection(CONFIG); } finally { s.restaureaza(); }
  assert.equal(rez.ok, false);
  assert.ok((rez as { ok: false; error: string }).error.includes("Nu am putut contacta"));
});

test("raspuns care nu e JSON -> esec, nu reusita tacuta", async () => {
  const s = stubFetch({ status: 502, corp: "<html>Bad Gateway</html>" });
  let rez;
  try { rez = await testFgoConnection(CONFIG); } finally { s.restaureaza(); }
  assert.equal(rez.ok, false);
});
