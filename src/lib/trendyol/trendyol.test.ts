import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTrendyolItems, tvaPentruVitrina, verificaBarcode, type MappableProduct } from "./mapping";
import { fereastraComenzi } from "./orders";
import { traduMesajTrendyol, mesajDupaStatus } from "./errors";
import { coteTvaVitrina, curieriVitrina, esteAdresaDe, infoVitrina, tvaImplicitVitrina } from "./types";
import type { TrendyolConfig } from "./types";

/**
 * Regulile Trendyol pe care le-am gresit si care au costat: vitrina, TVA-ul,
 * barcode-ul, fereastra de comenzi si campurile care nu exista in payload-ul
 * international. Testele astea sunt gardul, ca sa nu se intoarca.
 */

const produs: MappableProduct = {
  id: "11111111-2222-3333-4444-555555555555",
  name: "Rochie de vară",
  description: "<p>Descriere</p>",
  price: 199,
  compare_at_price: 249,
  images: ["https://cdn.edinio.com/a.jpg", "http://nesecurizat.ro/b.jpg"],
  category: "Rochii",
  sku: "ROCHIE-1",
  weight_grams: 400,
  track_inventory: true,
  stock_quantity: 7,
};

const listing = { brand_id: 10, category_id: 20, attributes: [], dimensional_weight: null, cargo_company_id: null };
const varianta = {
  barcode: "ROCHIE-1", stock_code: null, attributes: [], quantity: null,
  list_price: null, sale_price: null, vat_rate: null, enabled: true,
};

function construieste(config: TrendyolConfig = { storefront: "RO" }) {
  return buildTrendyolItems({ config, product: produs, listing, variants: [varianta] });
}
function itemuri(config?: TrendyolConfig) {
  const res = construieste(config);
  if ("error" in res) throw new Error(res.error);
  return res.items;
}

// ── Vitrine ───────────────────────────────────────────────────────────────────
test("vitrina RO cere 0, 11 sau 21 la TVA", () => {
  assert.deepEqual(coteTvaVitrina("RO"), [0, 11, 21]);
  // 19 era cota veche si a fost implicitul nostru: un produs trimis asa e respins.
  assert.equal(coteTvaVitrina("RO").includes(19), false);
  assert.equal(tvaImplicitVitrina("RO"), 21);
});

test("moneda vine de la vitrina, nu de la noi", () => {
  assert.equal(infoVitrina("RO").moneda, "RON");
  assert.equal(infoVitrina("DE").moneda, "EUR");
});

test("curierii sunt filtrati pe tara", () => {
  const ro = curieriVitrina("RO").map((c) => c.code);
  assert.equal(ro.includes("FANCOURIER"), true);
  assert.equal(ro.includes("DPD-RO"), true);
  // Curierii turcesti (Yurtici, Aras, Trendyol Express) nu au ce cauta pe RO.
  assert.equal(ro.includes("YKMP"), false);
  assert.equal(curieriVitrina("DE").map((c) => c.code).includes("FANCOURIER"), false);
});

test("stim care curieri cer AWB de la vanzator", () => {
  const ro = curieriVitrina("RO");
  assert.equal(ro.find((c) => c.code === "FANCOURIER")?.platesteVanzatorul, false);
  assert.equal(ro.find((c) => c.code === "DPDMP")?.platesteVanzatorul, true);
});

// ── TVA per varianta ──────────────────────────────────────────────────────────
test("o cota valida ramane neatinsa", () => {
  assert.equal(tvaPentruVitrina({ storefront: "RO" }, 11), 11);
});

test("o cota invalida e adusa la cea mai apropiata permisa", () => {
  // 19 nu exista pe RO; 21 e cea mai apropiata.
  assert.equal(tvaPentruVitrina({ storefront: "RO" }, 19), 21);
  assert.equal(tvaPentruVitrina({ storefront: "RO" }, 9), 11);
});

test("fara cota, ia standardul vitrinei", () => {
  assert.equal(tvaPentruVitrina({ storefront: "RO" }, null), 21);
  assert.equal(tvaPentruVitrina({ storefront: "DE" }, null), 19);
});

// ── Barcode ───────────────────────────────────────────────────────────────────
test("barcode: litere, cifre, punct, liniuta si underscore trec", () => {
  assert.equal(verificaBarcode("ROCHIE-1_A.2"), null);
});

