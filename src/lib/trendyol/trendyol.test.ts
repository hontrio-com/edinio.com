import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildTrendyolItems, deriveVariantSlots, resolveVariantQuantity, tvaPentruVitrina,
  verificaBarcode, type MappableProduct,
} from "./mapping";
import { fereastraComenzi } from "./orders";
import {
  barcodeArticol, eTrecatoare, grupeazaInLoturi, listariDeRepus, MAX_REPUNERI_STOC, stareLot,
} from "./sync";
import { atributeLipsaPeVariante, mesajAtributeLipsa } from "./atribute-obligatorii";
import { edinioStatusForTrendyol } from "./webhooks";
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
  const m401 = mesajDupaStatus(401) ?? "";
  assert.ok(m401.includes("API Key"));
  /*
   * 401 vine SI de la un Seller ID gresit, cu chei perfect valide — probat pe
   * API-ul lor, care raspunde tot `401`, nu `403`. Mesajul care dadea vina doar
   * pe chei trimitea comerciantul sa le regenereze la nesfarsit.
   */
  assert.ok(m401.includes("Seller ID"));
  assert.ok(mesajDupaStatus(429)?.includes("Prea multe cereri"));
  assert.equal(mesajDupaStatus(200), null);
});

test("pe stage spunem ca trebuie autorizat IP-ul, pe orice cod ne-ar da", () => {
  // Gazda de stage sta in spatele unui filtru de retea si raspunde 403 cu HTML,
  // nu 503 cu JSON: ramura legata doar de 503 nu se declansa niciodata.
  assert.ok(mesajDupaStatus(503, "stage")?.includes("IP"));
  assert.ok(mesajDupaStatus(403, "stage")?.includes("IP"));
  // Iar pe productie, 403 ramane 403 — nu se vorbeste despre mediul de test.
  assert.equal(mesajDupaStatus(403, "production")?.includes("IP"), false);
});

test("cheia stabila bate textul localizat", () => {
  // Documentatia lor: `key` e identificatorul stabil, `message` e localizat de
  // `Accept-Language` si nu are voie sa fie discriminant.
  const m = traduMesajTrendyol("herhangi bir metin", 401, "supplier.api.supplier.not.found");
  assert.ok(m.includes("vanzator"));
  assert.equal(m.includes("herhangi"), false);
});

// ── Adrese ────────────────────────────────────────────────────────────────────
test("recunoastem forma reala a adreselor, nu doar campul din documentatia veche", () => {
  assert.equal(esteAdresaDe({ id: 1, shipmentAddress: true }, "Shipment"), true);
  assert.equal(esteAdresaDe({ id: 1, addressType: "Returning" }, "Returning"), true);
  assert.equal(esteAdresaDe({ id: 1, shipmentAddress: true }, "Returning"), false);
});

// ── Trimiterea in masa ────────────────────────────────────────────────────────
// Serviciul de creare accepta pana la 1000 de articole intr-o cerere, deci o
// selectie de 200 de produse pleaca in cateva cereri, nu in 200.

function produsDeTrimis(id: string, nrVariante: number) {
  return {
    listingId: `l-${id}`,
    mainId: id,
    items: Array.from({ length: nrVariante }, (_, i) => ({ barcode: `${id}-${i}` } as never)),
  };
}

test("mai multe produse intra in aceeasi cerere", () => {
  const loturi = grupeazaInLoturi([produsDeTrimis("a", 2), produsDeTrimis("b", 3)], 200);
  assert.equal(loturi.length, 1);
  assert.equal(loturi[0].items.length, 5);
  assert.deepEqual(loturi[0].mainIds, ["a", "b"]);
});

test("un produs nu se rupe intre doua cereri", () => {
  // Variantele aceluiasi produs sunt legate prin productMainId: trimise separat,
  // a doua cerere il suprascrie pe primul in catalogul Trendyol.
  const loturi = grupeazaInLoturi([produsDeTrimis("a", 3), produsDeTrimis("b", 3)], 4);
  assert.equal(loturi.length, 2);
  for (const lot of loturi) {
    assert.equal(lot.mainIds.length, 1);
    assert.equal(lot.items.length, 3);
  }
});

test("un produs mai mare decat plafonul pleaca totusi intreg", () => {
  const loturi = grupeazaInLoturi([produsDeTrimis("mare", 250)], 200);
  assert.equal(loturi.length, 1);
  assert.equal(loturi[0].items.length, 250);
});

test("fara produse nu se trimite nicio cerere", () => {
  assert.deepEqual(grupeazaInLoturi([], 200), []);
});

