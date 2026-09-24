import { test } from "node:test";
import assert from "node:assert/strict";
import { curierulReal, numeleCurierului, urmareste } from "./urmarire";
import { numeleMetodei, stareaPlatii } from "./plata";
import { cronologia } from "./cronologie";
import { livrarea } from "./livrare";
import { detaliileDeLaCheckout } from "./detalii-checkout";
import { documentulFiscal, numarulDocumentului, stareaDocumentului } from "./documente";

/*
 * COMANDA CU TOATE DETALIILE: regulile care nu au voie sa minta pe ecran.
 *
 * Formele sunt cele masurate pe 23.09.2026 (demo si, agregat, productie): cele
 * doua chei de cod postal, ridicarea personala scrisa ca `address`, easybox-ul cu
 * adresa punctului in `address`, `notes` ca JSON sau text, stornarea care lasa
 * numarul facturii pe rand, rambursul livrat care ramane `unpaid`.
 */

/* ═══ Urmarirea coletului ═══ */

const href = (p: Parameters<typeof urmareste>[0]) => urmareste(p)?.href ?? null;
/* Separatorii din `woot_service_name`, construiti din cod: sursa nu poarta semnul lung. */
const LUNG = String.fromCharCode(0x2014);
const PUNCT = String.fromCharCode(0xb7);

test("urmarire: curierii directi, cu tiparele lor", () => {
  assert.equal(href({ curier: "fancourier", awb: "2270499882526" }), "https://www.fancourier.ro/awb-tracking/?tracking=2270499882526");
  assert.equal(href({ curier: "cargus", awb: "123" }), "https://www.cargus.ro/personal/urmareste-coletul/?tracking_number=123");
  assert.equal(href({ curier: "sameday", awb: "1SD" }), "https://sameday.ro/#awb=1SD");
  assert.equal(href({ curier: "dpd", awb: "81000000001" }), "https://tracking.dpd.ro/?shipmentNumber=81000000001");
  assert.equal(href({ curier: "gls", awb: "999" }), "https://gls-group.com/RO/ro/urmarire-colet?match=999");
  assert.equal(href({ curier: "packeta", awb: "Z123" }), "https://tracking.packeta.com/ro/?id=Z123");
  assert.equal(href({ curier: "ecolet", awb: "E1" }), "https://panel.ecolet.ro/track/E1");
  assert.equal(href({ curier: "shipo", awb: "S1" }), "https://shipo.ro/servicii-curierat/urmarire-colet?awb_track=S1");
  assert.equal(href({ curier: "fancourier", awb: "  " }), null);
  /* Colete Online: ruta lor nu e documentata si n-a fost probata pe o expediere reala. */
  assert.equal(urmareste({ curier: "colete", awb: "C1" }), null);
});

test("⚠⚠ urmarire: Woot trimite la pagina LOR, pe curierul real, pe ambele separatoare masurate", () => {
  /* Productie: „DPD <semn lung> locatie - adresa" (218) si „DPD <punct median> locatie - adresa" (55); demo: „DPD Classic". */
  for (const serviciu of [`DPD ${LUNG} locatie - adresa`, `DPD ${PUNCT} locatie - adresa`, "DPD Classic", "DPD"]) {
    assert.equal(href({ curier: "woot", curierReal: serviciu, awb: "81234567890" }), "https://awb.woot.ro/urmarire-colet-dpd/81234567890", serviciu);
  }
  assert.equal(href({ curier: "woot", curierReal: `Fan Courier ${LUNG} fanbox - adresa`, awb: "41" }), "https://awb.woot.ro/urmarire-colet-fancourier/41");
  /* Un serviciu necunoscut: nimic, nu o adresa ghicita. */
  assert.equal(urmareste({ curier: "woot", curierReal: "Curier Nou SRL", awb: "1" }), null);
  assert.equal(urmareste({ curier: "woot", curierReal: null, awb: "1" }), null);
});

