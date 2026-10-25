import test from "node:test";
import assert from "node:assert/strict";
import { magazinPentruHontrio, type RandMagazin } from "./magazin";

const BIZ: RandMagazin = {
  id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  slug: "magazin-test",
  custom_domain: "magazin.ro",
  store_name: "Magazin Test",
  business_name: "Test SRL",
  is_published: true,
};

const SETARI = {
  currency: "eur",
  prices_include_vat: true,
  google_merchant_config: {
    connected: true, account_id: "123456", account_name: "Contul meu", feed_label: "RO",
    content_language: "ro", country: "ro",
    /* ⚠ Secrete: in vedere stau decriptate, si n-au voie sa plece. */
    refresh_token: "1//REFRESH-GMC-SECRET", connected_email: "proprietar@exemplu.ro",
  },
  marketing_config: { google_tag_id: "G-ABC123", google_ads_conversion_id: "AW-111222333", google_ads_conversion_label: "AbC-xyz_1" },
  google_analytics_config: {
    connected: true, measurement_id: "G-MEAS123", property_id: "999", refresh_token: "1//REFRESH-GA-SECRET",
    api_secret: "MP-SECRET-123", connected_email: "proprietar@exemplu.ro",
  },
};

test("⚠ niciun secret Google si nicio adresa de email nu pleaca spre Hontrio", () => {
  const tot = JSON.stringify(magazinPentruHontrio(BIZ, SETARI));
  for (const secret of ["REFRESH-GMC-SECRET", "REFRESH-GA-SECRET", "MP-SECRET-123", "proprietar@exemplu.ro"]) {
    assert.ok(!tot.includes(secret), `„${secret}” a plecat spre Hontrio`);
  }
});

test("magazinul, cu ce are deja legat la Google", () => {
  const m = magazinPentruHontrio(BIZ, SETARI);
  assert.equal(m.nume, "Magazin Test");
  assert.equal(m.url, "https://magazin.ro");
  assert.equal(m.moneda, "EUR");
  assert.equal(m.tara, "RO");
  assert.equal(m.limba, "ro");
  assert.equal(m.fus_orar, "Europe/Bucharest");
  assert.deepEqual(m.google_merchant, {
    conectat: true, cont_id: "123456", nume_cont: "Contul meu", tara: "RO", limba: "ro", eticheta_feed: "RO",
  });
  assert.deepEqual(m.google_ads, { tag_id: "G-ABC123", conversie_id: "AW-111222333", conversie_eticheta: "AbC-xyz_1" });
  assert.deepEqual(m.google_analytics, { masurare_id: "G-MEAS123" });
});

test("⚠ conversia Ads e numai `AW-`: un tag GA4 nu e un cont de Ads, ca in vitrina", () => {
  const m = magazinPentruHontrio(BIZ, { ...SETARI, marketing_config: { google_tag_id: "G-ABC123" } });
  assert.deepEqual(m.google_ads, { tag_id: "G-ABC123", conversie_id: null, conversie_eticheta: null });
  const vechi = magazinPentruHontrio(BIZ, { ...SETARI, marketing_config: { google_tag_id: "AW-5550001", google_ads_conversion_label: "et-1" } });
  assert.equal(vechi.google_ads?.conversie_id, "AW-5550001", "magazinele configurate inainte de campul separat");
});

test("magazinul fara setari si fara Google: valorile Edinio, nimic inventat", () => {
  const m = magazinPentruHontrio({ ...BIZ, custom_domain: null, store_name: " " }, null);
  assert.equal(m.nume, "Test SRL");
  assert.equal(m.url, "https://www.edinio.com/magazin-test");
  assert.equal(m.moneda, "RON");
  assert.equal(m.tara, "RO");
  assert.equal(m.preturi_cu_tva, true);
  assert.equal(m.google_merchant, null);
  assert.equal(m.google_ads, null);
  assert.equal(m.google_analytics, null);
});

test("Analytics oprit din vitrina nu se anunta ca masurare", () => {
  const m = magazinPentruHontrio(BIZ, { ...SETARI, google_analytics_config: { connected: true, measurement_id: "G-X", tracking_enabled: false } });
  assert.equal(m.google_analytics, null);
});
