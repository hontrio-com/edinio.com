import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";
import { faraComentarii } from "@/lib/edinio-marketing/fara-comentarii";
import { CAMPURI_SECRETE } from "@/lib/integrari/secrete";
import { CAMPURI_SECRETE_FACTUREAZA } from "@/lib/factureaza/config";
import { SECRETE_EASYBILL } from "@/lib/easybill/config";
import { CAMPURI_SECRETE_SAGA, CASE_FACTURARE } from "@/lib/saga/config";
import { COLOANE_FACTURA_EMISA } from "./factura-pe-comanda";
import { facturaComenzii, facturaDeTest } from "./factura-comenzii";

/*
 * ═══ Factureaza.ro, easybill si SAGA: LEGATE PESTE TOT IN PLATFORMA ═══
 *
 * Modulele fiecarei integrari isi au probele lor (`src/lib/<casa>/*.test.ts`). Aici se probeaza
 * LEGAREA: fiecare loc din platforma care intreaba de casele de facturare le cunoaste si pe cele noi.
 * Un loc uitat inseamna, dupa caz, o a doua factura fiscala (dispecerul ar emite la alta casa), o
 * urcare la marketplace blocata pe `fetch("")`, un PDF pe care cumparatorul nu-l poate descarca, sau
 * un secret necriptat in baza.
 *
 * ⚠ Se cauta in cod FARA comentarii: un comentariu care pomeneste o legatura nu e o legatura.
 */

const viu = (f: string) => faraComentarii(readFileSync(f, "utf8").replace(/\r\n/g, "\n"));
const brut = (f: string) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");
const MIGRATIE = "migrations/2027-02-06-factureaza-easybill-saga.sql";

/* Casele „cu cheie": emiterea intoarce id-ul documentului, PDF-ul vine numai prin API. */
const CASE = [
  { casa: "factureaza", nume: "Factureaza.ro", Actiune: "Factureaza", secrete: [...CAMPURI_SECRETE_FACTUREAZA] },
  { casa: "easybill", nume: "easybill", Actiune: "Easybill", secrete: [...SECRETE_EASYBILL] },
] as const;

