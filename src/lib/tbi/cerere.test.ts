import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  construiesteCererea, imparteNumele, inBani, potrivesteLiniile, sumaArticolelor, telefonRomanesc,
  type ComandaPentruTbi, type ProdusPentruTbi,
} from "./cerere";

const CFG = { store_id: "magazin_ro", username: "user", password: "Parola123", promo: false, categorie: "1" };

function comanda(p: Partial<ComandaPentruTbi> = {}): ComandaPentruTbi {
  return {
    id: "0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e",
    order_number: "#0042",
    total: 1600,
    items: [{ name: "Ceas smartwatch", price: 1600, quantity: 1, product_id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d" }],
    shipping_cost: 0,
    customer_name: "Ion Popescu",
    customer_email: "ion@example.com",
    customer_phone: "+40 752 000 000",
    shipping_address: { address: "Str. Exemplu 1", city: "Sector 3", county: "Bucuresti" },
    ...p,
  };
}

const cerere = (c: ComandaPentruTbi, produse = new Map<string, ProdusPentruTbi>()) =>
  construiesteCererea({ comanda: c, cfg: CFG, idCerere: 700000001, adresaInapoi: "https://www.edinio.com/api/tbi/notificare/x", produse });

test("✅ forma lor: cheile in ordinea exemplelor, `order_id` text, totalul cu doua zecimale", () => {
  const r = cerere(comanda());
  assert.deepEqual(Object.keys(r), ["store_id", "order_id", "back_ref", "order_total", "username", "password", "customer", "items"]);
  assert.deepEqual(Object.keys(r.customer), [
    "fname", "lname", "cnp", "email", "phone", "billing_address", "billing_city", "billing_county",
    "shipping_address", "shipping_city", "shipping_county", "promo",
  ]);
  assert.deepEqual(Object.keys(r.items[0]), ["name", "qty", "price", "category", "sku", "ImageLink"]);
  assert.equal(r.order_id, "700000001");
  assert.equal(r.order_total, "1600.00");
  assert.equal(r.customer.promo, 0);
  assert.equal(r.customer.cnp, "");
  assert.equal(r.items[0].qty, "1");
  assert.equal(r.items[0].price, 1600);
  assert.equal(r.items[0].category, "1");
});

test("promo si categoria vin din configurare", () => {
  const r = construiesteCererea({
    comanda: comanda(), cfg: { ...CFG, promo: true, categorie: "8" }, idCerere: 1, adresaInapoi: "https://x", produse: new Map(),
  });
  assert.equal(r.customer.promo, 1);
  assert.equal(r.items[0].category, "8");
});

describe("⚠⚠ articolele aduna EXACT totalul finantat", () => {
  const cazuri: [string, Partial<ComandaPentruTbi>][] = [
    ["fara diferente", {}],
    ["cu transport", { total: 1620, shipping_cost: 20 }],
    ["cupon pe marfa (transportul ramane cum l-a vazut omul)", {
      total: 1460, shipping_cost: 20,
      items: [{ name: "A", price: 1000, quantity: 1, product_id: "p1" }, { name: "B", price: 300, quantity: 2, product_id: "p2" }],
    }],
    ["preturi fara TVA: totalul are TVA-ul adaugat", {
      total: 1904, shipping_cost: 0,
      items: [{ name: "A", price: 800, quantity: 2, product_id: "p1" }],
    }],
    ["cantitati mari care nu se impart frumos", {
      total: 999.99, shipping_cost: 0,
      items: [{ name: "A", price: 333.37, quantity: 3, product_id: "p1" }],
    }],
    ["mai multe linii cu cantitati si transport", {
      total: 2777.77, shipping_cost: 19.99,
      items: [
        { name: "A", price: 499.99, quantity: 3, product_id: "p1" },
        { name: "B", price: 89.9, quantity: 7, product_id: "p2" },
        { name: "C", price: 0, quantity: 1, product_id: "p3" },
      ],
    }],
    ["comanda fara linii", { total: 450, items: [] }],
  ];
  for (const [nume, p] of cazuri) {
    test(nume, () => {
      const r = cerere(comanda(p));
      assert.equal(sumaArticolelor(r), inBani(p.total ?? 1600));
      for (const a of r.items) {
        assert.ok(a.price > 0, `pret nepozitiv pe „${a.name}”`);
        assert.ok(Number.isInteger(Math.round(a.price * 100)) && Math.abs(a.price * 100 - Math.round(a.price * 100)) < 1e-6, `pretul „${a.name}” are mai mult de doua zecimale`);
        assert.ok(Number.isInteger(Number(a.qty)) && Number(a.qty) >= 1);
      }
    });
  }

  test("⚠ la cupon, transportul ramane neatins si reducerea cade pe marfa", () => {
    const r = cerere(comanda({
      total: 1220, shipping_cost: 20,
      items: [{ name: "A", price: 1300, quantity: 1, product_id: "p1" }],
    }));
    const t = r.items.find((a) => a.name === "Transport");
    assert.equal(t?.price, 20);
    assert.equal(r.items.find((a) => a.name === "A")?.price, 1200);
  });

  test("potrivirea in BigInt nu pierde bani pe sume foarte mari", () => {
    const linii = [{ nume: "A", cantitate: 1, bani: 3_000_000_000, sku: "A", imagine: "" }, { nume: "B", cantitate: 7, bani: 7 * 123_456_789, sku: "B", imagine: "" }];
    const tinta = 3_500_000_003;
    const iesire = potrivesteLiniile(linii, tinta);
    assert.equal(iesire.reduce((s, l) => s + l.bani, 0), tinta);
    for (const l of iesire) assert.equal(l.bani % l.cantitate, 0);
  });

  test("restul care nu se imparte pe cantitati merge pe o linie „Ajustare” numai cand nu exista linie de 1", () => {
    const iesire = potrivesteLiniile([{ nume: "A", cantitate: 3, bani: 3000, sku: "A", imagine: "" }], 2999);
    assert.equal(iesire.reduce((s, l) => s + l.bani, 0), 2999);
    assert.ok(iesire.some((l) => l.nume === "Ajustare"));
  });
});

test("sku si imaginea vin din catalog; o imagine care nu e https nu pleaca", () => {
  const produse = new Map<string, ProdusPentruTbi>([
    ["a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", { sku: "DTZ1MCBBM", imagine: "https://cdn.exemplu.ro/ceas.jpg" }],
  ]);
  const r = cerere(comanda(), produse);
  assert.equal(r.items[0].sku, "DTZ1MCBBM");
  assert.equal(r.items[0].ImageLink, "https://cdn.exemplu.ro/ceas.jpg");
  const r2 = cerere(comanda(), new Map([["a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", { sku: null, imagine: "javascript:alert(1)" }]]));
  assert.equal(r2.items[0].ImageLink, "");
  assert.equal(r2.items[0].sku, "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d");
});

test("telefonul in forma romaneasca a exemplelor lor", () => {
  assert.equal(telefonRomanesc("+40 752 000 000"), "0752000000");
  assert.equal(telefonRomanesc("0040752000000"), "0752000000");
  assert.equal(telefonRomanesc("40752000000"), "0752000000");
  assert.equal(telefonRomanesc("0752-000-000"), "0752000000");
  assert.equal(telefonRomanesc("752000000"), "0752000000");
  assert.equal(telefonRomanesc("+359 88 123 4567"), "+359881234567");
});

test("numele: primul cuvant e prenumele; un singur cuvant merge in amandoua", () => {
  assert.deepEqual(imparteNumele("Ion Popescu"), { fname: "Ion", lname: "Popescu" });
  assert.deepEqual(imparteNumele("  Maria   Ana  Ionescu "), { fname: "Maria", lname: "Ana Ionescu" });
  assert.deepEqual(imparteNumele("Cher"), { fname: "Cher", lname: "Cher" });
  assert.deepEqual(imparteNumele(""), { fname: "", lname: "" });
});

test("facturarea e adresa de livrare (plata in rate e doar pentru persoane fizice)", () => {
  const r = cerere(comanda());
  assert.equal(r.customer.billing_address, "Str. Exemplu 1");
  assert.equal(r.customer.billing_city, "Sector 3");
  assert.equal(r.customer.billing_county, "Bucuresti");
  assert.equal(r.customer.shipping_city, "Sector 3");
});
