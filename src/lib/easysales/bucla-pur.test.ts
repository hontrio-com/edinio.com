import { test } from "node:test";
import assert from "node:assert/strict";
import { hotarareaDerivei, stocDeTrimis, stoculCereConfirmare, stoculEdinio, FARA_CORECTIE } from "./stoc";
import {
  canalulNativ, clasificaComanda, liniileComenzii, liniileComenziiEdinio, onorataDeEi, stareaInitiala,
  type ArticolLaEi,
} from "./vanzari-externe";
import { hotarareaProdusului, setarileCatalogului, type ProdusCatalog } from "./eligibilitate";
import type { ComandaEasySales } from "./tipuri";

/*
 * ═══ BUCLA DE STOC, PE VALORI ═══
 *
 * Stocul Edinio pe articol, cele doua formule, siguranta de masa, deriva si clasificarea comenzilor
 * altor canale. Partea cu baza se proba pe DEMO, cu easySales fals.
 */

const SETARI = setarileCatalogului({});

function produs(p: Partial<ProdusCatalog> = {}): ProdusCatalog {
  return {
    id: "11111111-1111-4111-8111-111111111111", name: "Cana", slug: "cana", description: "<p>x</p>", price: 50,
    compare_at_price: null, sku: "CANA", images: ["https://x/a.jpg"], category: null, track_inventory: true,
    stock_quantity: 7, weight_grams: null, page_sections: {}, is_active: true, is_bundle: false, ...p,
  };
}
const articol = (p: ProdusCatalog, i = 0) => hotarareaProdusului(p, { setari: SETARI, skuDuplicate: new Set() }).articole[i];

test("stocul Edinio al articolului: inactiv, pachet, epuizat sau neeligibil pleaca pe 0", () => {
  const p = produs();
  assert.equal(stoculEdinio(p, articol(p), SETARI), 7);
  assert.equal(stoculEdinio(produs({ stock_quantity: -3 }), articol(produs({ stock_quantity: -3 })), SETARI), 0);
  for (const x of [{ is_active: false }, { page_sections: { stock_status: "out_of_stock" } }, { price: 0 }]) {
    const q = produs(x);
    assert.equal(stoculEdinio(q, articol(q), SETARI), 0, JSON.stringify(x));
  }
  assert.equal(stoculEdinio(p, undefined, SETARI), 0, "articol inexistent");
  const fara = produs({ track_inventory: false });
  assert.equal(stoculEdinio(fara, articol(fara), SETARI), 0, "fara evidenta si fara stoc fix: nu pleaca");
  const setariFix = { ...SETARI, stocFix: 100 };
  const aFix = hotarareaProdusului(fara, { setari: setariFix, skuDuplicate: new Set() }).articole[0];
  assert.equal(stoculEdinio(fara, aFix, setariFix), 100, "stocul fix (D9)");
});

test("stocul unei combinatii se citeste din combinatie, si ca sir", () => {
  const p = produs({
    sku: "P", page_sections: { variants: { enabled: true, options: [{ id: "o", name: "Mărime", values: ["S", "M"] }], combinations: [
      { id: "s", title: "S", price: "", compare_at_price: "", sku: "P-S", stock_quantity: "4", image: "", enabled: true },
      { id: "m", title: "M", price: "", compare_at_price: "", sku: "P-M", stock_quantity: " 12 ", image: "", enabled: true },
    ] } },
  });
  assert.equal(stoculEdinio(p, articol(p, 0), SETARI), 4);
  assert.equal(stoculEdinio(p, articol(p, 1), SETARI), 12);
});

test("cele doua formule: scaderea nu coboara sub zero, rezervarea adauga ce s-a consumat deja", () => {
  assert.equal(stocDeTrimis(10, "scadere", { externeNeconsumate: 3, rezervariConsumate: 99 }), 7);
  assert.equal(stocDeTrimis(2, "scadere", { externeNeconsumate: 5, rezervariConsumate: 0 }), 0);
  assert.equal(stocDeTrimis(10, "rezervare", { externeNeconsumate: 99, rezervariConsumate: 2 }), 12);
  assert.equal(stocDeTrimis(4.7, "rezervare", FARA_CORECTIE), 4);
});

