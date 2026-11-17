import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { readFileSync } from "node:fs";
import { faraComentarii } from "@/lib/edinio-marketing/fara-comentarii";
import { CAMPURI_SECRETE } from "@/lib/integrari/secrete";
import {
  CAMPURI_SECRETE_FACTUREAZA, cheiaDeFolosit, cheiePeComanda, citesteCheia, eDocumentDeTestFactureaza, factureazaGata,
  mascheazaFactureaza, mediul, seriaStornarii, stareaMediului,
} from "./config";
import { pdfDocumentAlMagazinului } from "./server";

/*
 * ═══ Factureaza.ro: SECRETELE, GARZILE SI LEGATURILE PROPRII ═══
 *
 * Ce tine de fisierele integrarii se verifica aici. Legarea in platforma (dispecerul, lotul,
 * pagina comenzii, cronurile, contul cumparatorului) e a coordonatorului si se probeaza acolo,
 * ca la Facturis (`facturis-legat-peste-tot.test.ts`); singura ei urma aici e intrarea din
 * `CAMPURI_SECRETE`, marcata TODO cat timp lipseste.
 *
 * ⚠ Se cauta in cod FARA comentarii: un comentariu care pomeneste o garda nu e o garda.
 */

const viu = (f: string) => faraComentarii(readFileSync(f, "utf8").replace(/\r\n/g, "\n"));
/* Migratia comuna (fragmentul Factureaza.ro e lipit in ea). */
const FRAGMENT = "migrations/2027-02-06-factureaza-easybill-saga.sql";
const ACTIUNI = "src/lib/actions/factureaza.actions.ts";

const fetchOriginal = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

describe("secretele", () => {
  test("⚠ aceleasi nume in lista proprie, in tip si in fragmentul SQL", () => {
    assert.deepEqual([...CAMPURI_SECRETE_FACTUREAZA], ["api_key"]);
    const sql = readFileSync(FRAGMENT, "utf8");
    assert.match(sql, /alter table privat\.store_settings\s+add column if not exists factureaza_config jsonb;/);
    for (const camp of CAMPURI_SECRETE_FACTUREAZA) {
      assert.ok(sql.includes(`('factureaza_config', '${camp}')`), `${camp} nu se cripteaza in baza`);
      assert.match(viu("src/lib/factureaza/config.ts"), new RegExp(`\\b${camp}: string;`));
    }
  });
  test("`CAMPURI_SECRETE` (legarea comuna) are aceleasi campuri", {
    todo: CAMPURI_SECRETE.factureaza_config ? false : "asteapta legarea comuna: factureaza_config: [\"api_key\"] in src/lib/integrari/secrete.ts",
  }, () => {
    assert.deepEqual([...(CAMPURI_SECRETE.factureaza_config ?? [])].sort(), [...CAMPURI_SECRETE_FACTUREAZA].sort());
  });
  test("⚠ cheia pleaca spre browser MASCATA, chiar fara intrarea din `CAMPURI_SECRETE`", () => {
    const m = mascheazaFactureaza({ enabled: true, api_key: "secret-de-test", serie: "SRV", mediu: "test", cont_firma: "X SRL" });
    assert.equal(m?.api_key, "");
    assert.equal(m?._completate?.api_key, true);
    assert.equal(m?.serie, "SRV", "restul ramane de citit");
    assert.equal(m?.cont_firma, "X SRL");
    assert.ok(!JSON.stringify(m).includes("secret-de-test"));
    assert.equal(mascheazaFactureaza({ enabled: false, api_key: "", serie: "" })?._completate?.api_key, false);
    assert.equal(mascheazaFactureaza(null), null);
  });
  test("⚠ plasa tine si daca intrarea din `CAMPURI_SECRETE` s-ar pierde la o rescriere", () => {
    const legata = CAMPURI_SECRETE.factureaza_config;
    delete CAMPURI_SECRETE.factureaza_config;
    try {
      const m = mascheazaFactureaza({ enabled: true, api_key: "secret-de-test", serie: "SRV" });
      assert.equal(m?.api_key, "");
      assert.equal(m?._completate?.api_key, true);
      assert.ok(!JSON.stringify(m).includes("secret-de-test"));
    } finally {
      if (legata) CAMPURI_SECRETE.factureaza_config = legata;
    }
  });
  test("cheia venita goala din formular foloseste cheia salvata; una tastata o inlocuieste", () => {
    assert.deepEqual(cheiaDeFolosit("", "productie", { api_key: "veche" }), { cheie: "veche" });
    assert.deepEqual(cheiaDeFolosit(" noua ", "productie", { api_key: "veche" }), { cheie: "noua" });
    assert.deepEqual(cheiaDeFolosit("", "test", { api_key: "de-test", mediu: "test" }), { cheie: "de-test" });
    assert.ok("error" in cheiaDeFolosit("", "productie", null));
    assert.ok("error" in cheiaDeFolosit("", "productie", { api_key: "  " }));
  });
  test("⚠⚠ dupa o schimbare de MEDIU, cheia salvata NU se refoloseste (cea reala n-are ce cauta in sandbox)", () => {
    const realaSpreTest = cheiaDeFolosit("", "test", { api_key: "cheia-reala", mediu: "productie" });
    assert.ok("error" in realaSpreTest);
    assert.match("error" in realaSpreTest ? realaSpreTest.error : "", /nu pleacă în sandbox/);
    assert.ok("error" in cheiaDeFolosit("", "productie", { api_key: "cheia-de-test", mediu: "test" }));
    assert.ok("error" in cheiaDeFolosit("", "test", { api_key: "cheia-reala" }), "mediul lipsa e productie");
    assert.deepEqual(cheiaDeFolosit("cheia-de-test", "test", { api_key: "cheia-reala", mediu: "productie" }), { cheie: "cheia-de-test" });
  });
});