// ── Variante: barcode, stoc, titlu ─────────────────────────────────────────────
/*
 * Cele trei defecte care tineau integrarea pe loc, fiecare cu proba lui.
 * Toate au fost gasite pe date reale, nu prin citirea codului.
 */

/** Produs cu marimi: trei combinatii, fiecare cu stocul si codul ei. */
const produsCuMarimi: MappableProduct = {
  ...produs,
  id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  sku: null,
  stock_quantity: 15,
  page_sections: {
    variants: {
      enabled: true,
      options: [{ name: "Mărime", values: ["S", "M", "L"] }],
      combinations: [
        { id: "c1c1c1c1-1111-1111-1111-111111111111", title: "S", price: "", compare_at_price: "", sku: "", gtin: "5901234123457", stock_quantity: "5", image: "", enabled: true },
        { id: "c2c2c2c2-2222-2222-2222-222222222222", title: "M", price: "", compare_at_price: "", sku: "ROCHIE-M", stock_quantity: "5", image: "", enabled: true },
        { id: "c3c3c3c3-3333-3333-3333-333333333333", title: "L", price: "", compare_at_price: "", sku: "", stock_quantity: "5", image: "", enabled: true },
      ],
    },
  },
} as unknown as MappableProduct;

test("barcode-ul derivat incape in cele 40 de caractere ale lui Trendyol", () => {
  /*
   * Forma veche era `${product.id}-${combo.id}`: doua uuid-uri, 73 de caractere,
   * peste limita pe care tot noi o verificam. 78 de produse reale erau blocate
   * de un barcode fabricat de noi, cu un mesaj care dadea vina pe comerciant.
   */
  for (const s of deriveVariantSlots(produsCuMarimi)) {
    assert.equal(verificaBarcode(s.barcode), null, `barcode invalid: ${s.barcode} (${s.barcode.length} car.)`);
  }
});

test("GTIN-ul umple golul, dar SKU-ul ramane identitatea", () => {
  const s = deriveVariantSlots(produsCuMarimi);
  // Combinatia fara SKU isi ia GTIN-ul: erau aproape zece mii de combinatii cu
  // GTIN completat in Edinio si niciuna nu pleca la marketplace.
  assert.equal(s[0].barcode, "5901234123457");
  // Cea cu SKU si-l pastreaza, chiar daca ar avea si GTIN.
  assert.equal(s[1].barcode, "ROCHIE-M");
  // A treia n-are nici GTIN, nici SKU: se deriva, si tot trebuie sa fie valida.
  assert.equal(verificaBarcode(s[2].barcode), null);
});

test("SKU-ul bate GTIN-ul, ca sa nu se schimbe identitatea unei variante deja listate", () => {
  /*
   * Barcode-ul NU e o preferinta, e identitatea articolului la Trendyol. Pus
   * GTIN-ul primul, o varianta care are si SKU si GTIN si-ar fi schimbat codul
   * la prima salvare: al doilea produs pe Trendyol, primul ramas acolo orfan si
   * VANDABIL, si niciun rand la noi din care sa-l mai putem pune pe zero.
   */
  const amandoua = {
    ...produsCuMarimi,
    page_sections: {
      variants: {
        enabled: true,
        options: [{ name: "Mărime", values: ["S"] }],
        combinations: [
          { id: "e1", title: "S", price: "", compare_at_price: "", sku: "VECHI-S", gtin: "5901234123457", stock_quantity: "4", image: "", enabled: true },
        ],
      },
    },
  } as unknown as MappableProduct;
  assert.equal(deriveVariantSlots(amandoua)[0].barcode, "VECHI-S");

  // Si la produsul FARA variante, unde nu exista titlu de combinatie pe care sa
  // se potriveasca randul salvat: acolo barcode-ul e SINGURA legatura.
  const faraVariante = { ...produs, sku: "PARF-001", page_sections: { google: { gtin: "5941234567890" } } } as unknown as MappableProduct;
  assert.equal(deriveVariantSlots(faraVariante)[0].barcode, "PARF-001");
  // Fara SKU, GTIN-ul e binevenit: altfel pleca un uuid drept cod de bare.
  const faraSku = { ...faraVariante, sku: null } as unknown as MappableProduct;
  assert.equal(deriveVariantSlots(faraSku)[0].barcode, "5941234567890");
});

