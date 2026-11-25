import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COLOANE_FACTURA_EMISA } from "@/lib/billing/factura-pe-comanda";
import { COLOANA_AWB } from "@/lib/orders/awb-propriu";
import { siglaCurierului } from "@/lib/integrari/parteneri";
import {
  coloaneleComenzii, comandaDinRand, cuCeilaltiCurieri, cuContul, documentulComenzii, FARA_INTEGRARI, legaturaDocumentului, plataComenzii,
  STARI_COMANDA, surseleFiltrului, type Integrari,
} from "./date";

/*
  Comanda asa cum o deseneaza listele panoului: un rand din `orders` adus la o forma simpla.

  Ce pazesc probele: lista spune dintr-o privire lucruri pe care omul le ia de bune („are
  factura", „se poate emite AWB", „e platita"). Fiecare dintre ele are o regula scrisa altundeva
  in proiect; aici se verifica faptul ca lista o foloseste pe aceea, nu una a ei.
*/

const sigla = (cheie: string) => {
  const s = siglaCurierului(cheie);
  if (!s) throw new Error(`curier necunoscut in proba: ${cheie}`);
  return s;
};
const CU_DOI_CURIERI: Integrari = {
  curieri: [sigla("fancourier"), sigla("sameday")],
  case_: [{ cheie: "smartbill", nume: "SmartBill", logo: "/integrations/mici/smartbill.webp" }],
};

const RAND = {
  id: "o1", order_number: "#1331", created_at: "2026-11-20T10:00:00Z", status: "confirmed", total: "163.98", shipping_cost: 19.99,
  customer_name: " Ana Pop ", customer_phone: "0722000111", customer_email: "ana@exemplu.ro", billing_company: { company_name: "Casa Lumen SRL" },
  shipping_address: { courier: "fan-courier", city: "Cluj-Napoca", county: "Cluj" },
  items: [{ product_id: "p1", name: "Veioză ceramică", quantity: 2, price: 72 }, { product_id: "extra_ambalaj", name: "Ambalaj cadou", quantity: 1, price: 0 }],
  order_source: null, payment_method: "cash_on_delivery", payment_status: "pending",
};

/* ── Forma comenzii ───────────────────────────────────────────────────────── */

test("un rand din `orders` ajunge comanda de lista: client, produse, bani, stare cu diacritice", () => {
  const c = comandaDinRand(RAND, CU_DOI_CURIERI, { p1: "/poza.webp" });
  assert.equal(c.numar, "#1331");
  assert.deepEqual(c.client, { nume: "Ana Pop", firma: "Casa Lumen SRL", telefon: "0722000111", email: "ana@exemplu.ro" });
  assert.deepEqual(c.produse.map((p) => [p.nume, p.cantitate, p.poza]), [["Veioză ceramică", 2, "/poza.webp"], ["Ambalaj cadou", 1, null]]);
  assert.equal(c.bucati, 3);
  assert.equal(c.total, 163.98);
  assert.equal(c.transport, 19.99);
  assert.equal(c.moneda, "lei");
  /* Numele starii e cel cu diacritice, acordat cu „comanda": acelasi ca in pagina comenzii. */
  assert.deepEqual(c.status, { cheie: "confirmed", eticheta: "Confirmată", ton: "info" });
  assert.deepEqual(c.plata, { eticheta: "Ramburs", stare: "neplatita", laLivrare: true });
});

test("curierul e cel ales de client, daca e conectat; altfel singurul conectat; altfel niciunul", () => {
  const ales = comandaDinRand(RAND, CU_DOI_CURIERI, {});
  assert.equal(ales.livrare.curier?.cheie, "fancourier");
  assert.equal(ales.livrare.alesDeClient, true);
  assert.equal(ales.livrare.fel, "adresa");
  assert.equal(ales.livrare.detaliu, "Cluj-Napoca, Cluj");

  /* Clientul a ales un curier pe care magazinul nu-l mai are conectat: se alege dintre cei conectati. */
  const altul = comandaDinRand({ ...RAND, shipping_address: { courier: "gls", city: "Iași" } }, CU_DOI_CURIERI, {});
  assert.equal(altul.livrare.curier, null);
  assert.equal(altul.livrare.alesDeClient, false);

  /* Un singur curier conectat: e al lui, fara sa fie „ales de client". */
  const singur = comandaDinRand({ ...RAND, shipping_address: { city: "Iași" } }, { ...CU_DOI_CURIERI, curieri: [sigla("sameday")] }, {});
  assert.equal(singur.livrare.curier?.cheie, "sameday");
  assert.equal(singur.livrare.alesDeClient, false);
});

