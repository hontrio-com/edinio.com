import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { aducePdf, numeleFisierului, MARIME_MAXIMA } from "./pdf-document";
import { GAZDE_DE_TEST } from "@/lib/billing/factura-comenzii";

/*
 * DOCUMENTUL FISCAL AJUNGE LA CUMPARATOR NUMAI CA PDF ADEVARAT, SI NICIODATA DE
 * LA O GAZDA DE TEST.
 *
 * ⚠ SE PROBEAZA CU `fetch` INLOCUIT, nu cu furnizorii: calea fericita nu se poate
 * vedea pe demo (tokenul SmartBill al Casei Lumen e fals, iar linkurile semanate
 * nu duc la documente reale). Fiecare proba numara si CERERILE, fiindca defectul
 * vechi era tocmai o cerere care pleca inainte de garda.
 */

const originalFetch = globalThis.fetch;
let cereri: string[] = [];

function inlocuiesteFetch(raspunde: (adresa: string) => Response | Promise<Response>) {
  cereri = [];
  globalThis.fetch = (async (intrare: RequestInfo | URL) => {
    const adresa = typeof intrare === "string" ? intrare : intrare instanceof URL ? intrare.toString() : intrare.url;
    cereri.push(adresa);
    return raspunde(adresa);
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const PDF = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n");
const LOGIN = new TextEncoder().encode("<!doctype html><title>Autentificare</title>");

test("⚠⚠ documentul de TEST se opreste INAINTE de orice cerere", async () => {
  inlocuiesteFetch(() => new Response(PDF));
  const r = await aducePdf({ fel: "link", adresa: "https://testuat.fgo.ro/n/p/abc?ap=true" });
  assert.deepEqual(r, { ok: false, motiv: "document_de_test" });
  assert.equal(cereri.length, 0, "cererea catre gazda de test a plecat oricum");
});

test("⚠⚠ o pagina de login care raspunde 200 NU trece drept factura", async () => {
  inlocuiesteFetch(() => new Response(LOGIN, { status: 200 }));
  const r = await aducePdf({ fel: "link", adresa: "https://www.oblio.eu/utils/show_file/?it=x" });
  assert.deepEqual(r, { ok: false, motiv: "nu_e_pdf" });
});

test("un PDF adevarat trece, cu octetii lui", async () => {
  inlocuiesteFetch(() => new Response(PDF));
  const r = await aducePdf({ fel: "link", adresa: "https://www.oblio.eu/utils/show_file/?it=x" });
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.octeti.byteLength, PDF.byteLength);
});

test("⚠ peste plafonul Vercel se refuza, si dupa antet, si dupa corp", async () => {
  inlocuiesteFetch(() => new Response(PDF, { headers: { "content-length": String(MARIME_MAXIMA + 1) } }));
  assert.deepEqual(await aducePdf({ fel: "link", adresa: "https://x.ro/f.pdf" }), { ok: false, motiv: "prea_mare" });

  const mare = new Uint8Array(MARIME_MAXIMA + 10);
  mare.set(PDF, 0);
  inlocuiesteFetch(() => new Response(mare));
  assert.deepEqual(await aducePdf({ fel: "link", adresa: "https://x.ro/f.pdf" }), { ok: false, motiv: "prea_mare" });
});

test("⚠ furnizorul care nu raspunde sau raspunde cu eroare: „indisponibil”, nu „nu exista”", async () => {
  inlocuiesteFetch(() => { throw new Error("timeout"); });
  assert.deepEqual(await aducePdf({ fel: "link", adresa: "https://x.ro/f.pdf" }), { ok: false, motiv: "furnizor_indisponibil" });

  inlocuiesteFetch(() => new Response("eroare", { status: 500 }));
  assert.deepEqual(await aducePdf({ fel: "link", adresa: "https://x.ro/f.pdf" }), { ok: false, motiv: "furnizor_indisponibil" });
});

test("SmartBill: fara acreditari nu pleaca nicio cerere, iar un 401 e „indisponibil”", async () => {
  inlocuiesteFetch(() => new Response(PDF));
  const fara = await aducePdf({ fel: "smartbill", email: "", token: "", cif: "RO1", serie: "A", numar: "1" });
  assert.deepEqual(fara, { ok: false, motiv: "casa_neconectata" });
  assert.equal(cereri.length, 0);

  inlocuiesteFetch(() => new Response("neautorizat", { status: 401 }));
  const refuz = await aducePdf({ fel: "smartbill", email: "a@b.ro", token: "t", cif: "RO1", serie: "A", numar: "1" });
  assert.deepEqual(refuz, { ok: false, motiv: "furnizor_indisponibil" });
  assert.equal(cereri.length, 1);
  assert.match(cereri[0], /\/invoice\/pdf\?cif=RO1&seriesname=A&number=1$/);
});

test("SmartBill: PDF-ul bun trece, iar unul fals se refuza", async () => {
  inlocuiesteFetch(() => new Response(PDF));
  const bun = await aducePdf({ fel: "smartbill", email: "a@b.ro", token: "t", cif: "RO1", serie: "A", numar: "1" });
  assert.equal(bun.ok, true);
  inlocuiesteFetch(() => new Response(LOGIN));
  const fals = await aducePdf({ fel: "smartbill", email: "a@b.ro", token: "t", cif: "RO1", serie: "A", numar: "1" });
  assert.deepEqual(fals, { ok: false, motiv: "nu_e_pdf" });
});

test("fara adresa sau fara numar nu se cere nimic", async () => {
  inlocuiesteFetch(() => new Response(PDF));
  assert.deepEqual(await aducePdf({ fel: "link", adresa: "  " }), { ok: false, motiv: "fara_document" });
  assert.deepEqual(
    await aducePdf({ fel: "smartbill", email: "a@b.ro", token: "t", cif: "RO1", serie: "", numar: "" }),
    { ok: false, motiv: "fara_document" },
  );
  assert.equal(cereri.length, 0);
});

test("numele fisierului e curatat inainte sa intre intr-un antet", () => {
  assert.equal(numeleFisierului("factura", "CLM", "0248"), "Factura_CLM0248.pdf");
  assert.equal(numeleFisierului("storno", "CLM", "0225"), "Stornare_CLM0225.pdf");
  assert.equal(numeleFisierului("factura", "A\"; x", "1\r\n"), "Factura_A___x1__.pdf");
});

/* ═══ Doua copii ale aceleiasi liste ═══ */

test("⚠⚠ lista gazdelor de test din SQL e aceeasi cu cea din TypeScript", () => {
  /*
    `privat.cont_e_document_de_test` hotaraste in BAZA ce document nu apare in
    cont; `eDocumentDeTest` hotaraste pe SERVER ce nu se aduce. Doua liste care se
    despart ar arata un document pe care ruta il refuza, sau invers.
  */
  const sql = readFileSync("migrations/2026-09-23-conturi-clienti-comanda-completa.sql", "utf8");
  const m = /create or replace function privat\.cont_e_document_de_test[\s\S]*?unnest\(array\[([^\]]*)\]\)/.exec(sql);
  assert.ok(m, "nu am gasit lista in migratie");
  const dinSql = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
  assert.deepEqual(dinSql, [...GAZDE_DE_TEST].sort());
});

/* ═══ Ordinea din ruta ═══ */

test("⚠⚠ ruta dovedeste proprietatea INAINTE sa citeasca randul comenzii", () => {
  const s = readFileSync("src/lib/cont/ruta-document.ts", "utf8");
  const iProprietate = s.indexOf("await comandaMea(");
  const iRand = s.indexOf('.from("orders")');
  assert.ok(iProprietate > 0 && iRand > 0, "nu am gasit ce masor");
  assert.ok(iProprietate < iRand, "randul comenzii se citeste inainte de dovada proprietatii");
});

test("⚠ si garda de test sta INAINTEA cererii, in sursa", () => {
  const s = readFileSync("src/lib/cont/pdf-document.ts", "utf8");
  const corp = s.slice(s.indexOf("export async function aducePdf"));
  assert.ok(corp.indexOf("eDocumentDeTest(adresa)") < corp.indexOf("await fetch("), "garda de test vine dupa cerere");
});
