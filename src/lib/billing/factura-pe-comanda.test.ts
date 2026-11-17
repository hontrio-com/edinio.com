import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";
import { faraComentarii } from "@/lib/edinio-marketing/fara-comentarii";
import { areFacturaEmisa, COLOANE_FACTURA_EMISA, etichetaFacturiiEmise } from "./factura-pe-comanda";

/*
 * „Are comanda o factura emisa?" — regula unica, si locurile care o intreaba.
 *
 * ⚠ Un loc uitat la o casa noua inseamna fie o A DOUA factura fiscala (dispecerul ar emite la alta
 * casa), fie marfa schimbata pe o comanda deja facturata. Proba de jos cade la prima uitare.
 */

describe("regula", () => {
  test("o factura la ORICARE casa conteaza; la casele cu cheie, cheia singura ajunge", () => {
    assert.equal(areFacturaEmisa({}), false);
    assert.equal(areFacturaEmisa(null), false);
    for (const c of COLOANE_FACTURA_EMISA) {
      assert.equal(areFacturaEmisa({ [c]: "123" }), true, c);
    }
    assert.equal(areFacturaEmisa({ smartbill_invoice_number: "  " }), false, "un sir gol nu e factura");
  });
  test("⚠ documentul din sandbox-ul Factureaza.ro (cheia `test:`) NU e factura fiscala", () => {
    assert.equal(areFacturaEmisa({ factureaza_invoice_key: "test:991" }), false);
    assert.equal(etichetaFacturiiEmise({ factureaza_invoice_key: "test:991", factureaza_invoice_number: "7" }), null);
    /* Langa o factura reala la alta casa, cea reala decide. */
    assert.equal(areFacturaEmisa({ factureaza_invoice_key: "test:991", easybill_invoice_key: "55" }), true);
    assert.equal(etichetaFacturiiEmise({ factureaza_invoice_key: "test:991", easybill_invoice_key: "55", easybill_invoice_number: "12" }), "12");
    /* Cheia de test e doar la Factureaza.ro: la celelalte case nu exista un asemenea prefix. */
    assert.equal(areFacturaEmisa({ easybill_invoice_key: "test:1" }), true);
  });
  test("eticheta: numarul, sau numele casei cat timp numarul nu s-a citit", () => {
    assert.equal(etichetaFacturiiEmise({ oblio_invoice_number: "0012" }), "0012");
    assert.equal(etichetaFacturiiEmise({ facturis_invoice_key: "9", facturis_invoice_series: "EDN", facturis_invoice_number: "141" }), "EDN 141");
    assert.equal(etichetaFacturiiEmise({ factureaza_invoice_key: "9" }), "Factureaza.ro");
    assert.equal(etichetaFacturiiEmise({ easybill_invoice_key: "9", easybill_invoice_number: "7" }), "7");
    assert.equal(etichetaFacturiiEmise({}), null);
  });
  test("cele sase case, in ordinea dispecerului", () => {
    assert.deepEqual([...COLOANE_FACTURA_EMISA], [
      "smartbill_invoice_number", "oblio_invoice_number", "fgo_invoice_number",
      "facturis_invoice_key", "factureaza_invoice_key", "easybill_invoice_key",
    ]);
  });
});

describe("locurile care intreaba", () => {
  const viu = (f: string) => faraComentarii(readFileSync(f, "utf8"));
  /* Fiecare loc cheama regula si cere in select TOATE coloanele ei (selectul ramane scris de mana,
     ca sa tina tipurile; o coloana lipsa din select ar face regula sa raspunda „nu" pe o comanda
     facturata). */
  const CU_SELECT = [
    "src/lib/actions/invoice-auto.actions.ts",
    "src/lib/actions/bulk-orders.actions.ts",
    "src/lib/actions/easysales.actions.ts",
    "src/lib/aboutyou/orders.ts",
  ];
  test("cheama regula unica, nu un sir de `||` scris de mana", () => {
    for (const f of [...CU_SELECT, "src/components/dashboard/OrderEditModal.tsx"]) {
      assert.match(viu(f), /areFacturaEmisa\(/, f);
      assert.ok(!/oblio_invoice_number \|\| /.test(viu(f)), `${f} are iar un sir de || scris de mana`);
    }
    assert.match(viu("src/lib/actions/order.actions.ts"), /etichetaFacturiiEmise\(order\)/);
  });
  test("⚠ si cere in select fiecare coloana a regulii", () => {
    /*
     * In SIRUL selectului, nu oriunde in fisier: in `aboutyou/orders.ts` coloanele apar si intr-un
     * tip, deci o coloana scoasa din `.select(...)` ar fi lasat proba verde, iar regula ar fi
     * raspuns „nu” pe o comanda facturata. Se iau sirurile literale care enumera coloanele de
     * factura (cele cu `smartbill_invoice_number`), si fiecare trebuie sa le aiba pe toate.
     */
    for (const f of [...CU_SELECT, "src/lib/actions/order.actions.ts"]) {
      const s = viu(f);
      const siruri = [
        /* argumentul literal al fiecarui `.select(...)` */
        ...[...s.matchAll(/\.select\(\s*(["`])([\s\S]*?)\1/g)].map((m) => m[2]),
        /* si listele tinute intr-o constanta (`COLOANE_DESCHISE` la easySales) */
        ...[...s.matchAll(/const COLOANE_\w+ = `([\s\S]*?)`/g)].map((m) => m[1]),
      ].filter((sir) => sir.includes("smartbill_invoice_number"));
      assert.ok(siruri.length > 0, `${f}: n-am gasit selectul cu coloanele de factura`);
      for (const sir of siruri) {
        for (const c of COLOANE_FACTURA_EMISA) assert.ok(sir.includes(c), `${f}: lipseste ${c} dintr-un select`);
      }
    }
  });
});