test("felul livrarii: punct, ridicare, livrare proprie, fara adresa", () => {
  const cu = (shipping_address: Record<string, unknown>) => comandaDinRand({ ...RAND, shipping_address }, CU_DOI_CURIERI, {}).livrare;
  assert.deepEqual([cu({ delivery_type: "locker", locker_name: "easybox Mall", city: "Brașov" }).fel, cu({ delivery_type: "locker", locker_name: "easybox Mall" }).detaliu], ["punct", "easybox Mall"]);
  assert.equal(cu({ courier: "pickup", city: "Brașov" }).fel, "ridicare");
  assert.equal(cu({ courier: "own", city: "Brașov" }).fel, "proprie");
  assert.equal(cu({}).fel, "necunoscut");
});

test("AWB-ul emis se arata cu sigla curierului lui si cu ultima stare citita, iar refuzul dispare", () => {
  const coloanaFan = COLOANA_AWB.fancourier;
  const c = comandaDinRand({ ...RAND, [coloanaFan]: "2150012345678" }, CU_DOI_CURIERI, {});
  assert.equal(c.livrare.awb?.numar, "2150012345678");
  assert.equal(c.livrare.awb?.curier.cheie, "fancourier");
  assert.equal(c.livrare.refuz, null);
  const sameday = comandaDinRand({ ...RAND, [COLOANA_AWB.sameday]: "1ONB123", sameday_status_label: "În livrare" }, CU_DOI_CURIERI, {});
  assert.deepEqual(sameday.livrare.awb, { curier: sigla("sameday"), numar: "1ONB123", stare: "În livrare", inCurs: false, partener: null });
});

test("⚠ refuzul unui AWB e cel al portii comune, nu unul scris aici", () => {
  /* O comanda anulata nu mai are ce cauta la curier: aceeasi propozitie ca in pagina comenzii. */
  const anulata = comandaDinRand({ ...RAND, status: "cancelled" }, CU_DOI_CURIERI, {});
  assert.ok(anulata.livrare.refuz && anulata.livrare.refuz.length > 10);
  assert.equal(comandaDinRand(RAND, CU_DOI_CURIERI, {}).livrare.refuz, null);
  const sursa = readFileSync("src/components/dashboard/comenzi/date.ts", "utf8");
  assert.ok(sursa.includes("refuz: awb ? null : deCeNuSePoateAwbPropriu({"));
});

test("ceilalti curieri se pun in browser, fara cel al comenzii", () => {
  const c = comandaDinRand(RAND, CU_DOI_CURIERI, {});
  /* De pe server pleaca goala: aceeasi lista scrisa la fiecare comanda ar ingreuna pagina. */
  assert.deepEqual(c.livrare.altii, []);
  assert.deepEqual(cuCeilaltiCurieri(c, CU_DOI_CURIERI).livrare.altii.map((x) => x.cheie), ["sameday"]);
  /* La fel casele de facturare: cea a comenzii nu se repeta in meniul „altă casă". */
  const douaCase: Integrari = { ...CU_DOI_CURIERI, case_: [...CU_DOI_CURIERI.case_, { cheie: "oblio", nume: "Oblio", logo: "/integrations/mici/oblio.webp", inversat: true }] };
  const cuDoua = cuCeilaltiCurieri(comandaDinRand(RAND, douaCase, {}), douaCase);
  assert.equal(cuDoua.factura.casa?.cheie, "smartbill");
  assert.deepEqual(cuDoua.factura.alteCase.map((x) => x.cheie), ["oblio"]);
});

test("fara integrari, comanda se citeste doar pentru bani si document", () => {
  const c = comandaDinRand(RAND, FARA_INTEGRARI, {});
  assert.equal(c.livrare.curier, null);
  assert.equal(c.factura.casa, null);
  assert.equal(c.factura.document, null);
});

/* ── Plata ────────────────────────────────────────────────────────────────── */