test("doua combinatii cu ACELASI titlu se reduc la prima, ca peste tot in aplicatie", () => {
  /*
   * Sunt produse reale asa: 37 de titluri duplicate pe 8 produse. `findCombo`,
   * `comboStockMap` si scaderea de stoc aleg toate PRIMA — daca aici ar iesi
   * doua sloturi cu acelasi titlu, potrivirea din editor le-ar prabusi pe
   * acelasi rand, salvarea ar sterge toate variantele si ar cadea pe cheia
   * unica, iar listarea ar ramane fara nicio varianta.
   */
  const titluriDuble = {
    ...produsCuMarimi,
    page_sections: {
      variants: {
        enabled: true,
        options: [{ name: "Mărime", values: ["M"] }],
        combinations: [
          { id: "f1", title: "M", price: "", compare_at_price: "", sku: "A", stock_quantity: "3", image: "", enabled: true },
          { id: "f2", title: "M", price: "", compare_at_price: "", sku: "B", stock_quantity: "7", image: "", enabled: true },
        ],
      },
    },
  } as unknown as MappableProduct;
  const s = deriveVariantSlots(titluriDuble);
  assert.equal(s.length, 1);
  assert.equal(s[0].barcode, "A");
  assert.equal(s[0].quantity, 3);
});

test("stocul TOTAL al produsului nu se da drept stoc de varianta", () => {
  /*
   * Cand combinatiile n-au stoc propriu, fondul e COMUN. Marcat „viu", ajungea
   * sa bata cantitatea scrisa de comerciant in editor si sa-i blocheze campul:
   * un tricou cu 15 bucati si S/M/L fara stoc pe combinatie pleca la Trendyol
   * cu 15 pe FIECARE marime, peste cele 5/5/5 completate de om.
   */
  const faraStocPeCombinatie = {
    ...produsCuMarimi,
    stock_quantity: 15,
    page_sections: {
      variants: {
        enabled: true,
        options: [{ name: "Mărime", values: ["S", "M"] }],
        combinations: [
          { id: "g1", title: "S", price: "", compare_at_price: "", sku: "S1", stock_quantity: "", image: "", enabled: true },
          { id: "g2", title: "M", price: "", compare_at_price: "", sku: "M1", stock_quantity: "", image: "", enabled: true },
        ],
      },
    },
  } as unknown as MappableProduct;
  for (const s of deriveVariantSlots(faraStocPeCombinatie)) {
    assert.equal(s.stocViu, false, `${s.label} nu are stoc propriu, deci nu e „viu"`);
  }
  // Produsul FARA combinatii, in schimb, chiar isi are stocul pe varianta.
  assert.equal(deriveVariantSlots(produs)[0].stocViu, true);
});

test("doua variante nu pot pleca cu acelasi barcode", () => {
  const acelasiSku = {
    ...produsCuMarimi,
    page_sections: {
      variants: {
        enabled: true,
        options: [{ name: "Mărime", values: ["S", "M"] }],
        combinations: [
          { id: "d1", title: "S", price: "", compare_at_price: "", sku: "ACELASI", stock_quantity: "2", image: "", enabled: true },
          { id: "d2", title: "M", price: "", compare_at_price: "", sku: "ACELASI", stock_quantity: "3", image: "", enabled: true },
        ],
      },
    },
  } as unknown as MappableProduct;
  const barcoduri = deriveVariantSlots(acelasiSku).map((s) => s.barcode);
  // Trendyol ar accepta prima varianta si ar suprascrie-o cu a doua: produsul ar
  // aparea cu o singura marime, fara nicio eroare.
  assert.equal(new Set(barcoduri).size, barcoduri.length);
});

test("fiecare marime pleaca cu stocul EI, nu cu totalul produsului", () => {
  /*
   * S=5, M=5, L=5 inseamna 15 bucati. Trimis totalul pe fiecare barcode, ies 45
   * de bucati vandabile din 15 — iar `reconcileInventory` foloseste aceeasi
   * functie, deci confirma cifra gresita in loc s-o corecteze.
   */
  const stocuri = deriveVariantSlots(produsCuMarimi).map((s) => s.quantity);
  assert.deepEqual(stocuri, [5, 5, 5]);
  assert.equal(stocuri.reduce((a, b) => a + b, 0), 15);
});

test("titlul combinatiei se pastreaza, ca vanzarea sa stie ce marime sa scada", () => {
  const s = deriveVariantSlots(produsCuMarimi);
  assert.deepEqual(s.map((x) => x.variantTitle), ["S", "M", "L"]);
  // Produsul fara variante n-are nicio combinatie de potrivit: `null`, nu eticheta.
  assert.equal(deriveVariantSlots(produs)[0].variantTitle, null);
});