test("urmarire: Posta si Pall-Ex dau numai pagina de cautare, marcata ca atare", () => {
  assert.deepEqual(urmareste({ curier: "posta", awb: "RR1" }), { href: "https://www.posta-romana.ro/track-trace.html", fel: "cautare" });
  assert.equal(urmareste({ curier: "pallex", awb: "P1" })?.fel, "cautare");
  assert.equal(urmareste({ curier: "fancourier", awb: "1" })?.fel, "direct");
});

test("⚠⚠ urmarire: adresa salvata de curier trece NUMAI daca e https", () => {
  assert.equal(href({ curier: "ups", awb: "1Z", urlSalvat: "https://www.ups.com/track?tracknum=1Z" }), "https://www.ups.com/track?tracknum=1Z");
  assert.equal(href({ curier: "ups", awb: "1Z", urlSalvat: "javascript:alert(1)" }), null);
  assert.equal(href({ curier: "ups", awb: "1Z", urlSalvat: "http://ups.com/x" }), null);
  assert.equal(href({ curier: "ups", awb: "1Z", urlSalvat: "nu e adresa" }), null);
  /* Si cand adresa salvata e rea, tiparul tot se poate folosi. */
  assert.equal(href({ curier: "fancourier", awb: "7", urlSalvat: "javascript:x" }), "https://www.fancourier.ro/awb-tracking/?tracking=7");
});

test("urmarire: AWB-ul se codifica, nu se lipeste", () => {
  assert.equal(href({ curier: "cargus", awb: "1&x=2" }), "https://www.cargus.ro/personal/urmareste-coletul/?tracking_number=1%26x%3D2");
  assert.equal(href({ curier: "woot", curierReal: "DPD", awb: "1/../x" }), "https://awb.woot.ro/urmarire-colet-dpd/1%2F..%2Fx");
});

test("curierul real se recunoaste dupa PRIMUL cuvant, pe o harta explicita", () => {
  assert.equal(curierulReal("Fan Courier"), "fancourier");
  assert.equal(curierulReal("fancourier"), "fancourier");
  assert.equal(curierulReal("fan"), "fancourier");
  assert.equal(curierulReal("Urgent Cargus"), "cargus");
  assert.equal(curierulReal("Poșta Română"), "posta");
  /* „Curier DPD" nu incepe cu DPD: nu se ghiceste pe subsir. */
  assert.equal(curierulReal("Curier DPD"), null);
  assert.equal(curierulReal(""), null);
});

test("numele curierului e fara diacritice (H6), iar la brokeri e curierul REAL", () => {
  assert.equal(numeleCurierului("posta"), "Posta Romana");
  assert.equal(numeleCurierului("fancourier"), "FAN Courier");
  assert.equal(numeleCurierului("woot", `DPD ${LUNG} locatie - adresa`), "DPD");
  assert.equal(numeleCurierului("woot", null), "Woot", "fara curier real ramane numele brokerului");
  assert.equal(numeleCurierului(null), null);
});

/* ═══ Plata ═══ */

test("⚠ metoda necunoscuta NU devine ramburs", () => {
  assert.equal(numeleMetodei("cash_on_delivery"), "Ramburs la livrare");
  assert.equal(numeleMetodei("netopia"), "Card online");
  assert.equal(numeleMetodei("bank_transfer"), "Transfer bancar");
  assert.equal(numeleMetodei("ceva_nou"), "Alta metoda de plata");
  assert.equal(numeleMetodei(null), null);
});

test("⚠⚠ rambursul LIVRAT e achitat, desi campul scrie `unpaid`", () => {
  const s = stareaPlatii({ stare: "delivered", incasata: true, metoda: "cash_on_delivery", starePlata: "unpaid" });
  assert.equal(s.text, "Platita la livrare");
  assert.equal(s.ton, "bun");
});

test("rambursul nelivrat se plateste la livrare; cardul neplatit nu e „platit”", () => {
  assert.equal(stareaPlatii({ stare: "pending", incasata: false, metoda: "cash_on_delivery", starePlata: "unpaid" }).text, "Plata la livrare");
  assert.equal(stareaPlatii({ stare: "pending", incasata: false, metoda: "netopia", starePlata: "unpaid" }).text, "Plata nu a fost finalizata");
  assert.equal(stareaPlatii({ stare: "confirmed", incasata: true, metoda: "stripe", starePlata: "paid" }).text, "Platita");
});

