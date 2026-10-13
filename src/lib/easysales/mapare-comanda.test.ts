import { test } from "node:test";
import assert from "node:assert/strict";
import { JUDETE, codAutoAlJudetului } from "@/lib/ro/judete";
import {
  construiesteComanda, dataLaEi, modulDePlata, adresaDeLivrare,
  type ArticolLinie, type ComandaPentruEasySales, type MagazinPentruEasySales,
} from "./mapare-comanda";

/*
 * Maparea comenzii spre `POST /orders/save`, probata pe VALORI: ce pleaca la ei, la ban.
 */

const MAGAZIN: MagazinPentruEasySales = {
  vat_enabled: true, vat_rate: 21, prices_include_vat: true,
  serieFacturi: "", campuriCheckout: [], variantaTotal: "incasat",
};

function comanda(p: Partial<ComandaPentruEasySales> = {}): ComandaPentruEasySales {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    order_number: "1001",
    created_at: "2026-10-13T10:00:00Z",
    customer_name: "Roxana Mihai",
    customer_email: "roxana@example.com",
    customer_phone: "+40 722 851 129",
    billing_company: null,
    items: [],
    shipping_address: { county: "Calarasi", city: "Călărași", address: "Str Parcului bloc K5", courier: "sameday", courier_label: "Sameday", delivery_type: "address" },
    shipping_cost: 0,
    discount_amount: 0,
    discount_code: null,
    card_discount_amount: 0,
    cod_discount_amount: 0,
    cod_fee_amount: 0,
    vat_rate: 21,
    vat_amount: 0,
    prices_include_vat: true,
    total: 0,
    payment_method: "cash_on_delivery",
    notes: null,
    ...p,
  };
}

const ART = (id: number, sku: string, nelegata = false): ArticolLinie => ({ productWebsiteId: id, sku, nelegata });

function gata(r: ReturnType<typeof construiesteComanda>) {
  assert.equal(r.fel, "gata", r.fel === "refuz" ? `${r.motiv}: ${r.mesaj}` : "");
  return r as Extract<typeof r, { fel: "gata" }>;
}

test("exemplul Save din colectie se reface la zecimala: 279 + 15,90 la 21% dau netul lor", () => {
  const r = gata(construiesteComanda(comanda({
    items: [
      { product_id: "p1", name: "Kendama Krom Sticky Dark Blue", price: 279, quantity: 1 },
      { product_id: "p2", name: "Set ata kendama 3 buc cu rulment", price: 15.9, quantity: 1 },
    ],
    total: 294.9,
  }), MAGAZIN, [ART(149003, "PL-DB"), ART(190792, "00016")], 1000000001));
  const [a, b] = r.order.order_products;
  assert.equal(a.total, 230.578512);
  assert.equal(a.price, 230.578512);
  assert.equal(b.total, 13.140496);
  assert.equal(a.tax, 21);
  assert.equal(a.product_website_id, 149003);
  assert.equal(r.order.order_total, 294.9);
  assert.equal(r.order.order_id, 1000000001);
  assert.equal(r.order.status, 1);
  assert.equal(r.order.currency, "RON");
  assert.equal(r.order.payment_mode, 2);
  assert.deepEqual(r.order.shipment, { tax: 21, price_with_tax: 0 });
  assert.equal(r.order.total_vouchers, 0);
  assert.deepEqual(r.order.vouchers, []);
  assert.equal(r.order.shipping_address.county, "CL");
  assert.equal(r.order.shipping_address.phone, "0722851129");
  assert.equal(r.garda.fel, "exact");
});