describe("baza: migratia comuna", () => {
  const sql = brut(MIGRATIE);
  test("a intrat in productie (e in baseline, nu mai e in asteptare) si s-a aplicat DUPA Facturis", () => {
    assert.ok(!brut("scripts/verifica-tipuri-db.mjs").includes(`"${MIGRATIE}"`), "inca in asteptare");
    const baseline = brut("migrations/000-schema-baseline.sql");
    for (const urma of ["factureaza_invoice_key text", "easybill_invoice_key text", "create table if not exists public.saga_exporturi", "saga_exporturi_de_golit_idx"]) {
      assert.ok(baseline.includes(urma), `baseline-ul nu are: ${urma}`);
    }
    assert.match(sql, /DUPA `2027-02-05-facturis\.sql`/);
    assert.ok(!sql.includes("@@"), "a ramas un loc de lipit negolit");
  });
  test("⚠ fiecare secret din cod se cripteaza in baza (aceleasi nume ca in `CAMPURI_SECRETE`)", () => {
    const toate = { factureaza_config: CAMPURI_SECRETE_FACTUREAZA, easybill_config: SECRETE_EASYBILL, saga_config: CAMPURI_SECRETE_SAGA };
    for (const [coloana, campuri] of Object.entries(toate)) {
      assert.match(sql, new RegExp(`alter table privat\\.store_settings\\s+add column if not exists ${coloana} jsonb;`));
      assert.deepEqual([...(CAMPURI_SECRETE[coloana] ?? [])].sort(), [...campuri].sort(), `CAMPURI_SECRETE.${coloana}`);
      for (const camp of campuri) assert.ok(sql.includes(`('${coloana}', '${camp}')`), `${coloana}.${camp} nu se cripteaza`);
    }
    /* Vederea se reface DUPA toate configurarile, o singura data. */
    const ultimaConfigurare = sql.lastIndexOf("('saga_config', 'api_key')");
    assert.ok(sql.indexOf("select privat.reconstruieste_store_settings();") > ultimaConfigurare);
    assert.ok(sql.indexOf("select privat.reconstruieste_store_settings_upd();") > ultimaConfigurare);
  });
  test("registrul primeste felul `export` si furnizorii noi, fara sa piarda vreunul", () => {
    assert.match(sql, /'expediere', 'export', 'proba'/);
    assert.match(sql, /'smartbill', 'oblio', 'fgo', 'facturis', 'factureaza', 'easybill', 'saga',/);
    for (const vechi of ["cargus", "epacket", "stripe", "revolut", "trendyol", "emag"]) assert.ok(sql.includes(`'${vechi}'`), vechi);
    const tip = viu("src/lib/operatii/registru.ts");
    assert.match(tip, /\| "facturis" \| "factureaza" \| "easybill" \| "saga"/);
    assert.match(tip, /\| "export"/);
  });
  test("contul cumparatorului si Trendyol cunosc casele noi; ⚠ documentul din sandbox Factureaza.ro NU", () => {
    for (const { casa } of CASE) {
      assert.match(sql, new RegExp(`'casa', '${casa}'`), `contul: ${casa}`);
      assert.match(sql, new RegExp(`o\\.${casa}_invoice_key is not null and o\\.${casa}_invoice_number is not null`), `Trendyol: ${casa}`);
    }
    /* Contul il sare; Trendyol il lasa sa ajunga la garda din cod, care spune DE CE nu urca. */
    const cont = sql.slice(sql.indexOf("FUNCTION privat.cont_documentul_comenzii"), sql.indexOf("FUNCTION public.trendyol_comenzi_de_facturat"));
    assert.match(cont, /and o\.factureaza_invoice_key not like 'test:%' then/);
    assert.equal((sql.match(/not like 'test:%'/g) ?? []).length, 1);
  });
  test("SAGA: jurnalul are RLS (citeste proprietarul, scrie serverul), iar functiile sunt numai ale serverului", () => {
    assert.match(sql, /alter table public\.saga_exporturi enable row level security;/);
    assert.match(sql, /revoke insert, update, delete, truncate, references, trigger on table public\.saga_exporturi from authenticated;/);
    for (const f of ["saga_ocupa_apelul(uuid, uuid, integer)", "saga_elibereaza_apelul(uuid, uuid)", "saga_roteste_cheia(uuid, text, text)"]) {
      assert.ok(sql.includes(`revoke execute on function public.${f} from public, anon, authenticated;`), f);
      assert.ok(sql.includes(`grant execute on function public.${f} to service_role;`), f);
    }
    assert.equal((sql.match(/security definer\n set search_path to ''/g) ?? []).length, 3, "fiecare functie definer are search_path gol");
    assert.match(sql, /create index if not exists saga_exporturi_creat_la_idx/);
    assert.match(sql, /create index if not exists saga_exporturi_de_golit_idx\s+on public\.saga_exporturi \(id\) where order_id is null and \(raport is not null or mesaj is not null\);/);
  });
  test("tipurile au coloanele, configurarile, jurnalul SAGA si functiile lui", () => {
    const t = brut("src/types/database.types.ts");
    for (const { casa } of CASE) {
      for (const c of ["invoice_key", "invoice_series", "invoice_number", "storno_key", "storno_series", "storno_number"]) {
        assert.ok(t.includes(`${casa}_${c}: string | null`), `${casa}_${c}`);
      }
    }
    for (const c of ["factureaza_config", "easybill_config", "saga_config"]) assert.ok(t.includes(`${c}: Json | null`), c);
    assert.match(t, /^ {6}saga_exporturi: \{$/m);
    for (const f of ["saga_ocupa_apelul", "saga_elibereaza_apelul", "saga_roteste_cheia"]) assert.match(t, new RegExp(`^ {6}${f}: \\{$`, "m"));
    for (const f of ["src/lib/saga/jurnal.ts", "src/lib/saga/server.ts"]) assert.ok(!/netipat/.test(viu(f)), `${f}: clientul netipat a ramas`);
  });
});

describe("„are comanda factura?” si dispecerul", () => {
  test("regula unica cuprinde cheile caselor noi, in ordinea dispecerului", () => {
    assert.deepEqual(COLOANE_FACTURA_EMISA.slice(-3), ["facturis_invoice_key", "factureaza_invoice_key", "easybill_invoice_key"]);
    assert.deepEqual([...CASE_FACTURARE], ["smartbill", "oblio", "fgo", "facturis", "factureaza", "easybill"], "SAGA alege documentul in aceeasi ordine");
  });
  test("facturarea automata le stie, DUPA Facturis, in ordine (o singura casa raspunde)", () => {
    const d = viu("src/lib/actions/invoice-auto.actions.ts");
    assert.match(viu("src/lib/billing/casa-automata.ts"), /\["smartbill", "oblio", "fgo", "facturis", "factureaza", "easybill"\] as const/);
    for (const casa of ["factureaza", "easybill"]) {
      assert.ok(d.includes(`${casa}: () => import("@/lib/actions/${casa}.actions")`), casa);
    }
  });
  test("⚠ TVA-ul magazinului NECITIT opreste emiterea (altfel liniile ar pleca cu 0%), la casele cu cheie", () => {
    for (const casa of ["facturis", "factureaza", "easybill"]) {
      const a = viu(`src/lib/actions/${casa}.actions.ts`);
      assert.match(a, /\{ data: setari, error: eSetari \}/, `${casa}: eroarea citirii TVA nu se mai citeste`);
      assert.match(a, /if \(eSetari \|\| !setari\) return \{ error:/, `${casa}: citirea TVA picata nu mai opreste emiterea`);
    }
  });
  test("lotul le poate alege si le cheama, cu regula fiecareia", () => {
    const b = viu("src/lib/actions/bulk-orders.actions.ts");
    assert.match(b, /"facturis" \| "factureaza" \| "easybill"/);
    for (const { casa, Actiune } of CASE) {
      assert.match(b, new RegExp(`generate${Actiune}Invoice\\(businessId, o\\.id\\)`), casa);
      assert.match(b, new RegExp(`${casa}: ${casa}Gata\\(settings\\?\\.${casa}_config\\)`), casa);
    }
    assert.match(b, /const ORDINE = \["smartbill", "oblio", "fgo", "facturis", "factureaza", "easybill"\] as const;/);
  });
});

describe("documentul comenzii, in afara paginii ei", () => {
  test("factura comenzii (urcarea la marketplace) le gaseste dupa cheie si numar", () => {
    for (const { casa } of CASE) {
      const f = facturaComenzii({ [`${casa}_invoice_key`]: "77", [`${casa}_invoice_series`]: "EDN", [`${casa}_invoice_number`]: "12" });
      assert.deepEqual(f, { furnizor: casa, numar: "EDN12", url: "", cheie: "77" }, casa);
      /* Fara numar citit, nu urca nimic: numarul de pe document trebuie sa fie stiut. */
      assert.equal(facturaComenzii({ [`${casa}_invoice_key`]: "77" }), null, casa);
    }
  });
  test("⚠ documentul din sandbox Factureaza.ro nu urca la eMAG sau Trendyol", () => {
    assert.equal(facturaDeTest({ furnizor: "factureaza", numar: "X1", url: "", cheie: "test:77" }), true);
    assert.equal(facturaDeTest({ furnizor: "factureaza", numar: "X1", url: "", cheie: "77" }), false);
    assert.equal(facturaDeTest({ furnizor: "easybill", numar: "X1", url: "", cheie: "test:77" }), false, "easybill n-are sandbox");
    for (const f of ["src/lib/emag/facturi.ts", "src/lib/trendyol/facturi.ts"]) {
      const c = viu(f);
      assert.match(c, /if \(facturaDeTest\(factura\)\) return \{ fel: "esec", mesaj: DOCUMENT_DE_TEST \};/, f);
      for (const { casa } of CASE) assert.match(c, new RegExp(`${casa}_invoice_key, ${casa}_invoice_series, ${casa}_invoice_number`), `${f}: ${casa}`);
    }
  });
  test("⚠ cronurile eMAG si Trendyol aduc PDF-ul prin API, nu printr-o adresa goala", () => {
    for (const f of ["src/app/api/cron/emag-sync/route.ts", "src/app/api/cron/trendyol-sync/route.ts"]) {
      const c = viu(f);
      assert.match(c, /f\.furnizor === "facturis" \|\| f\.furnizor === "factureaza" \|\| f\.furnizor === "easybill"/, f);
      for (const casa of ["facturis", "factureaza", "easybill"]) {
        assert.ok(c.includes(`${casa}: () => import("@/lib/${casa}/server")`), `${f}: ${casa}`);
      }
    }
  });
  test("contul cumparatorului aduce PDF-ul cu acreditarile citite pe server; testul se opreste INAINTE de retea", () => {
    const r = viu("src/lib/cont/ruta-document.ts");
    const p = viu("src/lib/cont/pdf-document.ts");
    for (const { casa } of CASE) {
      assert.match(r, new RegExp(`doc\\.casa === "${casa}"`), casa);
      assert.match(r, new RegExp(`${casa}\\.configurareaMagazinului\\(admin, magazin\\.id\\)`), casa);
      assert.ok(r.includes(`${casa}_invoice_key, `) && r.includes(`${casa}_storno_key`), `${casa}: selectul`);
      assert.match(p, new RegExp(`fel: "${casa}"; acreditari`), casa);
    }
    const garda = p.indexOf('sursa.fel === "factureaza" && eDocumentDeTestFactureaza(sursa.cheie)');
    assert.ok(garda > 0 && garda < p.indexOf("await pdfFactureaza("), "garda documentului de test vine inaintea cererii");
    assert.match(viu("src/lib/cont/documente.ts"), /"facturis", "factureaza", "easybill"\]\);/);
  });
  test("SAGA nu trimite in contabilitate documentul din sandbox Factureaza.ro", () => {
    assert.match(viu("src/lib/saga/document-sursa.ts"), /casa === "factureaza" && eDocumentDeTestFactureaza\(f\.cheie\)/);
  });
});