describe("mediul, pe ecran", () => {
  test("⚠ ce e SALVAT si ce urmeaza sa salvezi se spun separat (antetul, randul si avertizarea nu se contrazic)", () => {
    const real = stareaMediului("productie", "productie");
    assert.deepEqual([real.rand, real.avertizare, real.deSalvat], ["Real", null, null]);
    const test_ = stareaMediului("test", "test");
    assert.equal(test_.rand, "Test (sandbox)");
    assert.equal(test_.avertizare?.titlu, "Ești în modul de testare");
    const sprePeTest = stareaMediului("productie", "test");
    assert.equal(sprePeTest.salvat, "productie");
    assert.equal(sprePeTest.deSalvat, "test");
    assert.equal(sprePeTest.rand, "Real · după salvare: Test (sandbox)");
    assert.equal(sprePeTest.avertizare?.titlu, "După salvare treci în modul de testare");
    const spreReal = stareaMediului("test", "productie");
    assert.equal(spreReal.rand, "Test (sandbox) · după salvare: Real");
    assert.equal(spreReal.avertizare?.titlu, "Ești încă în modul de testare", "pana la salvare, facturile pleaca tot in sandbox");
  });
  test("formularul ia antetul si randul din aceeasi stare, dupa mediul SALVAT", () => {
    const ui = viu("src/components/dashboard/FactureazaConfigClient.tsx");
    assert.match(ui, /const stareMediu = stareaMediului\(mediuSalvat, form\.mediu \?\? "productie"\);/);
    assert.match(ui, /stareMediu\.salvat === "test" \? \{ ton: "asteptare", text: "Mod test" \}/);
    assert.match(ui, /valoare: <span>\{stareMediu\.rand\}<\/span>/);
    assert.match(ui, /title=\{stareMediu\.avertizare\.titlu\}/);
    assert.ok(!/autoComplete="off"/.test(ui), "„off” bate implicitul `new-password`, iar Chrome ar completa parola Edinio");
    assert.match(ui, /const areCheia = !!form\.api_key\.trim\(\) \|\| cheiaSalvataMerge;/);
  });
});

