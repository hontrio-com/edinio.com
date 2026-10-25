import test from "node:test";
import assert from "node:assert/strict";
import { comandaPentruHontrio, type RandComanda } from "./comenzi";
import { offerIdVarianta } from "@/lib/google-merchant/id-oferta";

const GEACA = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const CANA = "12345678-1234-1234-1234-123456789012";
const STERS = "99999999-9999-9999-9999-999999999999";

const combo = (id: string, title: string, enabled = true) => ({
  id, title, price: "", compare_at_price: "", sku: "", stock_quantity: "", image: "", enabled,
});
const VARIANTE_GEACA = {
  enabled: true,
  options: [{ name: "Mărime", values: ["S", "XS", "XL"] }],
  combinations: [combo("s", "S"), combo("xs", "XS"), combo("xl", "XL", false)],
};

/** Variantele citite din `page_sections->variants`: cana e simpla, produsul STERS lipseste din harta. */
const VARIANTE = new Map<string, unknown>([[GEACA, VARIANTE_GEACA], [CANA, null]]);

function rand(peste: Partial<RandComanda> = {}): RandComanda {
  return {
    id: "0f0f0f0f-0000-0000-0000-000000000001",
    order_number: "EDN-1001",
    created_at: "2026-10-25T10:00:00+00:00",
    updated_at: "2026-10-25T11:00:00+00:00",
    status: "confirmed",
    payment_status: "unpaid",
    payment_method: "cod",
    items: [
      { product_id: GEACA, name: "GEACA (XS)", price: 199.9, quantity: 1 },
      { product_id: CANA, name: "Cana", price: 30, quantity: 2 },
      { product_id: "extra_ambalaj", name: "Ambalaj cadou", price: 5, quantity: 1 },
    ],
    subtotal: 264.9,
    shipping_cost: 15,
    discount_amount: 10,
    offer_discount_amount: 0,
    card_discount_amount: 0,
    cod_discount_amount: 0,
    cod_fee_amount: 4.99,
    vat_amount: 45.67,
    total: 274.89,
    discount_code: "VARA10",
    order_source: {
      utm_source: "google", utm_medium: "cpc", utm_campaign: "hontrio-pmax", gclid: "Cj0KCQ-test",
      landing: "/produs/geaca", captured_at: "2026-10-25T09:58:00Z", consimtamant_marketing: "da",
      /* ⚠ Toate astea exista in baza, si niciuna nu are voie sa plece. */
      user_agent: "Mozilla/5.0 (Windows NT 10.0)", client_ip: "203.0.113.7", ga_client_id: "123.456",
      fbp: "fb.1.2.3", fbc: "fb.1.2.abc", ttp: "ttp-1", ga_sesiuni: "G-1=GS1",
    },
    tara: null,
    ...peste,
  };
}

test("⚠ din sursa pleaca numai atribuirea: nimic din ce identifica un om sau un browser", () => {
  const c = comandaPentruHontrio(rand(), VARIANTE, "RON");
  assert.deepEqual(c.sursa, {
    utm_source: "google", utm_medium: "cpc", utm_campaign: "hontrio-pmax", gclid: "Cj0KCQ-test",
    landing: "/produs/geaca", captured_at: "2026-10-25T09:58:00Z", consimtamant_marketing: "da",
  });
  const tot = JSON.stringify(c);
  for (const secret of ["Mozilla", "203.0.113.7", "123.456", "fb.1.2", "ttp-1", "GS1"]) {
    assert.ok(!tot.includes(secret), `„${secret}” a plecat spre Hontrio`);
  }
});

test("linia cu varianta: oferta EXACTA, din coada numelui, ca pe pagina de confirmare", () => {
  const [geaca] = comandaPentruHontrio(rand(), VARIANTE, "RON").linii;
  assert.equal(geaca.produs_id, GEACA);
  assert.equal(geaca.varianta, "XS");
  assert.equal(geaca.oferta_id, offerIdVarianta(GEACA, combo("xs", "XS")));
  assert.equal(geaca.cantitate, 1);
  assert.equal(geaca.pret, 199.9);
});

test("`variant_title` scris pe linie (comenzile de marketplace) castiga peste nume", () => {
  const c = comandaPentruHontrio(rand({ items: [{ product_id: GEACA, name: "GEACA", variant_title: "S", price: 10, quantity: 1 }] }), VARIANTE, "RON");
  assert.equal(c.linii[0].oferta_id, offerIdVarianta(GEACA, combo("s", "S")));
});

test("⚠ combinatia stinsa sau negasita: oferta NU se ghiceste, ramane doar produsul", () => {
  const c = comandaPentruHontrio(rand({ items: [
    { product_id: GEACA, name: "GEACA (XL)", price: 10, quantity: 1 },
    { product_id: GEACA, name: "GEACA", price: 10, quantity: 1 },
  ] }), VARIANTE, "RON");
  for (const l of c.linii) {
    assert.equal(l.produs_id, GEACA);
    assert.equal(l.oferta_id, null, "ID-ul produsului e `itemGroupId`, nu o oferta: nu se trimite drept oferta");
  }
});

test("produsul simplu: oferta e chiar produsul; produsul sters: nu se mai stie", () => {
  const c = comandaPentruHontrio(rand({ items: [
    { product_id: CANA, name: "Cana", price: 30, quantity: 2 },
    { product_id: STERS, name: "Ceva sters (M)", price: 1, quantity: 1 },
  ] }), VARIANTE, "RON");
  assert.equal(c.linii[0].oferta_id, CANA);
  assert.equal(c.linii[1].produs_id, STERS);
  assert.equal(c.linii[1].oferta_id, null);
});

test("extraoptiunile si liniile de marketplace nelegate nu se dau drept produse", () => {
  const c = comandaPentruHontrio(rand({ items: [
    { product_id: "extra_ambalaj", name: "Ambalaj cadou", price: 5, quantity: 1 },
    { product_id: null, name: "Produs eMAG nemapat", price: 50, quantity: 1 },
    "gunoi",
  ] }), VARIANTE, "RON");
  assert.equal(c.linii.length, 2);
  assert.deepEqual(c.linii.map((l) => [l.produs_id, l.oferta_id, l.extra]), [[null, null, true], [null, null, false]]);
});

test("banii, starea si canalul", () => {
  const c = comandaPentruHontrio(rand(), VARIANTE, "RON");
  assert.equal(c.total, 274.89);
  assert.equal(c.transport, 15);
  assert.equal(c.reducere_cupon, 10);
  assert.equal(c.taxa_ramburs, 4.99);
  assert.equal(c.cod_reducere, "VARA10");
  assert.equal(c.stare, "confirmed");
  assert.equal(c.stare_plata, "unpaid");
  assert.equal(c.canal, "magazin");
  assert.equal(c.moneda, "RON");
  assert.equal(c.tara, "RO", "pe comenzile interne tara nici nu se scrie in adresa");
});

test("⚠ comanda de marketplace isi pastreaza canalul si moneda ei", () => {
  const c = comandaPentruHontrio(rand({ order_source: { marketplace: "pepita", currency: "huf" }, tara: "hu" }), VARIANTE, "RON");
  assert.equal(c.canal, "pepita");
  assert.equal(c.sursa.marketplace, "pepita");
  assert.equal(c.moneda, "HUF");
  assert.equal(c.tara, "HU");
});

test("o comanda fara sursa si fara linii nu cade", () => {
  const c = comandaPentruHontrio(rand({ order_source: null, items: null }), VARIANTE, "EUR");
  assert.deepEqual(c.sursa, {});
  assert.deepEqual(c.linii, []);
  assert.equal(c.moneda, "EUR");
});