test("stocul viu al combinatiei bate numarul scris o data in editor", () => {
  // Numarul din editor e o fotografie care nu se mai misca; stocul combinatiei
  // se schimba la fiecare vanzare.
  assert.equal(resolveVariantQuantity(produsCuMarimi, 99, false, false, 5), 5);
  // Fara stoc pe combinatie, numarul din editor ramane valabil.
  assert.equal(resolveVariantQuantity(produsCuMarimi, 99, false, false, null), 99);
  // `forceZero` bate tot: asa se scoate un produs din vanzare la ei.
  assert.equal(resolveVariantQuantity(produsCuMarimi, 99, false, true, 5), 0);
});

// ── Loturi ────────────────────────────────────────────────────────────────────
test("un lot pe care Trendyol nu-l mai recunoaste NU e un lot reusit", () => {
  /*
   * Peste patru ore, `batch-requests` raspunde HTTP 200 cu plicul intreg si
   * TOATE campurile pe `null`. Citit ca „nu e FAILED, deci a mers", produsele
   * erau marcate „create pe Trendyol" fara sa fi ajuns vreodata acolo — si nimic
   * nu le mai reincerca, fiindca lotul se inchidea ca reusit.
   */
  assert.equal(stareLot({ status: null, itemCount: null, batchRequestType: null, items: [] }), "necunoscut");
  assert.equal(stareLot(null), "necunoscut");
  assert.equal(stareLot({ status: "COMPLETED", itemCount: 3, items: [] }), "gata");
  assert.equal(stareLot({ status: "FAILED", itemCount: 3, items: [] }), "gata");
  assert.equal(stareLot({ status: "IN_PROGRESS", itemCount: 3, items: [] }), "in_lucru");
});

test("un lot cu substanta dar fara `status` NU se blocheaza", () => {
  /*
   * Garda de mai sus era cat pe ce sa opreasca TOATE loturile de stoc: un
   * raspuns care raporteaza `itemCount` si articole terminale, dar caruia ii
   * lipseste campul `status`, ar fi fost reincercat de sase ori si apoi inchis
   * ca esuat — desi reusise. Nicio impingere de stoc nu s-ar mai fi confirmat.
   */
  assert.equal(stareLot({ itemCount: 1, batchRequestType: "ProductInventoryUpdate", items: [{ status: "SUCCESS" }] }), "gata");
  assert.equal(stareLot({ itemCount: 1, batchRequestType: "ProductInventoryUpdate", items: [{ status: "IN_PROGRESS" }] }), "in_lucru");
  // Dar plicul cu adevarat gol ramane necunoscut — asa raspunde Trendyol la un
  // lot pe care nu-l mai stie, iar acela nu are voie sa treaca drept succes.
  assert.equal(stareLot({ items: [] }), "necunoscut");
});

test("barcode-ul articolului se citeste in ambele forme", () => {
  // `ProductV2OnBoarding` il invele in `product`; loturile de stoc il trimit direct.
  assert.equal(barcodeArticol({ requestItem: { product: { barcode: "AAA" } } }), "AAA");
  assert.equal(barcodeArticol({ requestItem: { barcode: "BBB" } }), "BBB");
  assert.equal(barcodeArticol({ requestItem: {} }), null);
});

// ── Coada ─────────────────────────────────────────────────────────────────────
test("un 429 sau un 503 nu arde incercarile elementului din coada", () => {
  // Cinci minute de indisponibilitate la Trendyol goleau coada definitiv.
  assert.equal(eTrecatoare(429), true);
  assert.equal(eTrecatoare(503), true);
  assert.equal(eTrecatoare(0), true);
  // Un refuz adevarat, in schimb, trebuie sa consume incercari.
  assert.equal(eTrecatoare(400), false);
  assert.equal(eTrecatoare(401), false);
  assert.equal(eTrecatoare(undefined), false);
});