/*
 * ⚠ DE CE FORMULA E UN PARAMETRU. O simulare a celor doua modele easySales (planul, §5.5): cu formula
 * potrivita modelului, ce pot vinde marketplace-urile e chiar stocul fizic; cu cealalta, aceeasi bucata
 * se scade de doua ori (sau o bucata vanduta invie).
 */
function disponibilLaEi(model: "scadere" | "rezervare", formula: "scadere" | "rezervare", fizic: number, vanduteExtern: number, consumate: boolean) {
  /* E in Edinio: scade abia la consum. */
  const E = consumate ? fizic - vanduteExtern : fizic;
  /* Ce stiu ei despre vanzarile lor: */
  const corectie = {
    externeNeconsumate: consumate ? 0 : vanduteExtern,
    rezervariConsumate: consumate ? vanduteExtern : 0,
  };
  const trimis = stocDeTrimis(E, formula, corectie);
  /* `scadere`: copia lor scade la vanzare, dar o impingere absoluta o suprascrie. `rezervare`: copia ramane, iar rezervarea se scade din ea. */
  return model === "scadere" ? trimis : trimis - vanduteExtern;
}

test("⚠ formula potrivita modelului tine disponibilul egal cu stocul fizic; cealalta scade de doua ori", () => {
  const fizic = 10;
  for (const consumate of [false, true]) {
    assert.equal(disponibilLaEi("rezervare", "rezervare", fizic, 2, consumate), 8, `rezervare/rezervare, consumate=${consumate}`);
    assert.equal(disponibilLaEi("scadere", "scadere", fizic, 2, consumate), 8, `scadere/scadere, consumate=${consumate}`);
  }
  /* Formula de scadere peste un model cu rezervare: dupa consum, bucata se scade de doua ori. */
  assert.equal(disponibilLaEi("rezervare", "scadere", fizic, 2, true), 6);
  /* Formula de rezervare peste un model cu scadere: dupa consum, bucatile vandute invie. */
  assert.equal(disponibilLaEi("scadere", "rezervare", fizic, 2, true), 10);
});

test("siguranta de masa pe stoc: peste 200 de articole sau peste 30% (cu macar 20), pe val", () => {
  assert.equal(stoculCereConfirmare(201, 100_000), true);
  assert.equal(stoculCereConfirmare(150, 400), true);
  assert.equal(stoculCereConfirmare(15, 20), false, "sub 20 de articole nu cere, oricat procent");
  assert.equal(stoculCereConfirmare(100, 1000), false);
  assert.equal(stoculCereConfirmare(0, 0), false);
});

test("deriva: la ei mai mult se corecteaza, la ei mai putin intai se cauta comanda, apoi alarma", () => {
  assert.equal(hotarareaDerivei(5, 5, false), "nimic");
  assert.equal(hotarareaDerivei(9, 5, false), "trimite");
  assert.equal(hotarareaDerivei(3, 5, false), "recitesteComenzile");
  assert.equal(hotarareaDerivei(3, 5, true), "alarma");
});

test("canalul nativ din numele lor; FBE e onorata de marketplace", () => {
  assert.deepEqual(canalulNativ("Emag"), { canal: "emag", tara: "ro" });
  assert.deepEqual(canalulNativ("EmagHU"), { canal: "emag", tara: "hu" });
  assert.deepEqual(canalulNativ("EmagBG"), { canal: "emag", tara: "bg" });
  assert.deepEqual(canalulNativ("EmagROFBE"), { canal: "emag", tara: "ro" });
  assert.deepEqual(canalulNativ("TrendyolBG"), { canal: "trendyol", tara: "bg" });
  assert.deepEqual(canalulNativ("PepitaHU"), { canal: "pepita", tara: "hu" });
  assert.deepEqual(canalulNativ("About You"), { canal: "aboutyou", tara: "ro" });
  assert.equal(canalulNativ("Allegro"), null);
  assert.equal(canalulNativ(null), null);
  assert.equal(onorataDeEi("EmagHUFBE"), true);
  assert.equal(onorataDeEi("AmazonFBA"), true);
  assert.equal(onorataDeEi("Emag"), false);
});

