import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";
import { faraComentarii } from "@/lib/edinio-marketing/fara-comentarii";
import { CASE_AUTOMATE, casaResponsabila } from "./casa-automata";
import { COLOANE_FACTURA_EMISA } from "./factura-pe-comanda";

/*
 * Facturarea automata: O SINGURA casa raspunde de o comanda, si numai ea e chemata.
 *
 * ⚠ Inainte, dispecerul trecea la casa urmatoare ori de cate ori una intorcea `false`, iar fiecare
 * intoarce `false` si cand emiterea EI cade. Un raspuns pierdut la prima casa lasa a doua sa emita:
 * doua facturi fiscale pentru aceeasi vanzare.
 */

const viu = (f: string) => faraComentarii(readFileSync(f, "utf8").replace(/\r\n/g, "\n"));

const sb = { enabled: true, auto_invoice: true, auto_invoice_trigger: "confirmed", email: "a@b.ro", token: "t", company_vat_code: "RO1", series_name: "EDN" };
const ob = { enabled: true, auto_invoice: true, auto_invoice_trigger: "confirmed" };
const fz = { enabled: true, auto_invoice: true, auto_invoice_trigger: "confirmed", api_key: "k", serie: "SRV" };
const eb = { enabled: true, auto_invoice: true, auto_invoice_trigger: "paid", username: "u", password: "p" };

describe("alegerea", () => {
  test("prima casa, in ordine, cu automatul pornit, configurarea gata si declansatorul potrivit", () => {
    assert.equal(casaResponsabila({ smartbill_config: sb, oblio_config: ob }, "confirmed", "unpaid"), "smartbill");
    assert.equal(casaResponsabila({ oblio_config: ob, factureaza_config: fz }, "confirmed", "unpaid"), "oblio");
    assert.equal(casaResponsabila({ factureaza_config: fz, easybill_config: eb }, "confirmed", "unpaid"), "factureaza");
  });
  test("declansatorul nepotrivit sau automatul oprit trece la urmatoarea", () => {
    assert.equal(casaResponsabila({ factureaza_config: fz, easybill_config: eb }, "shipped", "paid"), "easybill", "Factureaza.ro vrea „confirmed”");
    assert.equal(casaResponsabila({ smartbill_config: { ...sb, auto_invoice: false }, oblio_config: ob }, "confirmed", "unpaid"), "oblio");
    assert.equal(casaResponsabila({ smartbill_config: sb }, "shipped", "unpaid"), null);
  });
  test("„gata” ca in fiecare casa: SmartBill cere datele, Oblio si fGO doar activarea", () => {
    assert.equal(casaResponsabila({ smartbill_config: { ...sb, token: "" } }, "confirmed", "unpaid"), null);
    assert.equal(casaResponsabila({ fgo_config: { enabled: true, auto_invoice: true, auto_invoice_trigger: "confirmed" } }, "confirmed", "unpaid"), "fgo");
    assert.equal(casaResponsabila({ factureaza_config: { ...fz, serie: "" } }, "confirmed", "unpaid"), null);
    assert.equal(casaResponsabila({ easybill_config: { ...eb, password: "" } }, "shipped", "paid"), null);
    assert.equal(casaResponsabila({ facturis_config: { enabled: true, auto_invoice: true, auto_invoice_trigger: "confirmed" } }, "confirmed", "unpaid"), null, "Facturis fara chei nu e gata");
  });
  test("fara configurari sau cu forme stricate, nimeni", () => {
    assert.equal(casaResponsabila(null, "confirmed", "paid"), null);
    assert.equal(casaResponsabila({ smartbill_config: "x", oblio_config: [1] }, "confirmed", "paid"), null);
  });
  test("ordinea e aceeasi cu a regulii „are factura?”", () => {
    assert.deepEqual([...CASE_AUTOMATE], COLOANE_FACTURA_EMISA.map((c) => c.split("_")[0]));
  });
});

describe("aliniat cu fiecare casa", () => {
  /* Conditiile din `casa-automata.ts` sunt chiar cele de la inceputul `maybeAutoGenerateInvoice`
     al fiecarei case. Daca una se schimba acolo, proba cade aici, nu dupa o comanda nefacturata. */
  const corp = (f: string) => {
    const s = viu(f);
    const i = s.indexOf("export async function maybeAutoGenerateInvoice(");
    assert.ok(i > 0, `${f}: lipseste maybeAutoGenerateInvoice`);
    return s.slice(i, i + 3000);
  };
  test("SmartBill: activare, automat, email, token, CUI, serie", () => {
    const c = corp("src/lib/actions/smartbill.actions.ts");
    assert.match(c, /if \(!config\?\.enabled \|\| !config\.auto_invoice\) return false;/);
    assert.match(c, /if \(!config\.email \|\| !config\.token \|\| !config\.company_vat_code \|\| !config\.series_name\) return false;/);
  });
  test("Oblio si fGO: activare si automat", () => {
    for (const f of ["src/lib/actions/oblio.actions.ts", "src/lib/actions/fgo.actions.ts"]) {
      assert.match(corp(f), /if \(!config\?\.enabled \|\| !config\.auto_invoice\) return false;/, f);
    }
  });
  test("casele cu cheie: regula `...Gata` a fiecareia si automatul", () => {
    for (const [f, gata] of [
      ["src/lib/actions/facturis.actions.ts", "facturisGata"],
      ["src/lib/actions/factureaza.actions.ts", "factureazaGata"],
      ["src/lib/actions/easybill.actions.ts", "easybillGata"],
    ] as const) {
      assert.match(corp(f), new RegExp(`if \\(!${gata}\\(config\\) \\|\\| !config\\.auto_invoice\\) return false;`), f);
    }
  });
  test("toate verifica declansatorul cu aceeasi functie", () => {
    for (const casa of CASE_AUTOMATE) {
      assert.match(corp(`src/lib/actions/${casa}.actions.ts`), /autoInvoiceTriggerMatches\(config\.auto_invoice_trigger, newStatus, newPaymentStatus\)/, casa);
    }
  });
});

describe("dispecerul", () => {
  const d = viu("src/lib/actions/invoice-auto.actions.ts");
  test("alege casa INAINTE si o cheama numai pe ea", () => {
    assert.match(d, /const casa = casaResponsabila\(/);
    assert.match(d, /await modul\.maybeAutoGenerateInvoice\(businessId, orderId, newStatus, newPaymentStatus, sistem\);/);
    assert.equal((d.match(/\.maybeAutoGenerateInvoice\(/g) ?? []).length, 1, "o singura chemare, a casei alese");
    for (const casa of CASE_AUTOMATE) assert.ok(d.includes(`${casa}: () => import("@/lib/actions/${casa}.actions")`), casa);
  });
  test("o citire picata a configurarilor nu alege nimic", () => {
    assert.match(d, /if \(eSetari\) return;/);
  });
});
