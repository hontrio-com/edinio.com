import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";
import { faraComentarii } from "@/lib/edinio-marketing/fara-comentarii";
import { CAMPURI_SECRETE } from "@/lib/integrari/secrete";
import { facturaComenzii } from "@/lib/billing/factura-comenzii";
import { documentulFiscal } from "@/lib/cont/documente";
import { slotFacturare, cheieDocument } from "@/lib/billing/refacturare";
import { facturisGata, seriaStornarii } from "./config";

/*
 * ═══ Facturis: LEGATA PESTE TOT ═══
 *
 * O casa de facturare noua se leaga in ~20 de locuri (lista e in `docs/facturare/FACTURIS.md`).
 * Fiecare uitare de aici a existat deja la altcineva: fGO lipsea din urcarea la Trendyol, Oblio isi
 * refacea titularul din comanda la storno, iar o coloana noua lipsa din select rupe TOATA interogarea.
 * Proba asta cade la prima uitare.
 *
 * ⚠ Se uita in cod FARA comentarii: un comentariu care pomeneste Facturis nu e o legatura.
 */

const viu = (f: string) => faraComentarii(readFileSync(f, "utf8"));
const MIGRATIE = "migrations/2027-02-05-facturis.sql";

describe("baza si secretele", () => {
  test("⚠ secretele: aceleasi nume in cod, in tip si in migratie, si vederea se reface dupa ele", () => {
    assert.deepEqual([...CAMPURI_SECRETE.facturis_config].sort(), ["api_key", "password"]);
    const sql = readFileSync(MIGRATIE, "utf8");
    for (const camp of CAMPURI_SECRETE.facturis_config) {
      assert.ok(sql.includes(`('facturis_config', '${camp}')`), `${camp} nu se cripteaza in baza`);
    }
    assert.match(sql, /select privat\.reconstruieste_store_settings\(\);\s*select privat\.reconstruieste_store_settings_upd\(\);/);
    const tip = viu("src/lib/facturis/config.ts");
    for (const camp of CAMPURI_SECRETE.facturis_config) assert.match(tip, new RegExp(`\\b${camp}: string;`));
  });
  test("registrul primeste furnizorul, in cod si in constrangere", () => {
    assert.match(viu("src/lib/operatii/registru.ts"), /"fgo" \| "facturis"/);
    assert.match(readFileSync(MIGRATIE, "utf8"), /'fgo', 'facturis', 'stripe'/);
  });
  test("contul cumparatorului si urcarea la Trendyol stiu de Facturis, in baza", () => {
    const sql = readFileSync(MIGRATIE, "utf8");
    assert.match(sql, /'casa', 'facturis'/);
    assert.match(sql, /x\.furnizor = 'facturis'/);
    assert.match(sql, /o\.facturis_invoice_key is not null and o\.facturis_invoice_number is not null/);
  });
  test("migratia a intrat in productie (e in baseline, nu mai e in asteptare), iar tipurile au coloanele", () => {
    assert.ok(!readFileSync("scripts/verifica-tipuri-db.mjs", "utf8").includes(`"${MIGRATIE}"`), "inca in asteptare");
    assert.match(readFileSync("migrations/000-schema-baseline.sql", "utf8"), /facturis_invoice_key text/, "baseline-ul nu stie de Facturis");
    const tipuri = readFileSync("src/types/database.types.ts", "utf8");
    for (const c of ["facturis_invoice_key", "facturis_invoice_number", "facturis_storno_key", "facturis_config"]) {
      assert.ok(tipuri.includes(`${c}: `), `${c} lipseste din tipuri`);
    }
  });
});

describe("regulile comune", () => {
  test("„gata” cere cheia, utilizatorul, parola, codul fiscal SI seria", () => {
    const plin = { enabled: true, api_key: "k", username: "u", password: "p", cif: "RO1", serie: "EDN" };
    assert.equal(facturisGata(plin), true);
    for (const lipsa of ["api_key", "username", "password", "cif", "serie"] as const) {
      assert.equal(facturisGata({ ...plin, [lipsa]: " " }), false, `${lipsa} gol trece drept configurat`);
    }
    assert.equal(facturisGata({ ...plin, enabled: false }), false);
    assert.equal(facturisGata(null), false);
  });
  test("seria stornarilor: cea anume, altfel a facturilor", () => {
    assert.equal(seriaStornarii({ serie: "EDN", serie_storno: " " }), "EDN");
    assert.equal(seriaStornarii({ serie: "EDN", serie_storno: "STO" }), "STO");
  });
  test("⚠ dupa storno, cheia emiterii se schimba (reemiterea e alt document), altfel ramane", () => {
    const fara = slotFacturare({ casa: "Facturis", factura: null, storno: null });
    assert.equal(cheieDocument("o1", fara), "o1");
    const ocupat = slotFacturare({ casa: "Facturis", factura: "123", storno: null });
    assert.equal(ocupat.poateEmite, false);
    const dupa = slotFacturare({ casa: "Facturis", factura: "123", storno: "456" });
    assert.equal(cheieDocument("o1", dupa), "o1-R456");
  });
  test("urcarea la marketplace: factura Facturis vine cu cheie si numar, fara adresa", () => {
    const f = facturaComenzii({ facturis_invoice_key: "92", facturis_invoice_series: "EDN", facturis_invoice_number: "141" });
    assert.deepEqual(f, { furnizor: "facturis", numar: "EDN141", url: "", cheie: "92" });
    /* Fara numar inca: nu pleaca nimic la marketplace (numele atasamentului si cheia R2 il cer). */
    assert.equal(facturaComenzii({ facturis_invoice_key: "92", facturis_invoice_number: null }), null);
  });
  test("contul cumparatorului primeste documentul Facturis", () => {
    const d = documentulFiscal({ casa: "facturis", serie: "EDN", numar: "141", stornata: false });
    assert.equal(d?.casa, "facturis");
  });
});