test("ramburs + extraoptiune + cupon + taxa de ramburs: fiecare la locul lui, iar suma da totalul", () => {
  // marfa 2 x 100, extra 10, transport 20, cupon 30, taxa ramburs 5 -> 205
  const r = gata(construiesteComanda(comanda({
    items: [
      { product_id: "p1", name: "Cana", price: 100, quantity: 2 },
      { product_id: "extra_cadou", name: "Ambalare cadou", price: 10, quantity: 1 },
    ],
    shipping_cost: 20, discount_amount: 30, discount_code: "TOAMNA", cod_fee_amount: 5, total: 205,
  }), MAGAZIN, [ART(1000000010, "CANA-1"), null], 1000000002));
  assert.equal(r.order.order_products.length, 1, "extraoptiunea NU e produs");
  assert.deepEqual(r.order.fees, [
    { name: "Ambalare cadou", tax: 21, price_with_tax: 10 },
    { name: "Taxă ramburs", tax: 21, price_with_tax: 5 },
  ]);
  assert.deepEqual(r.order.vouchers, [{ name: "Cupon TOAMNA", tax: 21, price_with_tax: -30 }]);
  assert.equal(r.order.total_vouchers, -30);
  assert.deepEqual(r.order.shipment, { tax: 21, price_with_tax: 20 });
  assert.equal(r.order.order_total, 205, "varianta implicita: ce plateste cumparatorul");
  assert.notEqual(r.garda.fel, "refuz");

  // varianta din definitia lor: liniile brute + transportul, fara taxe si reduceri
  const d = gata(construiesteComanda(comanda({
    items: [
      { product_id: "p1", name: "Cana", price: 100, quantity: 2 },
      { product_id: "extra_cadou", name: "Ambalare cadou", price: 10, quantity: 1 },
    ],
    shipping_cost: 20, discount_amount: 30, cod_fee_amount: 5, total: 205,
  }), { ...MAGAZIN, variantaTotal: "definitie" }, [ART(1000000010, "CANA-1"), null], 1000000002));
  assert.equal(d.order.order_total, 220);
});

test("reducerea la plata online si cea la ramburs devin vouchere, fara reducerea din oferte", () => {
  const r = gata(construiesteComanda(comanda({
    payment_method: "netopia",
    items: [{ product_id: "p1", name: "Cana", price: 100, quantity: 1 }],
    card_discount_amount: 5, total: 95,
  }), MAGAZIN, [ART(1, "C")], 1000000003));
  assert.equal(r.order.payment_mode, 1);
  assert.deepEqual(r.order.vouchers, [{ name: "Reducere plată online", tax: 21, price_with_tax: -5 }]);
  assert.equal(r.order.total_vouchers, -5);
});

test("magazin cu preturi FARA TVA: sumele pleaca `price_without_tax`, iar totalul cu TVA se potriveste", () => {
  // net: 100 + transport 10 = 110; TVA 21% = 23,10; total 133,10
  const r = gata(construiesteComanda(comanda({
    prices_include_vat: false,
    items: [{ product_id: "p1", name: "Cana", price: 100, quantity: 1 }],
    shipping_cost: 10, vat_amount: 23.1, total: 133.1,
  }), { ...MAGAZIN, prices_include_vat: false }, [ART(1, "C")], 1000000004));
  assert.equal(r.order.order_products[0].price, 100);
  assert.equal(r.order.order_products[0].tax, 21);
  assert.deepEqual(r.order.shipment, { tax: 21, price_without_tax: 10 });
  assert.equal(r.order.order_total, 133.1);
  assert.equal(r.garda.fel, "exact");
});

test("neplatitor de TVA: cota 0 pe toate liniile, chiar cu 19 ramas implicit in setari", () => {
  const r = gata(construiesteComanda(comanda({
    vat_rate: 19,
    items: [{ product_id: "p1", name: "Cana", price: 50, quantity: 2 }],
    shipping_cost: 15, total: 115,
  }), { ...MAGAZIN, vat_enabled: false, vat_rate: 19 }, [ART(1, "C")], 1000000005));
  assert.equal(r.order.order_products[0].tax, 0);
  assert.equal(r.order.order_products[0].price, 50);
  assert.equal(r.order.order_products[0].total, 100);
  assert.deepEqual(r.order.shipment, { tax: 0, price_with_tax: 15 });
});