describe("regulile configurarii", () => {
  test("„gata” cere comutatorul, cheia SI seria", () => {
    const plin = { enabled: true, api_key: "k", serie: "SRV" };
    assert.equal(factureazaGata(plin), true);
    for (const lipsa of ["api_key", "serie"] as const) {
      assert.equal(factureazaGata({ ...plin, [lipsa]: " " }), false, `${lipsa} gol trece drept configurat`);
    }
    assert.equal(factureazaGata({ ...plin, enabled: false }), false);
    assert.equal(factureazaGata(null), false);
  });
  test("mediul: doar „test” e test; orice altceva e productie", () => {
    assert.equal(mediul({ mediu: "test" }), "test");
    assert.equal(mediul({ mediu: "productie" }), "productie");
    assert.equal(mediul({ mediu: "Test" as never }), "productie");
    assert.equal(mediul(null), "productie");
  });
  test("seria stornarilor: cea anume, altfel a facturilor", () => {
    assert.equal(seriaStornarii({ serie: "SRV", serie_storno: " " }), "SRV");
    assert.equal(seriaStornarii({ serie: "SRV", serie_storno: "STO" }), "STO");
  });
});

describe("⚠⚠ documentul de test se recunoaste dupa CHEIA lui", () => {
  test("cheia poarta mediul, si se citeste inapoi", () => {
    assert.equal(cheiePeComanda("1065257888", "test"), "test:1065257888");
    assert.equal(cheiePeComanda("1065257888", "productie"), "1065257888");
    assert.deepEqual(citesteCheia("test:1065257888"), { id: "1065257888", mediu: "test" });
    assert.deepEqual(citesteCheia(" 1065257888 "), { id: "1065257888", mediu: "productie" });
    for (const rea of ["", null, "test:", "abc", "1; drop", "test:12a"]) assert.equal(citesteCheia(rea), null, String(rea));
    assert.equal(eDocumentDeTestFactureaza("test:5"), true);
    assert.equal(eDocumentDeTestFactureaza("5"), false);
  });
  test("⚠⚠ la marketplace un document de test nu se aduce NICIODATA, inainte de orice cerere", async () => {
    let cereri = 0;
    globalThis.fetch = (async () => { cereri++; return new Response("{}"); }) as typeof fetch;
    const admin = new Proxy({}, { get() { throw new Error("baza n-avea ce cauta aici"); } });
    const r = await pdfDocumentAlMagazinului(admin as never, "b1", "test:1065257888");
    assert.ok("error" in r);
    assert.match((r as { error: string }).error, /TEST/);
    assert.equal(cereri, 0);
  });
});

