import { strict as assert } from "node:assert";
import { test, describe, afterEach } from "node:test";
import { readFileSync } from "node:fs";
import { createMerchantInvoice, createMerchantEstimate, type SmartbillConfig } from "@/lib/smartbill";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * ADRESA PUBLICA NU E CEA DE EDITARE, SI GOLUL NU E CEL MAI RAU  (16.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ MASURAT IN PRODUCTIE, nu banuit. SmartBill e casa de facturare cu ADEVARAT folosita:
 * 7 magazine pornite, 240 de facturi emise, 21 de stornouri, ultima chiar azi. Si totusi:
 *
 *   * `smartbill_invoice_url` e NULL la toate cele 240 de facturi;
 *   * din care 184 emise DUPA ce campul a fost cablat (07.07.2026);
 *   * in registru, 181 de emiteri reusite au cheia `url` si valoarea NULL la toate 181.
 *
 * Deci drumul de scriere mergea. `POST /invoice` pur si simplu nu intoarce adresa documentului.
 * Specificatia lor oficiala (OpenAPI 3.1, 16.09.2026) nici nu mai cunoaste `POST /invoice`:
 * are numai `POST /invoice/v2`, cu ACELASI corp de cerere, si un raspuns care declara adresele.
 *
 * ⚠⚠ DAR REPARATIA GRABITA AR FI FOST MAI RAU DECAT DEFECTUL. Raspunsul poarta DOUA adrese cu
 * regimuri OPUSE:
 *
 *   * `documentUrl`, editare in SmartBill Cloud, „cere autentificare";
 *   * `documentViewUrl`, publica, deschide PDF-ul fara autentificare.
 *
 * Coloana hraneste `facturaComenzii`, iar urcarea la eMAG si Trendyol aduce documentul cu
 * `fetch(f.url)` FARA acreditari, si il urca mai departe cu `contentType: "application/pdf"`.
 * Pusa acolo, adresa de editare ar fi urcat pagina de LOGIN la marketplace drept document fiscal.
 *
 * Gol e o lipsa vizibila. Plin cu adresa gresita e o factura falsa care arata ca merge.
 */

const CONFIG: Pick<SmartbillConfig, "email" | "token"> = { email: "a@b.ro", token: "t" };

const PARAMS = {
  companyVatCode: "RO123",
  seriesName: "EDN",
  issueDate: "2026-09-16",
  products: [{ name: "Produs", measuringUnitName: "buc", currency: "RON", quantity: 1, price: 10 }],
};

const fetchAdevarat = globalThis.fetch;
afterEach(() => { globalThis.fetch = fetchAdevarat; });

/** Retine ce cale a fost ceruta si raspunde cu corpul dat. */
function raspundeCu(corp: unknown): { caiCerute: string[] } {
  const caiCerute: string[] = [];
  globalThis.fetch = (async (u: unknown) => {
    caiCerute.push(String(u));
    return new Response(JSON.stringify(corp), { status: 200 });
  }) as typeof fetch;
  return { caiCerute };
}

describe("Emiterea cere calea documentata", () => {
  test("⚠⚠ factura pleaca pe `/invoice/v2`, nu pe `/invoice`", async () => {
    const { caiCerute } = raspundeCu({ number: "1", series: "EDN" });
    await createMerchantInvoice(CONFIG, PARAMS);
    assert.equal(caiCerute.length, 1);
    assert.ok(
      caiCerute[0].endsWith("/invoice/v2"),
      `s-a cerut ${caiCerute[0]}, iar calea aceea nu intoarce nicio adresa de document`,
    );
  });

  test("⚠ si proforma pe `/estimate/v2`", async () => {
    const { caiCerute } = raspundeCu({ number: "2", series: "PRO" });
    await createMerchantEstimate(CONFIG, PARAMS);
    assert.ok(caiCerute[0].endsWith("/estimate/v2"), caiCerute[0]);
  });
});

describe("Se pastreaza adresa PUBLICA, nu cea de editare", () => {
  test("⚠⚠ cu amandoua in raspuns, se ia cea publica", async () => {
    raspundeCu({
      number: "1", series: "EDN",
      documentUrl: "https://cloud.smartbill.ro/editare/1",
      documentViewUrl: "https://cloud.smartbill.ro/vizualizare/1",
    });
    const r = await createMerchantInvoice(CONFIG, PARAMS);
    assert.ok(!("error" in r));
    assert.equal(r.documentViewUrl, "https://cloud.smartbill.ro/vizualizare/1");
    assert.equal(r.documentUrl, "https://cloud.smartbill.ro/editare/1", "cea de editare se citeste, dar separat");
  });

  test("⚠⚠ cu DOAR cea de editare, adresa publica NU se inventeaza din ea", async () => {
    /*
     * Asta e proba care apara banii: o cadere pe `documentUrl` ar fi urcat la eMAG pagina de
     * autentificare in loc de factura, si nimeni n-ar fi vazut pana cand ar fi cerut-o cineva.
     */
    raspundeCu({ number: "1", series: "EDN", documentUrl: "https://cloud.smartbill.ro/editare/1" });
    const r = await createMerchantInvoice(CONFIG, PARAMS);
    assert.ok(!("error" in r));
    assert.equal(r.documentViewUrl, undefined, "adresa de editare a fost data drept publica");
  });

  test("⚠ si documentul se intoarce oricum: lipsa adresei NU e o eroare", async () => {
    /* Intoarsa ca eroare, o factura REALA ar fi aruncata, iar reincercarea ar emite a doua. */
    raspundeCu({ number: "7", series: "EDN" });
    const r = await createMerchantInvoice(CONFIG, PARAMS);
    assert.deepEqual(r, { number: "7", series: "EDN" });
  });
});

// ─── Si ce se scrie pe comanda ───────────────────────────────────────────────

const viu = (cale: string) =>
  readFileSync(cale, "utf8").replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

describe("Pe comanda ajunge doar adresa publica", () => {
  const actiuni = viu("src/lib/actions/smartbill.actions.ts");

  test("⚠⚠ toate scrierile trec prin `adresaPublica`, niciuna nu mai citeste `documentUrl`", () => {
    /*
     * ⚠ Cinci scrieri, nu patru, si a cincea e o GOLIRE deliberata: la adoptarea unei facturi
     * facute din SmartBill Cloud, `getEstimateInvoices` nu intoarce nicio adresa, iar cea veche ar
     * fi a facturii DESFIINTATE prin storno. `null` e valoarea onesta acolo.
     *
     * Proba le numara pe amandoua tocmai ca sa nu treaca drept „adresaPublica" o scriere care de
     * fapt ocoleste poarta: cand numarul se schimba, cineva trebuie sa se uite de ce.
     */
    const scrieri = actiuni.match(/smartbill_(?:invoice|estimate)_url: [^,\n]+/g) ?? [];
    const prinPoarta = scrieri.filter((l) => l.includes("adresaPublica(result)"));
    const golite = scrieri.filter((l) => l.trim().endsWith(": null"));
    assert.equal(prinPoarta.length, 4, `scrieri prin poarta: ${prinPoarta.length} din ${scrieri.join(" | ")}`);
    assert.equal(golite.length, 1, "golirea de dupa storno a disparut sau s-a inmultit");
    assert.equal(prinPoarta.length + golite.length, scrieri.length,
      `scriere care nu e nici poarta, nici golire: ${scrieri.join(" | ")}`);
  });

  test("⚠⚠ iar `adresaPublica` NU cade pe adresa de editare", () => {
    const corp = /function adresaPublica\([\s\S]*?\n\}/.exec(actiuni)?.[0] ?? "";
    assert.ok(corp, "functia a disparut");
    assert.match(corp, /d\.documentViewUrl \?\? null/);
    assert.ok(!/documentUrl/.test(corp), "s-a strecurat o cadere pe adresa de editare");
  });

  test("⚠ si in registru intra tot cea publica", () => {
    /* Registrul e sursa de rehidratare cand scrierea locala s-a pierdut, deci ce intra acolo
       ajunge pe comanda si mai departe la marketplace. */
    const puse = actiuni.match(/detalii: \{ serie: rezultat\.series, url: [^}]+\}/g) ?? [];
    assert.equal(puse.length, 2, "cele doua drumuri (factura si proforma) nu mai pun amandoua");
    for (const p of puse) assert.match(p, /rezultat\.documentViewUrl \?\? null/, p);
  });

  test("⚠ lipsa adresei se SPUNE, nu se ingroapa", () => {
    /* Altfel coloana ar ramane goala la fel ca pana acum, doar ca de data asta fara sa afle
       nimeni de ce. Prima factura emisa dupa trecere trebuie sa raspunda singura. */
    assert.match(actiuni, /spuneDacaLipsesteAdresa\(businessId, orderId, "factura", rezultat\)/);
    assert.match(actiuni, /spuneDacaLipsesteAdresa\(businessId, orderId, "proforma", rezultat\)/);
    assert.match(actiuni, /if \(d\.documentViewUrl\) return;/, "avertismentul se da si cand adresa exista");
    assert.match(actiuni, /severity: "warning"/, "lipsa adresei nu e o cadere, e o masuratoare");
  });

  test("⚠⚠ panoul nu mai traduce adresa prin potrivire de text", () => {
    /* `raw.replace("editare", "vizualizare")` ghicea formatul unei adrese nedocumentate. */
    const panou = viu("src/components/dashboard/OrderDetailClient.tsx");
    assert.ok(!/replace\("editare", ?"vizualizare"\)/.test(panou), "hack-ul de text a ramas");
    assert.match(panou, /const sbViewLink = \(raw: unknown\) => \(typeof raw === "string" && raw \? raw : null\);/);
  });
});