test("repunerea la coada dupa un lot de stoc esuat se opreste la plafon", () => {
  /*
   * ⚠ Un contor care nu creste nu margineste nimic.
   *
   * Prima incercare tinea contorul in `trendyol_sync_queue`. Dar randul de acolo
   * se sterge in clipa in care Trendyol raspunde 200 la impingere — si 200
   * inseamna doar „primit", nu „aplicat". Esecul apare abia in lot, cand randul
   * nu mai exista, deci contorul se citea MEREU ca zero: impinge, esueaza,
   * repune, impinge, la nesfarsit, cate doua apeluri pe minut pentru fiecare
   * produs otravit, pana cand coada magazinului nu mai avea loc de altceva.
   */
  const listari = [
    { product_id: "p-nou", inventory_retries: 0 },
    { product_id: "p-la-mijloc", inventory_retries: MAX_REPUNERI_STOC - 1 },
    { product_id: "p-epuizat", inventory_retries: MAX_REPUNERI_STOC },
    { product_id: "p-peste", inventory_retries: MAX_REPUNERI_STOC + 5 },
    // Listare fara produs in Edinio: n-are ce repune la coada.
    { product_id: null, inventory_retries: 0 },
  ];
  assert.deepEqual(listariDeRepus(listari).map((l) => l.product_id), ["p-nou", "p-la-mijloc"]);
  // Si, cel mai important: plafonul chiar SE ATINGE. Un contor blocat pe zero ar
  // trece toate cele cinci si bucla ar fi tot infinita.
  assert.equal(listariDeRepus(listari.map((l) => ({ ...l, inventory_retries: 0 }))).length, 4);
});

test("doua atribute cu ACELASI nume se deosebesc, nu se repeta", () => {
  /*
   * Categoria „Genți de umăr" (971) cere de doua ori „Culoare", verificat pe
   * API-ul real: id 47 — text liber, `slicer`, culoarea dupa care Trendyol
   * grupeaza variantele pe pagina lor; id 348 — aleasa din 26 de valori
   * standard, folosita la filtrele lor. Sunt lucruri diferite si obligatorii
   * amandoua, dar afisate identic pareau un camp desenat de doua ori.
   */
  const lipsa = [
    { attributeId: 47, nume: "Culoare", acceptaTextLiber: true },
    { attributeId: 348, nume: "Culoare", acceptaTextLiber: false },
    { attributeId: 338, nume: "Mărime", acceptaTextLiber: false },
  ];
  const m = mesajAtributeLipsa(lipsa);
  assert.ok(m.includes("Culoare (scrisă de tine)"), m);
  assert.ok(m.includes("Culoare (din lista Trendyol)"), m);
  // „Mărime" apare o singura data in categorie, deci ramane neatins.
  assert.ok(m.includes("Mărime") && !m.includes("Mărime ("), m);
  // Si nu mai apare nicaieri „Culoare si Culoare".
  assert.equal(/Culoare(?!\s\()/.test(m.replace(/Culoare \([^)]*\)/g, "")), false, m);
});

// ── Comenzi ───────────────────────────────────────────────────────────────────
test("pachetul spart (UnPacked) e terminal, altfel stocul se consuma de doua ori", () => {
  /*
   * Cand Trendyol imparte o comanda in mai multe colete, pachetul initial trece
   * pe `UnPacked` si se creeaza altele noi PENTRU ACELEASI LINII. Netratat ca
   * terminal, pachetul mort ramanea activ si liniile lui scadeau marfa a doua oara.
   */
  assert.equal(edinioStatusForTrendyol("UnPacked"), "cancelled");
  assert.equal(edinioStatusForTrendyol("Cancelled"), "cancelled");
  assert.equal(edinioStatusForTrendyol("Delivered"), "delivered");
  assert.equal(edinioStatusForTrendyol("Shipped"), "shipped");
});

// ── Atribute obligatorii ──────────────────────────────────────────────────────
test("atributele obligatorii se verifica pe TOATE variantele, nu doar pe prima", () => {
  /*
   * Verificarea rula pe `items[0]`. Dar tocmai atributele `varianter` — marimea
   * si culoarea — sunt cele care difera intre variante: prima putea fi completa
   * si a treia goala, produsul trecea de garda noastra si era respins pe lot.
   */
  const aleCategoriei = [
    { attribute: { id: 47, name: "Culoare" }, required: true, varianter: true },
    { attribute: { id: 338, name: "Material" }, required: true },
  ];
  const articole = [
    { barcode: "A", attributes: [{ attributeId: 47, attributeValueId: 1 }, { attributeId: 338, attributeValueId: 9 }] },
    { barcode: "B", attributes: [{ attributeId: 338, attributeValueId: 9 }] },
  ];
  const lipsa = atributeLipsaPeVariante(aleCategoriei, articole);
  assert.equal(lipsa.length, 1);
  assert.equal(lipsa[0].nume, "Culoare");
  assert.equal(lipsa[0].varianta, "B");
  // Prima varianta singura ar fi trecut curat — exact defectul.
  assert.equal(atributeLipsaPeVariante(aleCategoriei, [articole[0]]).length, 0);
});