test("50 de bucati la 6,705 (pret de pachet, nerotunjit): garda nu refuza, iar brutul se reface", () => {
  const r = gata(construiesteComanda(comanda({
    items: [{ product_id: "p1", name: "Pachet", price: 6.705, quantity: 50 }],
    total: 335.25,
  }), MAGAZIN, [ART(1, "PCH")], 1000000006));
  const l = r.order.order_products[0];
  assert.equal(Math.round(l.total * 1.21 * 100) / 100, 335.25);
  assert.notEqual(r.garda.fel, "refuz");
});

test("⚠ comanda care nu se aduna (liniile 63,99 pe un total de 71,63) NU pleaca", () => {
  const r = construiesteComanda(comanda({
    items: [{ product_id: "p1", name: "Produs", price: 63.99, quantity: 1 }],
    total: 71.63,
  }), MAGAZIN, [ART(1, "P")], 1000000007);
  assert.equal(r.fel, "refuz");
  assert.equal(r.fel === "refuz" && r.motiv, "sume");
});

test("cote amestecate: refuz, fiindca transportul lor are o singura cota", () => {
  const r = construiesteComanda(comanda({
    items: [
      { product_id: "p1", name: "Paine", price: 10, quantity: 1, vat_rate: 11 },
      { product_id: "p2", name: "Cana", price: 10, quantity: 1, vat_rate: 21 },
    ],
    total: 20,
  }), MAGAZIN, [ART(1, "A"), ART(2, "B")], 1000000008);
  assert.equal(r.fel === "refuz" && r.motiv, "cote_amestecate");
});

test("o linie de marfa fara articol nu pleaca; o metoda de plata necunoscuta nu se ghiceste", () => {
  const a = construiesteComanda(comanda({ items: [{ product_id: "p1", name: "X", price: 1, quantity: 1 }], total: 1 }), MAGAZIN, [null], 1);
  assert.equal(a.fel === "refuz" && a.motiv, "linie_fara_articol");
  const b = construiesteComanda(comanda({ payment_method: "bitcoin", items: [{ product_id: "p1", name: "X", price: 1, quantity: 1 }], total: 1 }), MAGAZIN, [ART(1, "X")], 1);
  assert.equal(b.fel === "refuz" && b.motiv, "plata_necunoscuta");
  const c = construiesteComanda(comanda({ items: [{ product_id: "p1", name: "X", price: 1, quantity: 0 }], total: 0 }), MAGAZIN, [ART(1, "X")], 1);
  assert.equal(c.fel === "refuz" && c.motiv, "cantitate_invalida");
  const d = construiesteComanda(comanda({ items: [{ product_id: "extra_x", name: "X", price: 1, quantity: 1 }], total: 1 }), MAGAZIN, [null], 1);
  assert.equal(d.fel === "refuz" && d.motiv, "fara_linii");
});

test("metoda de plata: harta intreaga", () => {
  assert.equal(modulDePlata("cash_on_delivery"), 2);
  assert.equal(modulDePlata("ramburs"), 2);
  assert.equal(modulDePlata("bank_transfer"), 3);
  for (const m of ["stripe", "netopia", "revolut", "ipay", "klarna"]) assert.equal(modulDePlata(m), 1, m);
  assert.equal(modulDePlata(""), null);
  assert.equal(modulDePlata(null), null);
  assert.equal(modulDePlata("emag"), null);
});

test("data comenzii in ora Romaniei, vara si iarna, fara `24:`", () => {
  assert.equal(dataLaEi("2026-10-13T10:00:00Z"), "2026-10-13 13:00:00");
  assert.equal(dataLaEi("2026-01-15T10:00:00Z"), "2026-01-15 12:00:00");
  assert.equal(dataLaEi("2026-10-13T21:30:05Z"), "2026-10-14 00:30:05");
  assert.equal(dataLaEi("nu e data"), null);
});