describe("securitatea", () => {
  test("modulele cu chei sunt doar de server si NU sunt „use server” (fiecare export ar fi un capat public)", () => {
    for (const f of ["src/lib/factureaza/client.ts", "src/lib/factureaza/server.ts"]) {
      const s = readFileSync(f, "utf8");
      assert.match(s, /^import "server-only";/m, f);
      assert.ok(!/^["']use server["']/m.test(s), `${f} e „use server”`);
    }
    for (const f of ["src/lib/factureaza/config.ts", "src/lib/factureaza/document.ts"]) {
      assert.ok(!/server-only/.test(viu(f)), `${f} se incarca si in formular si in probe`);
    }
  });
  test("cererea pleaca la o adresa constanta, cu cheia in antet; nicio adresa compusa", () => {
    const c = viu("src/lib/factureaza/client.ts");
    assert.match(c, /fetch\(adresaApi\(a\.mediu\)/);
    assert.match(c, /Authorization: antetAutentificare\(cheie\)/);
    assert.ok(!/fetch\(`/.test(c), "o adresa compusa ar putea purta cheia");
    assert.ok(!/api_key=/.test(c), "cheia n-are ce cauta in adresa");
    assert.equal((c.match(/signal: /g) ?? []).length, 1, "un singur `fetch`, cu termen");
    assert.match(c, /signal: o\.semnal \?\? AbortSignal\.timeout\(/);
  });
  test("⚠ actiunile: „use server” si EXACT exporturile din contract", () => {
    const s = readFileSync(ACTIUNI, "utf8");
    assert.match(s, /^"use server";/);
    const a = viu(ACTIUNI);
    const exporturi = [...a.matchAll(/^export (async function|function|const|let|class|default) ?(\w*)/gm)].map((m) => `${m[1]} ${m[2]}`);
    assert.deepEqual(exporturi.sort(), [
      "async function disconnectFactureaza", "async function generateFactureazaInvoice", "async function maybeAutoGenerateInvoice",
      "async function refreshFactureazaDocuments", "async function saveFactureazaConfig", "async function stornoFactureazaInvoiceAction",
      "async function testFactureazaConfig",
    ]);
  });
  test("⚠ fiecare actiune isi dovedeste proprietarul inainte de orice", () => {
    const a = viu(ACTIUNI);
    const corp = (nume: string) => {
      const i = a.indexOf(`export async function ${nume}(`);
      assert.ok(i >= 0, nume);
      const j = a.indexOf("\nexport async function ", i + 10);
      return a.slice(i, j < 0 ? undefined : j);
    };
    for (const nume of ["saveFactureazaConfig", "disconnectFactureaza"]) {
      const c = corp(nume);
      assert.ok(c.indexOf("await proprietar(businessId)") > 0 && c.indexOf("await proprietar(businessId)") < c.indexOf(".update("), nume);
    }
    const t = corp("testFactureazaConfig");
    assert.ok(t.indexOf("secretDinConfig(") > 0 && t.indexOf("secretDinConfig(") < t.indexOf("testeazaConexiunea("));
    for (const nume of ["generateFactureazaInvoice", "stornoFactureazaInvoiceAction", "refreshFactureazaDocuments"]) {
      assert.match(corp(nume), /const ctx = await context\(businessId, orderId/, nume);
    }
    assert.match(a, /if \(!eSistem\(sistem\)\) \{\s*const p = await proprietar\(businessId\);/);
  });
  test("⚠ salvarea face proba INAINTE de scriere si se opreste la refuzul lor", () => {
    const a = viu(ACTIUNI);
    const corp = a.slice(a.indexOf("export async function saveFactureazaConfig("), a.indexOf("export async function testFactureazaConfig("));
    assert.ok(corp.indexOf("testeazaConexiunea(") > 0);
    assert.ok(corp.indexOf("testeazaConexiunea(") < corp.indexOf(".update("), "scrierea vine inaintea probei");
    assert.match(corp, /if \(!proba\.ok && proba\.refuz\) return \{ error: proba\.error \};/);
    assert.ok(corp.indexOf("verificaSeriaLaSalvare(proba.serii") < corp.indexOf(".update("), "seria anului se verifica inainte de scriere");
    assert.match(corp, /if \(s\.fel === "refuz"\) return \{ error: s\.mesaj \};\s*if \(s\.fel === "avertisment"\) avertismente\.push\(s\.mesaj\);/);
  });
  test("⚠⚠ cheia: aleasa DUPA `pastreazaSecretele` si dupa mediu, la salvare si la proba", () => {
    const a = viu(ACTIUNI);
    const salvare = a.slice(a.indexOf("export async function saveFactureazaConfig("), a.indexOf("export async function testFactureazaConfig("));
    const i = (s: string) => {
      const k = salvare.indexOf(s);
      assert.ok(k >= 0, `nu mai gasesc „${s}”`);
      return k;
    };
    assert.ok(i("pastreazaSecretele(") < i("cheiaDeFolosit(curat.api_key, mediul(curat), vechi?.factureaza_config)"));
    assert.ok(i("final.api_key = cheia.cheie;") < i("testeazaConexiunea("));
    const proba = a.slice(a.indexOf("export async function testFactureazaConfig("), a.indexOf("export async function disconnectFactureaza("));
    assert.match(proba, /cheiaDeFolosit\("", mediuNou, \{ api_key: salvata, mediu: mediuSalvat \}\)/);
    assert.ok(proba.indexOf("cheiaDeFolosit(") < proba.indexOf("testeazaConexiunea("));
  });
  test("⚠ setarile de TVA necitite opresc facturarea (nu devin „neplatitor”)", () => {
    const a = viu(ACTIUNI);
    const ctx = a.slice(a.indexOf("async function context("), a.indexOf("function eticheta("));
    assert.match(ctx, /\{ data: setari, error: eSetari \}/);
    assert.ok(ctx.indexOf("if (eSetari || !setari) return { error:") > 0);
    assert.ok(ctx.indexOf("if (eSetari || !setari) return { error:") < ctx.indexOf("vat_enabled: s?.vat_enabled ?? false"));
  });
  test("⚠ incasarea pe RESTUL de plata; adoptarea si stornarea doar a ce e EMIS; data documentului in registru", () => {
    const a = viu(ACTIUNI);
    assert.match(a, /const suma = sumaDeIncasat\(p\.doc, p\.emisaAcum\);/);
    assert.ok(!/p\.doc\.total \?\? Number\(p\.comanda\.total\)/.test(a));
    assert.match(a, /const gasita = facturaExistenta\(prep\.existente, marcaj\);\s*if \(gasita\.fel === "refuz"\) throw eroareRefuz\(gasita\.mesaj\);/);
    assert.match(a, /const gasita = stornareExistenta\(original, date\.stornari\);\s*if \(gasita\.fel === "refuz"\) throw eroareRefuz\(gasita\.mesaj\);/);
    assert.equal((a.match(/data: dataValida\(doc\.data\) \?\? compusa\.data/g) ?? []).length, 2, "C1: factura si stornarea emise");
    assert.equal((a.match(/adoptat: true, mediu, \.\.\.\(data \? \{ data \} : \{\}\)/g) ?? []).length, 2, "C1: si la adoptare");
  });
  test("emiterea, stornarea si incasarea trec prin registru, cu verdictul furnizorului si mediul in cheie", () => {
    const a = viu(ACTIUNI);
    for (const fel of ["factura", "storno", "incasare"]) {
      assert.match(a, new RegExp(`fel: "${fel}", furnizor: "factureaza"`), fel);
    }
    assert.equal((a.match(/await cuRegistru\(/g) ?? []).length, 3);
    assert.equal((a.match(/verdictFurnizor,\n\s*\);/g) ?? []).length, 3);
    assert.match(a, /cheieOperatie\("factura", "factureaza", `\$\{mediu === "test" \? "test:" : ""\}\$\{cheieDocument\(orderId, slotCheie\)\}`\)/);
  });
  test("⚠ scrierile pe comanda sunt legate de magazin si verificate", () => {
    const a = viu(ACTIUNI);
    const scrieri = a.split('.from("orders").update(').slice(1);
    assert.equal(scrieri.length, 3);
    for (const s of scrieri) {
      const instructiune = s.slice(0, s.indexOf(";"));
      assert.match(instructiune, /\.eq\("id", orderId\)\.eq\("business_id", businessId\)/);
    }
    assert.equal((a.match(/await verificaLegaturaDocumentului\(/g) ?? []).length, 2, "factura si stornarea");
  });
  test("garzile emiterii: easySales, moneda, mediul, si adoptarea dupa marcaj", () => {
    const a = viu(ACTIUNI);
    const corp = a.slice(a.indexOf("export async function generateFactureazaInvoice("), a.indexOf("async function citesteFaraSaArunce("));
    const i = (s: string) => {
      const k = corp.indexOf(s);
      assert.ok(k >= 0, `nu mai gasesc „${s}”`);
      return k;
    };
    assert.ok(i("procesataInEasySales(") < i("await cuRegistru("));
    assert.ok(i("monedaStraina(") < i("await cuRegistru("));
    assert.ok(i("documenteleInMediu(") < i("slotFacturare("));
    assert.ok(i("facturaExistenta(prep.existente, marcaj)") < i("emiteDocumentul("), "documentul cu marcajul nostru se adopta INAINTE de a emite altul");
  });
  test("⚠ ruta de PDF: sesiune, MFA si proprietar INAINTE de citirea configurarii; nimic in cache", () => {
    const r = viu("src/app/api/factureaza/pdf/route.ts");
    const i = (s: string) => {
      const k = r.indexOf(s);
      assert.ok(k >= 0, `nu mai gasesc „${s}”`);
      return k;
    };
    assert.ok(i("auth.getUser()") < i("refuzaDacaMfaNeconfirmat("));
    assert.ok(i("refuzaDacaMfaNeconfirmat(") < i('.eq("user_id", user.id)'));
    assert.ok(i('.eq("user_id", user.id)') < i("configurareaMagazinului("));
    assert.match(r, /"Cache-Control": "private, no-store"/);
    assert.match(r, /\.replace\(\/\[\^A-Za-z0-9\._-\]\/g, "_"\)/);
  });
  test("⚠ pagina trimite configurarea MASCATA", () => {
    const p = viu("src/app/(dashboard)/dashboard/features/factureaza/page.tsx");
    assert.match(p, /initialConfig=\{config\}/);
    assert.match(p, /const config = mascheazaFactureaza\(/);
  });
});