describe("ecranele", () => {
  test("pagina comenzii: steagurile, fila comuna, si panoul SAGA", () => {
    const pagina = viu("src/app/(dashboard)/dashboard/orders/[orderId]/page.tsx");
    for (const s of ["factureazaEnabled={factureazaEnabled}", "factureazaTest={factureazaTest}", "easybillEnabled={easybillEnabled}", "saga={saga}"]) {
      assert.ok(pagina.includes(s), s);
    }
    assert.match(pagina, /stareaPanouluiSaga\(createAdminClient\(\), biz\.id, order\)\.catch\(\(\) => null\)/, "SAGA cazut nu cade pagina");
    assert.match(pagina, /export const maxDuration = 300;/);
    const d = viu("src/components/dashboard/OrderDetailClient.tsx");
    for (const { casa, nume } of CASE) {
      /* Fila ramane montata (doar ascunsa) cand alta e aleasa: starea „se emite” nu se pierde. */
      assert.match(d, new RegExp(`${casa}Enabled && \\(\\s*<div hidden=\\{activeProvider !== "${casa}"\\}>\\s*<FilaCaseiCuCheie\\s+casa="${nume.replace(".", "\\.")}"\\s+ruta="/api/${casa}/pdf"`), casa);
    }
    assert.match(d, /storneaza=\{\(\) => stornoFactureazaInvoiceAction\(businessId, order\.id\)\}/);
    assert.match(d, /deTest=\{eDocumentDeTestFactureaza\(/);
    assert.match(d, /stornareInAfara=\{<EasybillStornareManuala businessId=\{businessId\} orderId=\{order\.id\} \/>\}/);
    assert.match(d, /\{saga && <SagaComandaPanel businessId=\{businessId\} orderId=\{order\.id\} stare=\{saga\} \/>\}/);
  });
  test("⚠ easybill n-are stornare din Edinio: nici actiune, nici buton (se storneaza la ei, apoi se inregistreaza)", () => {
    const a = viu("src/lib/actions/easybill.actions.ts");
    assert.ok(!/export async function storno/i.test(a));
    assert.match(a, /export async function inregistreazaStornareaEasybill\(/);
  });
  test("lista: coloanele, fara stornare din lista; lotul SAGA", () => {
    const l = viu("src/components/dashboard/OrdersClient.tsx");
    for (const { casa, Actiune } of CASE) {
      assert.match(l, new RegExp(`${casa}Enabled && \\(`), casa);
      assert.match(l, new RegExp(`emite=\\{\\(\\) => generate${Actiune}Invoice\\(businessId, order\\.id\\)\\}`), casa);
      assert.ok(!new RegExp(`storno${Actiune}`).test(l), `${casa}: stornarea nu se face din lista, fara confirmare`);
    }
    assert.match(l, /exportaComenzileInSaga\(businessId!, \[\.\.\.selected\]\)/);
    /* Lotul nu inghite avertismentele (sandbox, total diferit) si spune motivul ADEVARAT al opririi. */
    assert.ok(viu("src/lib/actions/bulk-orders.actions.ts").includes("(result.avertismente ??= []).push("), "lotul de facturi pierde avertismentele");
    assert.match(l, /if \(res\.avertismente\?\.length\)/, "lista nu arata avertismentele lotului");
    assert.match(l, /res\.motivOprire\s*\?/, "lista nu spune motivul opririi");
    assert.match(viu("src/components/dashboard/OperatiiAtarnate.tsx"), /fel === "export" \? "Trimiterea în contabilitate"/, "operatia SAGA blocata n-are nume");
    assert.ok(!/storneaza/.test(viu("src/components/dashboard/facturare/CelulaCaseiCuCheie.tsx")), "celula nu primeste stornarea");
    const pagina = viu("src/app/(dashboard)/dashboard/orders/page.tsx");
    for (const s of ["factureazaEnabled={integrari.factureazaEnabled}", "easybillEnabled={integrari.easybillEnabled}", "sagaEnabled={integrari.sagaEnabled}"]) {
      assert.ok(pagina.includes(s), s);
    }
  });
  test("Integrari: cardurile livrate (nu „in curand”), active dupa regula fiecareia, cu sigla si ghid", () => {
    const p = viu("src/app/(dashboard)/dashboard/features/page.tsx");
    const antet = brut("src/components/dashboard/IntegrationHeader.tsx");
    const catalog = brut("src/lib/website/integrari-catalog.ts");
    for (const casa of ["factureaza", "easybill", "saga"]) {
      assert.match(p, new RegExp(`id: "${casa}" \\}`), casa);
      assert.match(p, new RegExp(`integration\\.id === "${casa}" \\? ${casa}Active`), casa);
      assert.match(p, new RegExp(`integration\\.id === "${casa}" \\? "/dashboard/features/${casa}"`), casa);
      assert.match(p, new RegExp(`${casa}Active = ${casa}Gata\\(settings\\?\\.${casa}_config\\)`), casa);
      assert.match(antet, new RegExp(`  ${casa}: \\{ src: "/integrations/`), casa);
      assert.match(catalog, new RegExp(`cheie: "${casa}",\\n    categorie: "facturare",\\n    stare: "activa",`), casa);
    }
  });
  test("⚠ SAGA: refacturarea dupa storno, la ORICARE casa, asteapta pana pleaca stornarea in contabilitate", () => {
    /* Altfel, in SAGA ar ramane factura inlocuita fara stornarea ei: venit si TVA dublate, tacut. */
    const cate: Record<string, number> = { smartbill: 2, oblio: 1, fgo: 1, facturis: 1, factureaza: 1, easybill: 1 };
    for (const [casa, n] of Object.entries(cate)) {
      const a = viu(`src/lib/actions/${casa}.actions.ts`);
      const chemari = a.match(/const saga = await sagaPermiteReemiterea\(createAdminClient\(\), businessId, orderId\);\s*if \(!saga\.ok\) return \{ error: saga\.mesaj \};/g) ?? [];
      assert.equal(chemari.length, n, `${casa}: garda SAGA lipseste sau nu opreste emiterea`);
    }
  });
  test("SAGA: cronul e programat si pazit", () => {
    const v = JSON.parse(brut("vercel.json")) as { crons: { path: string; schedule: string }[] };
    assert.deepEqual(v.crons.find((c) => c.path === "/api/cron/saga-export"), { path: "/api/cron/saga-export", schedule: "7,37 * * * *" });
    const r = viu("src/app/api/cron/saga-export/route.ts");
    assert.match(r, /if \(!verificaCron\(req\)\)/);
    assert.match(r, /\.from\("saga_exporturi"\)\.delete\(\)\.lt\("creat_la", pragJurnal\)/, "pastrarea de 24 de luni");
  });
});