test("Bucuresti: judetul `B`, orasul `Bucuresti`, sectorul in strada, oricum ar fi fost scris", () => {
  const av: string[] = [];
  const a = adresaDeLivrare({ county: "Municipiul Bucuresti", city: "Sector 3", address: "Bd Unirii 1" }, "Ion", "07", av);
  assert.equal(a.county, "B");
  assert.equal(a.city, "Bucuresti");
  assert.equal(a.street, "Bd Unirii 1, Sector 3");
  const b = adresaDeLivrare({ county: "Sectorul 6", city: "Bucuresti", address: "Str X, sector 6" }, "Ion", "07", av);
  assert.equal(b.county, "B");
  assert.equal(b.street, "Str X, sector 6", "sectorul deja scris nu se dubleaza");
  assert.deepEqual(av, []);
  const c = adresaDeLivrare({ county: "Nicaieri", city: "X", address: "Y" }, "Ion", "07", av);
  assert.equal(c.county, "Nicaieri");
  assert.equal(av.length, 1);
  const d = adresaDeLivrare({ county: "Ilfov", city: "Voluntari", address: "Z", country: "ro", postal_code: " 077 190 " }, "Ion", "07", []);
  assert.equal(d.country, "RO");
  assert.equal(d.postal_code, "077190");
});

test("cele 42 de coduri ale noastre sunt EXACT lista lor (`general-data/countries/175/counties`)", () => {
  /* Raspunsul exemplului din colectie [A], copiat ca date. */
  const ale_lor = ["AB", "AR", "AG", "BC", "BH", "BN", "BT", "BV", "BR", "B", "BZ", "CS", "CL", "CJ", "CT", "CV", "DB", "DJ", "GL", "GR", "GJ", "HR", "HD", "IL", "IS", "IF", "MM", "MH", "MS", "NT", "OT", "PH", "SM", "SJ", "SB", "SV", "TR", "TM", "TL", "VS", "VL", "VN"];
  const ale_noastre = JUDETE.map((j) => codAutoAlJudetului(j));
  assert.ok(ale_noastre.every((c) => c !== null), "fiecare judet al formularului are cod");
  assert.deepEqual([...new Set(ale_noastre)].sort(), [...ale_lor].sort());
});

test("persoana juridica: CUI-ul fara RO, steagul de platitor si adresa FISCALA pe facturare", () => {
  const r = gata(construiesteComanda(comanda({
    billing_company: { cui: "18547290", company_name: "Firma Test SRL", reg_com: "J40/1/2020", address: "Str Fiscala 2", city: "Cluj-Napoca", county: "Cluj", vat_payer: true, verified: true },
    items: [{ product_id: "p1", name: "Cana", price: 10, quantity: 1 }], total: 10,
  }), MAGAZIN, [ART(1, "C")], 1));
  assert.equal(r.order.customer.legal_entity, 1);
  assert.equal(r.order.customer.vat_id, "18547290");
  assert.equal(r.order.customer.vat_payer, 1);
  assert.equal(r.order.customer.company_name, "Firma Test SRL");
  assert.equal(r.order.customer.name, "Roxana Mihai", "persoana de contact ramane");
  assert.equal(r.order.billing_address.county, "CJ");
  assert.equal(r.order.billing_address.street, "Str Fiscala 2");
  assert.equal(r.order.shipping_address.county, "CL", "livrarea ramane la adresa de livrare");
});

test("fara email nu se inventeaza unul; observatiile poarta campurile de checkout si personalizarea", () => {
  const r = gata(construiesteComanda(comanda({
    customer_email: null,
    notes: JSON.stringify({ cf_1: "Langa scoala" }),
    items: [{ product_id: "p1", name: "Cana", price: 10, quantity: 1, customization: { nume: { type: "text", label: "Nume", value: "Ana" } } }],
    total: 10,
  }), { ...MAGAZIN, campuriCheckout: [{ id: "cf_1", label: "Punct reper" }] }, [ART(1, "C", true)], 1));
  assert.equal("email" in r.order.customer, false);
  assert.match(r.order.observations, /Punct reper: Langa scoala/);
  assert.match(r.order.observations, /Cana: Nume = Ana/);
  assert.match(r.order.observations, /Linii nelegate de catalog .*Cana \(C\)/);
  assert.equal(r.order.delivery_notes, "Curier ales de client: Sameday");
});