test("liniile comenzii lor: cota din fractie, id-ul lor ca text, liniile goale afara", () => {
  const l = liniileComenzii({ products: [
    { sku: "A", name: "Cana", quantity: 2, price: "15.1261", tax: "0.19", product_data: { id: 3, sku: "A" }, offer: { marketplace_name: "Emag" } },
    { sku: "B", quantity: "1", price: 10, tax: 21, product_data: null },
    { sku: "C", quantity: 0, price: 5, tax: "0.21" },
  ] });
  assert.equal(l.length, 2);
  assert.deepEqual([l[0].cota, l[0].esProductId, l[0].canal, l[0].cantitate], [19, "3", "Emag", 2]);
  assert.deepEqual([l[1].cota, l[1].esProductId], [21, null]);
});

const ART: ArticolLaEi = { productUuid: "11111111-1111-4111-8111-111111111111", identitate: "", sku: "CANA-1", esProductId: "77" };
const articole = new Map([["77", ART]]);
const cmd = (x: Partial<ComandaEasySales> = {}): ComandaEasySales => ({
  internal_id: 500, status: "New", marketplace: null,
  products: [{ sku: "CANA-1", quantity: 2, price: "10", tax: "0.21", product_data: { id: 77 }, offer: { marketplace_name: "Emag" } }],
  ...x,
});

test("clasificarea: canalul legat direct, onorata de ei, anulata la prima vedere, fara linii, vanzare pe doi martori", () => {
  const ctx = { canaleConectate: [] as { canal: string; tara: string }[], articole, laPrimaVedere: true };
  assert.equal(clasificaComanda(cmd(), { ...ctx, canaleConectate: [{ canal: "emag", tara: "ro" }] }).fel, "canal-nativ");
  assert.equal(clasificaComanda(cmd(), { ...ctx, canaleConectate: [{ canal: "emag", tara: "hu" }] }).fel, "vanzare", "alta tara nu e acelasi canal");
  assert.equal(clasificaComanda(cmd({ marketplace: "EmagROFBE" }), { ...ctx, canaleConectate: [{ canal: "emag", tara: "ro" }] }).fel, "onorata-de-ei");
  assert.equal(clasificaComanda(cmd({ status: "Canceled" }), ctx).fel, "anulata-la-prima-vedere");
  assert.equal(clasificaComanda(cmd({ status: "Canceled" }), { ...ctx, laPrimaVedere: false }).fel, "vanzare", "anularea de dupa prima vedere o duce oglinda");
  const strain = clasificaComanda(cmd({ products: [{ sku: "ALT", quantity: 1, price: 1, tax: 0.21, product_data: { id: 77 } }] }), ctx);
  assert.equal(strain.fel, "fara-linii-legate", "acelasi id, alt SKU: un singur martor nu ajunge");
  const v = clasificaComanda(cmd({ products: [
    { sku: "cana-1", quantity: 2, price: "10", tax: "0.21", product_data: { id: 77 } },
    { sku: "X", quantity: 1, price: "5", tax: "0.21", product_data: { id: 99 } },
  ] }), ctx);
  assert.equal(v.fel, "vanzare");
  if (v.fel === "vanzare") {
    assert.equal(v.legate.length, 1);
    assert.equal(v.nelegate.length, 1);
    assert.equal(v.legate[0].articol.productUuid, ART.productUuid);
  }
});

test("starea initiala si sumele comenzii aduse: brut din net, cota dominanta, TVA-ul din brut", () => {
  assert.equal(stareaInitiala(1), "confirmed");
  assert.equal(stareaInitiala(4), "processing");
  assert.equal(stareaInitiala(3), "shipped");
  const v = clasificaComanda(cmd({ products: [
    { sku: "CANA-1", quantity: 3, price: "10", tax: "0.21", product_data: { id: 77 } },
    { sku: "X", quantity: 1, price: "100", tax: "0.11", product_data: null },
  ] }), { canaleConectate: [], articole, laPrimaVedere: true });
  assert.equal(v.fel, "vanzare");
  if (v.fel !== "vanzare") return;
  const s = liniileComenziiEdinio(v.legate, v.nelegate, new Map());
  assert.deepEqual(s.items.map((x) => [x.product_id, x.price, x.quantity, x.vat_rate]), [
    [ART.productUuid, 12.1, 3, 21],
    [null, 111, 1, 11],
  ]);
  assert.equal(s.subtotal, 147.3);
  assert.equal(s.cotaDominanta, 11, "linia cu valoarea cea mai mare");
  assert.equal(s.tva, Math.round((36.3 * 21 / 121 + 111 * 11 / 111) * 100) / 100);
});