test("⚠⚠ comanda anulata si PLATITA nu primeste „nu ai platit”", () => {
  const s = stareaPlatii({ stare: "cancelled", incasata: false, metoda: "netopia", starePlata: "paid" });
  assert.match(s.text, /Magazinul iti returneaza banii/);
  assert.equal(stareaPlatii({ stare: "cancelled", incasata: false, metoda: "netopia", starePlata: "unpaid" }).text, "Anulata, nu ai platit nimic");
  assert.equal(stareaPlatii({ stare: "refunded", incasata: false, metoda: "stripe", starePlata: "refunded" }).text, "Rambursata");
});

test("vederea redusa (fara metoda) nu spune mai mult decat stie", () => {
  assert.equal(stareaPlatii({ stare: "pending", incasata: false, metoda: null, starePlata: null }).text, "Neplatita");
  assert.equal(stareaPlatii({ stare: "delivered", incasata: true, metoda: null, starePlata: null }).text, "Platita");
});

/* ═══ Linia de timp ═══ */

const CREATA = "2026-09-18T12:51:00Z";
const AWB_LA = "2026-09-19T08:00:00Z";

test("⚠⚠ linia de timp nu inventeaza ore: numai plasarea si AWB-ul au data", () => {
  const c = cronologia({ stare: "delivered", creataLa: CREATA, awbEmisLa: AWB_LA, ridicare: false });
  assert.deepEqual(c.pasi.map((p) => p.stare), ["facut", "facut", "facut", "facut", "facut"]);
  assert.deepEqual(c.pasi.map((p) => p.la), [CREATA, null, null, AWB_LA, null]);
  assert.equal(c.capat, null);
});

test("pasul curent e unul singur, iar ce urmeaza nu e bifat", () => {
  const c = cronologia({ stare: "processing", creataLa: CREATA, awbEmisLa: null, ridicare: false });
  assert.deepEqual(c.pasi.map((p) => p.stare), ["facut", "facut", "curent", "urmeaza", "urmeaza"]);
  assert.match(c.fraza, /pregateste coletul/);
  /* O stare necunoscuta cade pe inceput, nu pe capat. */
  assert.equal(cronologia({ stare: "ciudat", creataLa: CREATA, awbEmisLa: null, ridicare: false }).pasi[0].stare, "curent");
});

test("⚠ comanda anulata e un CAPAT, iar pasii ei nu se bifeaza pe ghicite", () => {
  const c = cronologia({ stare: "cancelled", creataLa: CREATA, awbEmisLa: AWB_LA, ridicare: false });
  assert.equal(c.capat?.fel, "anulata");
  assert.deepEqual(c.pasi.map((p) => p.stare), ["facut", "urmeaza", "urmeaza", "urmeaza", "urmeaza"]);
  assert.equal(c.pasi[3].la, null, "data AWB-ului nu se pune pe un pas nefacut");
  assert.equal(cronologia({ stare: "refunded", creataLa: CREATA, awbEmisLa: null, ridicare: false }).capat?.fel, "rambursata");
});

test("la ridicarea personala pasii de la capat se numesc altfel", () => {
  const c = cronologia({ stare: "shipped", creataLa: CREATA, awbEmisLa: null, ridicare: true });
  assert.equal(c.pasi[3].eticheta, "Gata de ridicare");
  assert.equal(c.pasi[4].eticheta, "Ridicata");
});

/* ═══ Livrarea ═══ */

test("⚠⚠ ridicarea personala NU e „livrare la adresa”, desi `delivery_type` e address", () => {
  const l = livrarea({ fel_livrare: "address", curier_ales: "pickup", adresa: "Strada Omului 1", oras: "Iasi", eticheta_livrare: "Ridicare personala" });
  assert.equal(l?.fel, "ridicare");
  assert.deepEqual(l?.adresa, [], "adresa omului s-a aratat ca destinatie");
});