test("nicio sumă trimisă nu are mai mult de sase zecimale, iar sumele de bani au doua", () => {
  const r = gata(construiesteComanda(comanda({
    items: [{ product_id: "p1", name: "X", price: 33.33, quantity: 3 }],
    shipping_cost: 17.99, discount_amount: 3.33, total: 114.65,
  }), MAGAZIN, [ART(1, "X")], 1));
  const zecimale = (n: number) => (String(n).split(".")[1] ?? "").length;
  for (const p of r.order.order_products) {
    assert.ok(zecimale(p.price) <= 6 && zecimale(p.total) <= 6);
  }
  assert.ok(zecimale(r.order.shipment.price_with_tax!) <= 2);
  assert.ok(zecimale(r.order.order_total) <= 2);
});

test("data comenzii in zilele de schimbare a orei (ultima duminica din martie si din octombrie)", () => {
  /* 29.03.2026: la 03:00 ora Romaniei sare la 04:00 (UTC+2 -> UTC+3). */
  assert.equal(dataLaEi("2026-03-29T00:59:59Z"), "2026-03-29 02:59:59");
  assert.equal(dataLaEi("2026-03-29T01:00:00Z"), "2026-03-29 04:00:00");
  /* 25.10.2026: la 04:00 ora Romaniei se intoarce la 03:00 (UTC+3 -> UTC+2). */
  assert.equal(dataLaEi("2026-10-25T00:59:59Z"), "2026-10-25 03:59:59");
  assert.equal(dataLaEi("2026-10-25T01:00:00Z"), "2026-10-25 03:00:00");
});

test("⚠ rotunjirea, ban cu ban, la 21% si la 11%: brutul refacut din netul trimis e chiar ce s-a incasat", () => {
  /*
   * Liniile pleaca NETE, cu sase zecimale. Daca ei refac brutul pe linie (`total_with_tax`,
   * „rounded with 2 decimals" [A]), suma trebuie sa fie fix cea incasata cu cardul. Proba trece prin
   * mii de comenzi generate determinist: preturi de doi bani, cantitati de la 1 la 60, transport,
   * reducere si taxa de ramburs.
   */
  let semanta = 20261013;
  const urmator = () => (semanta = (semanta * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (const cota of [21, 11]) {
    for (let k = 0; k < 2000; k++) {
      const linii = Array.from({ length: 1 + Math.floor(urmator() * 4) }, (_, i) => ({
        product_id: `p${i}`, name: `P${i}`,
        price: Math.round((0.5 + urmator() * 400) * 100) / 100,
        quantity: 1 + Math.floor(urmator() * 60),
      }));
      const marfa = Math.round(linii.reduce((s, l) => s + l.price * l.quantity, 0) * 100) / 100;
      const transport = urmator() < 0.5 ? 0 : Math.round(urmator() * 3000) / 100;
      const reducere = urmator() < 0.7 ? 0 : Math.min(marfa, Math.round(urmator() * 5000) / 100);
      const taxa = urmator() < 0.7 ? 0 : 5;
      const total = Math.round((marfa + transport - reducere + taxa) * 100) / 100;
      const r = construiesteComanda(comanda({
        vat_rate: cota, items: linii, shipping_cost: transport, discount_amount: reducere, cod_fee_amount: taxa, total,
      }), { ...MAGAZIN, vat_rate: cota }, linii.map((_, i) => ART(i + 1, `S${i}`)), 1);
      assert.equal(r.fel, "gata", `cota ${cota}, comanda ${k}: ${r.fel === "refuz" ? r.mesaj : ""}`);
      if (r.fel !== "gata") return;
      const bruteLinii = r.order.order_products.reduce((s, p) => s + Math.round(p.total * (1 + p.tax / 100) * 100), 0);
      const fees = r.order.fees.reduce((s, f) => s + Math.round((f.price_with_tax ?? 0) * 100), 0);
      const vouchers = r.order.vouchers.reduce((s, v) => s + Math.round((v.price_with_tax ?? 0) * 100), 0);
      const transportBani = Math.round((r.order.shipment.price_with_tax ?? 0) * 100);
      assert.equal(bruteLinii + transportBani + fees + vouchers, Math.round(total * 100), `cota ${cota}, comanda ${k}`);
    }
  }
});