test("plata, pe scurt: ramburs, card, rate, transfer, marketplace", () => {
  const p = (payment_method: string, payment_status = "pending") => plataComenzii({ payment_method, payment_status });
  assert.deepEqual(p("cash_on_delivery"), { eticheta: "Ramburs", stare: "neplatita", laLivrare: true });
  assert.deepEqual(p("netopia", "paid"), { eticheta: "Card", stare: "platita", laLivrare: false });
  assert.equal(p("stripe").eticheta, "Card");
  assert.equal(p("tbi").eticheta, "Rate tbi");
  assert.equal(p("klarna").eticheta, "Klarna");
  assert.equal(p("bank_transfer").eticheta, "Transfer bancar");
  assert.equal(p("emag").eticheta, "Prin eMAG");
  assert.equal(p("netopia", "refunded").stare, "rambursata");
  /* O metoda care seamana cu o proprietate mostenita nu e marketplace. */
  assert.equal(p("constructor").eticheta, "Card");
});

/* ── Documentul ───────────────────────────────────────────────────────────── */

test("documentul: stornarea bate factura, factura bate proforma", () => {
  assert.equal(documentulComenzii({}), null);
  assert.deepEqual(documentulComenzii({ smartbill_estimate_series: "PF", smartbill_estimate_number: "7" }), { fel: "proforma", casa: "smartbill", numar: "PF 7" });
  assert.deepEqual(documentulComenzii({ oblio_proforma_number: "12" }), { fel: "proforma", casa: "oblio", numar: "12" });
  assert.deepEqual(
    documentulComenzii({ smartbill_estimate_number: "7", oblio_invoice_series: "OB", oblio_invoice_number: "0100" }),
    { fel: "factura", casa: "oblio", numar: "OB 0100" },
  );
  assert.deepEqual(
    documentulComenzii({ fgo_invoice_series: "FG", fgo_invoice_number: "55", fgo_storno_series: "FG", fgo_storno_number: "56" }),
    { fel: "storno", casa: "fgo", numar: "FG 56" },
  );
});

test("⚠ la casele cu cheie, o factura cu cheie si fara numar EXISTA", () => {
  /* Facturis, Factureaza.ro si easybill intorc la emitere doar cheia; numarul se citeste dupa. */
  for (const casa of ["facturis", "factureaza", "easybill"] as const) {
    assert.deepEqual(documentulComenzii({ [`${casa}_invoice_key`]: "abc-123" }), { fel: "factura", casa, numar: "" }, casa);
    assert.deepEqual(
      documentulComenzii({ [`${casa}_invoice_key`]: "abc-123", [`${casa}_invoice_series`]: "S", [`${casa}_invoice_number`]: "9" }),
      { fel: "factura", casa, numar: "S 9" },
      casa,
    );
    assert.equal(documentulComenzii({ [`${casa}_invoice_key`]: "abc", [`${casa}_storno_key`]: "def" })?.fel, "storno", casa);
  }
});

test("⚠ documentul din sandbox-ul Factureaza.ro nu e factura", () => {
  /* Cheia `test:<id>` nu e fiscala: aceeasi regula ca la dispecer, la lot si la editarea comenzii. */
  assert.equal(documentulComenzii({ factureaza_invoice_key: "test:4411" }), null);
  const sursa = readFileSync("src/components/dashboard/comenzi/date.ts", "utf8");
  assert.ok(sursa.includes("if (!areFacturaEmisa({ [coloana]: r[coloana] })) continue;"));
});

/* ── Coloanele cerute bazei ───────────────────────────────────────────────── */

const TIPURI = readFileSync("src/types/database.types.ts", "utf8");
const coloaneleTabelului = (tabel: string): Set<string> => {
  const inceput = TIPURI.indexOf(`      ${tabel}: {\n        Row: {`);
  assert.ok(inceput > 0, `tabelul ${tabel} nu e in tipuri`);
  const corp = TIPURI.slice(inceput, TIPURI.indexOf("\n        }", inceput));
  return new Set([...corp.matchAll(/^\s{10}([a-z_0-9]+)\??:/gm)].map((m) => m[1]));
};

test("⚠ fiecare coloana ceruta exista in `orders`: una lipsa face PostgREST sa refuze toata cererea", () => {
  const existente = coloaneleTabelului("orders");
  const cerute = coloaneleComenzii();
  assert.deepEqual(cerute.filter((c) => !existente.has(c)), []);
  /* Fara repetari, si cu tot ce citeste modelul: AWB-urile, cheile de factura, stornarile cu cheie. */
  assert.equal(new Set(cerute).size, cerute.length);
  for (const c of [...Object.values(COLOANA_AWB), ...COLOANE_FACTURA_EMISA, "facturis_storno_key", "easybill_storno_key", "items", "order_source"]) {
    assert.ok(cerute.includes(c), c);
  }
  /* Lista e de vreo trei ori mai scurta decat tabelul: de aceea exista. */
  assert.ok(cerute.length < existente.size / 2, `${cerute.length} din ${existente.size}`);
});