test("⚠ la easybox se arata PUNCTUL, cu adresa lui", () => {
  const l = livrarea({
    fel_livrare: "locker", curier_ales: "sameday", punct: "easybox Mega Image Observatorului",
    adresa: "Strada Observatorului 88", adresa_acasa: "Strada Observatorului nr. 88",
    punct_adresa: "Strada Observatorului 88", punct_oras: "Cluj-Napoca", punct_judet: "Cluj",
  });
  assert.equal(l?.fel, "punct");
  assert.equal(l?.punct, "easybox Mega Image Observatorului");
  assert.deepEqual(l?.adresa, ["Strada Observatorului 88", "Cluj-Napoca, jud. Cluj"]);
});

test("adresa completa are CODUL POSTAL, iar Bucurestiul nu primeste „jud.”", () => {
  const l = livrarea({ fel_livrare: "address", adresa: "Bulevardul Lacul Tei nr. 83", oras: "Sector 2", judet: "Municipiul Bucuresti", cod_postal: "021045" });
  assert.deepEqual(l?.adresa, ["Bulevardul Lacul Tei nr. 83", "021045 Sector 2, Municipiul Bucuresti"]);
  const strain = livrarea({ adresa: "Hauptstrasse 1", oras: "Wien", cod_postal: "1010", tara: "at" });
  assert.deepEqual(strain?.adresa, ["Hauptstrasse 1", "1010 Wien", "AT"]);
  assert.equal(livrarea({ adresa: "X", tara: "RO" })?.adresa.includes("RO"), false);
  assert.equal(livrarea(null), null);
});

test("curierul propriu al magazinului are titlul lui", () => {
  assert.equal(livrarea({ curier_ales: "own", adresa: "X" })?.fel, "propriu");
});

/* ═══ Detaliile de la checkout ═══ */

test("detalii: JSON cheiat pe id, cu eticheta magazinului cand o are", () => {
  const r = detaliileDeLaCheckout(
    JSON.stringify({ cf_interval: "Dupa ora 18", mesaj_felicitare: "La multi ani!" }),
    [{ id: "cf_interval", label: "Interval de livrare" }],
  );
  assert.deepEqual(r, [
    { eticheta: "Interval de livrare", valoare: "Dupa ora 18" },
    { eticheta: "Mesaj felicitare", valoare: "La multi ani!" },
  ]);
});

test("⚠ detalii: textul vechi sau JSON-ul stricat nu rup pagina si nu se pierd", () => {
  assert.deepEqual(detaliileDeLaCheckout("Sunati inainte", []), [{ eticheta: "Mentiuni", valoare: "Sunati inainte" }]);
  assert.deepEqual(detaliileDeLaCheckout("{stricat", []), [{ eticheta: "Mentiuni", valoare: "{stricat" }]);
  assert.deepEqual(detaliileDeLaCheckout(null, []), []);
  assert.deepEqual(detaliileDeLaCheckout(JSON.stringify({ a: true, b: "", c: { x: 1 } }), []), [{ eticheta: "A", valoare: "Da" }]);
});

/* ═══ Documentul fiscal ═══ */

test("⚠⚠ factura STORNATA se spune pe fata", () => {
  const d = documentulFiscal({
    casa: "smartbill", serie: "CLM", numar: "0224", stornata: true,
    storno_serie: "CLM", storno_numar: "0225", storno_descarcabil: true, emisa_la: "2026-09-05",
  });
  assert.ok(d);
  assert.equal(stareaDocumentului(d).text, "Stornata");
  assert.equal(numarulDocumentului(d.stornoSerie, d.stornoNumar), "CLM 0225");
  assert.equal(d.stornoDescarcabil, true);
});

test("documentul se citeste defensiv", () => {
  assert.equal(documentulFiscal(null), null);
  assert.equal(documentulFiscal({ casa: "altceva", numar: "1" }), null);
  assert.equal(documentulFiscal({ casa: "oblio", numar: "  " }), null);
  const d = documentulFiscal({ casa: "fgo", serie: "CLF", numar: "0015", storno_descarcabil: true });
  /* Descarcabil fara numar de stornare nu inseamna nimic. */
  assert.equal(d?.stornoDescarcabil, false);
  assert.equal(d && stareaDocumentului(d).text, "Emisa");
});