test("barcode: spatiile, diacriticele si peste 40 de caractere sunt respinse", () => {
  assert.ok(verificaBarcode("cod cu spatiu"));
  assert.ok(verificaBarcode("rochiță"));
  assert.ok(verificaBarcode("x".repeat(41)));
  assert.ok(verificaBarcode(""));
});

// ── Payload de creare produs ──────────────────────────────────────────────────
test("nu mai trimitem campuri care nu exista pe international", () => {
  const item = itemuri()[0] as unknown as Record<string, unknown>;
  // Amandoua sunt din API-ul domestic turcesc; pe international nu exista.
  assert.equal(item.currencyType, undefined);
  assert.equal(item.cargoCompanyId, undefined);
});

test("se poate lista fara curier si fara adrese alese", () => {
  // Inainte, lipsa lor bloca listarea desi API-ul le trateaza ca optionale.
  assert.equal("error" in construieste({ storefront: "RO" }), false);
});

test("adresele se trimit doar cand sunt alese explicit", () => {
  assert.equal(itemuri()[0].shipmentAddressId, undefined);
  const cu = itemuri({ storefront: "RO", shipment_address_id: 5, returning_address_id: 6 });
  assert.equal(cu[0].shipmentAddressId, 5);
  assert.equal(cu[0].returningAddressId, 6);
});

test("imaginile http sunt sarite, fiindca Trendyol le refuza", () => {
  assert.deepEqual(itemuri()[0].images, [{ url: "https://cdn.edinio.com/a.jpg" }]);
});

test("TVA-ul trimis e cel al vitrinei", () => {
  assert.equal(itemuri()[0].vatRate, 21);
});

test("pretul taiat devine listPrice, cel curent salePrice", () => {
  const it = itemuri()[0];
  assert.equal(it.salePrice, 199);
  assert.equal(it.listPrice, 249);
});

// ── Fereastra de comenzi ──────────────────────────────────────────────────────
const ACUM = 1_800_000_000_000;
const DOUA_SAPTAMANI = 14 * 24 * 60 * 60 * 1000;

test("nu cerem niciodata mai mult de doua saptamani de comenzi", () => {
  // Un magazin nesincronizat de o luna ar fi cerut o fereastra respinsa de
  // Trendyol, deci tocmai el nu si-ar mai fi luat comenzile.
  const f = fereastraComenzi(ACUM - 60 * 24 * 60 * 60 * 1000, ACUM);
  assert.ok(ACUM - f.startDate < DOUA_SAPTAMANI);
  assert.equal(f.endDate, ACUM);
});

test("un reper recent e pastrat asa cum e", () => {
  const reper = ACUM - 3 * 60 * 60 * 1000;
  assert.equal(fereastraComenzi(reper, ACUM).startDate, reper);
});

test("fara reper, luam ultimele doua saptamani", () => {
  const f = fereastraComenzi(undefined, ACUM);
  assert.ok(ACUM - f.startDate < DOUA_SAPTAMANI);
  assert.ok(ACUM - f.startDate > DOUA_SAPTAMANI - 5 * 60 * 1000);
});

// ── Mesaje in romana ──────────────────────────────────────────────────────────
test("eroarea turceasca de furnizor negasit ajunge in romana", () => {
  const m = traduMesajTrendyol("Tedarikçi bulunamadı", 400);
  assert.ok(m.includes("vanzator"));
  assert.equal(m.includes("Tedarik"), false);
});

test("un mesaj nerecunoscut e pastrat, dar atribuit lor", () => {
  assert.ok(traduMesajTrendyol("Something odd happened", 400).includes("Something odd happened"));
});

test("401 si 429 sunt explicate, nu aratate ca numere", () => {
  assert.ok(mesajDupaStatus(401)?.includes("Cheile API"));
  assert.ok(mesajDupaStatus(429)?.includes("Prea multe cereri"));
  assert.equal(mesajDupaStatus(200), null);
});

test("pe stage spunem ca trebuie autorizat IP-ul", () => {
  assert.ok(mesajDupaStatus(503, "stage")?.includes("IP"));
});

// ── Adrese ────────────────────────────────────────────────────────────────────
test("recunoastem forma reala a adreselor, nu doar campul din documentatia veche", () => {
  assert.equal(esteAdresaDe({ id: 1, shipmentAddress: true }, "Shipment"), true);
  assert.equal(esteAdresaDe({ id: 1, addressType: "Returning" }, "Returning"), true);
  assert.equal(esteAdresaDe({ id: 1, shipmentAddress: true }, "Returning"), false);
});