/* ── Ce a adus intrarea asezarilor noi in pagina adevarata (25.11.2026) ───── */

test("⚠ la eColet, expedierea pornita fara numar e „in curs”, nu un AWB cu id-ul intern drept numar", () => {
  /* `awburiDinRand` intoarce si MARTORUL (`ecolet_order_to_send_id`): el spune ca exista un colet, nu care e numarul lui. */
  const inCurs = comandaDinRand({ ...RAND, ecolet_order_to_send_id: 99123 }, CU_DOI_CURIERI, {}).livrare.awb;
  assert.equal(inCurs?.curier.cheie, "ecolet");
  assert.equal(inCurs?.inCurs, true);
  assert.equal(inCurs?.numar, "");
  /* Cand vine numarul, el e cel aratat, iar coletul nu mai e „in curs". */
  const emis = comandaDinRand({ ...RAND, ecolet_order_to_send_id: 99123, ecolet_awb_number: "EC0012345" }, CU_DOI_CURIERI, {}).livrare.awb;
  assert.equal(emis?.inCurs, false);
  assert.equal(emis?.numar, "EC0012345");
});

test("la brokeri se spune cine duce de fapt coletul", () => {
  const curiera = comandaDinRand({ ...RAND, curiera_awb_number: "CUR123", curiera_partener: "DPD", curiera_partener_awb: "80512345" }, CU_DOI_CURIERI, {});
  assert.equal(curiera.livrare.awb?.partener, "DPD 80512345");
  /* Fara numarul partenerului nu e nimic de spus. */
  assert.equal(comandaDinRand({ ...RAND, curiera_awb_number: "CUR123", curiera_partener: "DPD" }, CU_DOI_CURIERI, {}).livrare.awb?.partener, null);
  const epacket = comandaDinRand({ ...RAND, epacket_awb_number: "EP1", epacket_curier: "SDY", epacket_test: true }, CU_DOI_CURIERI, {});
  assert.equal(epacket.livrare.awb?.partener, "Sameday, test");
  assert.equal(comandaDinRand({ ...RAND, epacket_awb_number: "EP1", epacket_curier: "XYZ" }, CU_DOI_CURIERI, {}).livrare.awb?.partener, "XYZ");
});

test("⚠ moneda necitita ramane „?”, cu semnul ei: nu se preface in lei", () => {
  const c = comandaDinRand({ ...RAND, order_source: { marketplace: "aboutyou", moneda_necitita: true, currency: "RON" } }, CU_DOI_CURIERI, {});
  assert.equal(c.moneda, "?");
  assert.equal(c.monedaNecitita, true);
  const euro = comandaDinRand({ ...RAND, order_source: { marketplace: "aboutyou", currency: "eur" } }, CU_DOI_CURIERI, {});
  assert.deepEqual([euro.moneda, euro.monedaNecitita], ["EUR", false]);
  assert.deepEqual([comandaDinRand(RAND, CU_DOI_CURIERI, {}).moneda, comandaDinRand(RAND, CU_DOI_CURIERI, {}).monedaNecitita], ["lei", false]);
});

test("sursa spune daca marketplace-ul isi tine singur fluxul si daca o proceseaza easySales", () => {
  const sursa = (order_source: unknown) => comandaDinRand({ ...RAND, order_source }, CU_DOI_CURIERI, {}).sursa;
  assert.equal(sursa({ marketplace: "emag" }).cuFluxPropriu, true);
  assert.equal(sursa({ marketplace: "trendyol" }).cuFluxPropriu, true);
  /* La Pepita si About You comanda se administreaza de aici: AWB-ul si factura se fac din Edinio. */
  assert.equal(sursa({ marketplace: "pepita" }).cuFluxPropriu, false);
  assert.equal(sursa({ marketplace: "aboutyou" }).cuFluxPropriu, false);
  assert.equal(sursa(null).cuFluxPropriu, false);
  assert.equal(sursa({ easysales: { stapan: "easysales" } }).easySales, true);
  assert.equal(sursa({ easysales: { stapan: "edinio" } }).easySales, false);
});