describe("facturarea, peste tot unde se intreaba „are factura?”", () => {
  test("dispecerul automat: cheia in select si in garda, si Facturis dupa fGO", () => {
    const d = viu("src/lib/actions/invoice-auto.actions.ts");
    assert.match(d, /fgo_invoice_number, facturis_invoice_key/);
    /* Garda e regula unica `areFacturaEmisa` (factura-pe-comanda.ts), care cuprinde cheia Facturis. */
    assert.match(d, /if \(areFacturaEmisa\(o\)\) return;/);
    /* Dispecerul alege o singura casa (`casaResponsabila`), in ordinea `CASE_AUTOMATE`. */
    const ordine = viu("src/lib/billing/casa-automata.ts");
    assert.match(ordine, /\["smartbill", "oblio", "fgo", "facturis",/, "Facturis trebuie sa vina DUPA fGO");
    assert.ok(d.includes('facturis: () => import("@/lib/actions/facturis.actions")'));
  });
  test("⚠ cheia, nu numarul: regula unica o cuprinde, iar locurile o intreaba (vezi factura-pe-comanda.test.ts)", () => {
    assert.match(viu("src/lib/billing/factura-pe-comanda.ts"), /"facturis_invoice_key"/);
    for (const f of [
      "src/lib/actions/bulk-orders.actions.ts",
      "src/lib/actions/order.actions.ts",
      "src/lib/actions/easysales.actions.ts",
      "src/lib/aboutyou/orders.ts",
    ]) {
      assert.match(viu(f), /facturis_invoice_key/, `${f}: cheia Facturis lipseste din select`);
    }
    assert.match(viu("src/components/dashboard/OrderEditModal.tsx"), /areFacturaEmisa\(order\)/);
  });
  test("lotul poate alege Facturis si o cheama", () => {
    const b = viu("src/lib/actions/bulk-orders.actions.ts");
    assert.match(b, /"fgo" \| "facturis"/);
    assert.match(b, /generateFacturisInvoice\(businessId, o\.id\)/);
  });
  test("⚠ cronurile eMAG si Trendyol aduc PDF-ul Facturis prin API, nu printr-o adresa goala", () => {
    for (const f of ["src/app/api/cron/emag-sync/route.ts", "src/app/api/cron/trendyol-sync/route.ts"]) {
      const c = viu(f);
      assert.match(c, /f\.furnizor === "facturis"/, f);
      assert.match(c, /pdfDocumentAlMagazinului\(admin, businessId, f\.cheie\)/, f);
    }
    for (const f of ["src/lib/emag/facturi.ts", "src/lib/trendyol/facturi.ts"]) {
      assert.match(viu(f), /facturis_invoice_key, facturis_invoice_series, facturis_invoice_number/, f);
    }
  });
  test("contul cumparatorului: ruta aduce PDF-ul Facturis cu acreditarile citite pe server", () => {
    const r = viu("src/lib/cont/ruta-document.ts");
    assert.match(r, /doc\.casa === "facturis"/);
    assert.match(r, /configurareaMagazinului\(admin, magazin\.id\)/);
    assert.match(viu("src/lib/cont/pdf-document.ts"), /sursa\.fel === "facturis"/);
  });
});

describe("ecranele", () => {
  test("cardul e livrat in Integrari (nu „in curand”) si duce la configurare", () => {
    const p = readFileSync("src/app/(dashboard)/dashboard/features/page.tsx", "utf8");
    assert.match(p, /logo: "\/integrations\/facturis\.png", filter: "invert\(1\)", id: "facturis"/);
    assert.ok(!/facturis\.png", filter: "invert\(1\)", soon: true/.test(p));
    assert.match(p, /integration\.id === "facturis" \? "\/dashboard\/features\/facturis"/);
    assert.match(p, /facturisActive = facturisGata\(/);
  });
  test("pagina comenzii si lista primesc steagul si au fila / coloana Facturis", () => {
    assert.match(viu("src/app/(dashboard)/dashboard/orders/[orderId]/page.tsx"), /facturisEnabled=\{facturisEnabled\}/);
    assert.match(viu("src/app/(dashboard)/dashboard/orders/page.tsx"), /facturisEnabled=\{integrari\.facturisEnabled\}/);
    const d = viu("src/components/dashboard/OrderDetailClient.tsx");
    /* Fila e componenta comuna a caselor cu cheie (`FilaCaseiCuCheie`), cu actiunile Facturis. */
    assert.match(d, /facturisEnabled && \(\s*<div hidden=\{activeProvider !== "facturis"\}>\s*<FilaCaseiCuCheie\s+casa="Facturis"\s+ruta="\/api\/facturis\/pdf"/);
    assert.match(d, /storneaza=\{\(\) => stornoFacturisInvoiceAction\(businessId, order\.id\)\}/);
    assert.match(viu("src/components/dashboard/facturare/FilaCaseiCuCheie.tsx"), /Da, stornează/, "stornarea trebuie sa ceara a doua apasare");
    const l = viu("src/components/dashboard/OrdersClient.tsx");
    assert.match(l, /facturisEnabled && \(/);
    assert.ok(!/stornoFacturisInvoiceAction/.test(l), "stornarea nu se face din lista, fara confirmare");
  });
  test("antetul are sigla (inversata: e alba) si pagina are ghidul din Ajutor", () => {
    assert.match(readFileSync("src/components/dashboard/IntegrationHeader.tsx", "utf8"), /facturis: \{ src: "\/integrations\/facturis\.png", alt: "Facturis Online", filter: "invert\(1\)" \}/);
    assert.match(readFileSync("src/lib/dashboard/ghiduri-integrari.ts", "utf8"), /facturis: \["plati-si-facturare", "cum-conectezi-facturis"\]/);
  });
});

describe("securitatea", () => {
  test("modulele cu chei sunt doar de server si NU sunt „use server” (fiecare export ar fi un capat public)", () => {
    for (const f of ["src/lib/facturis/client.ts", "src/lib/facturis/server.ts"]) {
      const s = readFileSync(f, "utf8");
      assert.match(s, /^import "server-only";/m, f);
      assert.ok(!/^["']use server["']/m.test(s), `${f} e „use server"`);
    }
  });
  test("acreditarile pleaca in CORP, codate, catre un capat fara parametri", () => {
    const c = viu("src/lib/facturis/client.ts");
    assert.match(c, /ADRESA_FACTURIS = "https:\/\/api\.facturis-online\.ro\/api\/"/);
    assert.match(c, /new URLSearchParams\(\{ json: JSON\.stringify\(obiect\) \}\)/);
    assert.ok(!/fetch\(`/.test(c), "o adresa compusa ar putea purta acreditarile");
  });
  test("⚠ ruta de PDF: sesiune, MFA si proprietar INAINTE de citirea configurarii", () => {
    const r = viu("src/app/api/facturis/pdf/route.ts");
    const i = (s: string) => {
      const k = r.indexOf(s);
      assert.ok(k >= 0, `nu mai gasesc „${s}”`);
      return k;
    };
    assert.ok(i("auth.getUser()") < i("refuzaDacaMfaNeconfirmat("));
    assert.ok(i("refuzaDacaMfaNeconfirmat(") < i('.eq("user_id", user.id)'));
    assert.ok(i('.eq("user_id", user.id)') < i("configurareaMagazinului("));
  });
  test("⚠ salvarea face proba INAINTE de scriere si se opreste la refuzul lor", () => {
    const a = viu("src/lib/actions/facturis.actions.ts");
    const corp = a.slice(a.indexOf("export async function saveFacturisConfig("), a.indexOf("export async function testFacturisConfig("));
    assert.ok(corp.indexOf("testeazaConexiunea(") > 0);
    assert.ok(corp.indexOf("testeazaConexiunea(") < corp.indexOf(".update("), "scrierea vine inaintea probei");
    assert.match(corp, /if \(!proba\.ok && proba\.refuz\) return \{ error: proba\.error \};/);
  });
  test("emiterea, stornarea si incasarea trec prin registru, cu verdictul furnizorului", () => {
    const a = viu("src/lib/actions/facturis.actions.ts");
    for (const fel of ["factura", "storno", "incasare"]) {
      assert.match(a, new RegExp(`fel: "${fel}", furnizor: "facturis"`), fel);
    }
    assert.equal((a.match(/verdictFurnizor,\n\s*\);/g) ?? []).length, 3);
  });
});