test("contul din care s-a plasat comanda: numele titularului, cu e-mailul ca rezerva si in indiciu", () => {
  const c = comandaDinRand(RAND, CU_DOI_CURIERI, {});
  assert.equal(c.cont, null);
  assert.equal(cuContul(c, undefined), c);
  assert.deepEqual(cuContul(c, { contId: "k1", nume: "Maria Pop", email: "maria@exemplu.ro" }).cont, { id: "k1", nume: "Maria Pop", indiciu: "maria@exemplu.ro · ID cont: k1" });
  assert.equal(cuContul(c, { contId: "k2", nume: "  ", email: "fara-nume@exemplu.ro" }).cont?.nume, "fara-nume@exemplu.ro");
  assert.deepEqual(cuContul(c, { contId: "k3", nume: null, email: null }).cont, { id: "k3", nume: "Cont client", indiciu: "ID cont: k3" });
});

test("sursele din filtru: doar cele care au comenzi, iar „Magazinul tău” doar langa un marketplace", () => {
  assert.deepEqual(surseleFiltrului({ store: 40 }), []);
  assert.deepEqual(surseleFiltrului({ store: 40, emag: 0, trendyol: 0 }), []);
  const surse = surseleFiltrului({ store: 40, emag: 7, trendyol: 0, pepita: 2 });
  assert.deepEqual(surse.map((x) => [x.cheie, x.numar]), [["store", 40], ["emag", 7], ["pepita", 2]]);
  assert.equal(surse[0].logo, null);
  assert.equal(surse[1].logo, "/integrations/mici/emag.webp");
});

test("cele sapte stari din meniu sunt cele ale platformei, cu numele acordat cu „comanda”", () => {
  assert.deepEqual(STARI_COMANDA.map((x) => x.cheie), ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled", "refunded"]);
  assert.deepEqual(STARI_COMANDA.map((x) => x.eticheta), ["În așteptare", "Confirmată", "În procesare", "Expediată", "Livrată", "Anulată", "Rambursată"]);
});

test("⚠ documentul se deschide de unde il da casa: adresa ei, PDF-ul prin ruta noastra, sau deloc", () => {
  const leg = (r: Record<string, unknown>) => { const d = documentulComenzii(r); return d ? legaturaDocumentului(r, d) : "fara document"; };
  assert.deepEqual(leg({ oblio_invoice_number: "1", oblio_invoice_link: "https://www.oblio.eu/docs/1" }), { fel: "adresa", adresa: "https://www.oblio.eu/docs/1" });
  assert.deepEqual(leg({ oblio_storno_number: "2", oblio_storno_link: "https://www.oblio.eu/docs/2", oblio_invoice_number: "1" }), { fel: "adresa", adresa: "https://www.oblio.eu/docs/2" });
  assert.deepEqual(leg({ smartbill_estimate_number: "7", smartbill_estimate_url: "https://ws.smartbill.ro/p/7" }), { fel: "adresa", adresa: "https://ws.smartbill.ro/p/7" });
  assert.deepEqual(leg({ fgo_invoice_number: "9", fgo_invoice_link: "https://www.fgo.ro/f/9" }), { fel: "adresa", adresa: "https://www.fgo.ro/f/9" });
  /* Casele cu cheie dau PDF-ul numai pe API. */
  assert.deepEqual(leg({ facturis_invoice_key: "abc" }), { fel: "pdf", ruta: "/api/facturis/pdf", casa: "Facturis", tip: "invoice" });
  assert.deepEqual(leg({ easybill_invoice_key: "abc", easybill_storno_key: "def" }), { fel: "pdf", ruta: "/api/easybill/pdf", casa: "easybill", tip: "storno" });
  /* Fara adresa (SmartBill fara link, stornarea fGO): lista n-are de unde, deci se deschide pagina comenzii. */
  assert.equal(leg({ smartbill_invoice_number: "5" }), null);
  assert.equal(leg({ fgo_storno_number: "3" }), null);
  /* ⚠ O valoare care nu e adresa `https://` nu ajunge intr-un `window.open`. */
  assert.equal(leg({ oblio_invoice_number: "1", oblio_invoice_link: "javascript:alert(1)" }), null);
  assert.equal(leg({ oblio_invoice_number: "1", oblio_invoice_link: "http://exemplu.ro/x" }), null);
});
