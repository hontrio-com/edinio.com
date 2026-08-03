import assert from "node:assert/strict";
import { computeVat, vatBase } from "@/lib/utils/vat";
import { test } from "node:test";
import {
  cheieLinie,
  esteLinieExtra,
  planificaAdaugarea,
  poateContopi,
  recalculeazaTotal,
  slabesteVariante,
  sumaExtraoptiunilor,
  variantsDinSlim,
  type CatalogEdit,
  type LinieComanda,
} from "./edit-pricing";
import { aplicaBumpPeOBucata, type BumpItem } from "@/lib/offers/bump-pricing";
import { pretPeTrepte, construiesteTrepte } from "@/lib/storefront/quantity-tiers";

/**
 * Editarea comenzii din panou incaseaza bani reali: un produs variabil adaugat
 * la pretul de baza pierde 281 de lei pe bucata si trimite coletul fara marime,
 * iar doua linii lipite la coada in loc de un pachet contopit incaseaza 254,97
 * acolo unde pagina promite 250,00.
 */

const trepteMokka = { enabled: true, mode: "fixed", tier2_price: 170, tier3_price: 250 };

const simplu = (over: Partial<CatalogEdit> = {}): CatalogEdit => ({
  name: "Produs simplu",
  price: 100,
  is_bundle: false,
  variante: null,
  trepte: null,
  ...over,
});

const variabil = (over: Partial<CatalogEdit> = {}): CatalogEdit => ({
  name: "ANTIFOANE INT UF REFILL",
  price: 156.8,
  is_bundle: false,
  variante: {
    options: [{ id: "o1", name: "Marime", values: ["S", "M"] }],
    combos: [
      { title: "S", price: 438, stock: null },
      { title: "M", price: 460, stock: 2 },
    ],
  },
  trepte: null,
  ...over,
});

const catalogCu = (intrari: [string, CatalogEdit][]) => new Map(intrari);

const linie = (over: Partial<LinieComanda> = {}): Record<string, unknown> => ({
  product_id: "p1",
  name: "Produs simplu",
  price: 100,
  quantity: 1,
  ...over,
});

function plan(prev: unknown[], adaugari: Parameters<typeof planificaAdaugarea>[1], catalog: Map<string, CatalogEdit>) {
  const r = planificaAdaugarea(prev, adaugari, catalog);
  assert.ok(!("error" in r), `plan esuat: ${"error" in r ? r.error : ""}`);
  return r;
}

// ── 4a: produsele variabile ──────────────────────────────────────────────────

test("produs variabil fara varianta: REFUZAT, nu pretuit la baza", () => {
  const r = planificaAdaugarea([], [{ product_id: "p1", quantity: 1 }], catalogCu([["p1", variabil()]]));
  assert.ok("error" in r);
  assert.match(r.error, /are variante/);
});

test("varianta inexistenta sau stinsa: REFUZATA, nu cade pe pretul de baza", () => {
  const r = planificaAdaugarea(
    [], [{ product_id: "p1", variant_title: "XXL", quantity: 1 }], catalogCu([["p1", variabil()]]),
  );
  assert.ok("error" in r);
  assert.match(r.error, /nu mai este disponibila/);
});

test("produs variabil cu zero combinatii active: eroare proprie, nu pret de baza", () => {
  const gol = variabil({ variante: { options: [{ id: "o1", name: "Marime", values: ["S"] }], combos: [] } });
  const r = planificaAdaugarea([], [{ product_id: "p1", variant_title: "S", quantity: 1 }], catalogCu([["p1", gol]]));
  assert.ok("error" in r);
  assert.match(r.error, /niciuna nu este activa/);
});

test("varianta trimisa pe un produs fara variante: REFUZATA", () => {
  const r = planificaAdaugarea(
    [], [{ product_id: "p1", variant_title: "S", quantity: 1 }], catalogCu([["p1", simplu()]]),
  );
  assert.ok("error" in r);
  assert.match(r.error, /nu are variante/);
});

test("pretul liniei e al combinatiei, iar numele poarta titlul", () => {
  const r = plan([], [{ product_id: "p1", variant_title: "S", quantity: 1 }], catalogCu([["p1", variabil()]]));
  const l = r.items[0] as LinieComanda;
  // 438,00, nu 156,80: exact cei 281,20 lei pe bucata din audit.
  assert.equal(l.price, 438);
  assert.equal(l.name, "ANTIFOANE INT UF REFILL (S)");
  assert.equal(r.deltaSubtotal, 438);
});

test("doua marimi ale aceluiasi produs sunt doua linii, nu una cu cantitate dubla", () => {
  const r = plan([], [
    { product_id: "p1", variant_title: "S", quantity: 1 },
    { product_id: "p1", variant_title: "M", quantity: 1 },
  ], catalogCu([["p1", variabil()]]));
  assert.equal(r.items.length, 2);
  assert.equal(r.deltaSubtotal, 898);
  assert.deepEqual(r.adaugate.map((a) => a.variant_title), ["S", "M"]);
});

test("aceeasi marime ceruta de doua ori se aduna intr-o linie", () => {
  const r = plan([], [
    { product_id: "p1", variant_title: "S", quantity: 1 },
    { product_id: "p1", variant_title: "S", quantity: 2 },
  ], catalogCu([["p1", variabil()]]));
  assert.equal(r.items.length, 1);
  assert.equal((r.items[0] as LinieComanda).quantity, 3);
});

// ── 4b: treptele de cantitate si contopirea ──────────────────────────────────

test("treptele se aplica pe cantitatea adaugata", () => {
  const cat = simplu({ name: "Asten Fallen Angel", price: 84.99, trepte: trepteMokka });
  const r = plan([], [{ product_id: "p1", quantity: 3 }], catalogCu([["p1", cat]]));
  assert.equal(r.deltaSubtotal, 250);
});

test("pret x cantitate da exact subtotalul pachetului (unitar NEROTUNJIT)", () => {
  const cat = simplu({ price: 84.99, trepte: trepteMokka });
  const r = plan([], [{ product_id: "p1", quantity: 3 }], catalogCu([["p1", cat]]));
  const l = r.items[0] as LinieComanda;
  assert.equal(Math.round(l.price * l.quantity * 100) / 100, 250);
  // Rotunjit la ban ar fi dat 249,99 si clientul ar fi platit alt total.
  assert.notEqual(l.price, Math.round(l.price * 100) / 100);
});

test("CONTOPIRE: 1 pe comanda + 2 adaugate = un pachet de 3, nu 254,97", () => {
  const cat = simplu({ name: "Asten Fallen Angel", price: 84.99, trepte: trepteMokka });
  const prev = [linie({ name: "Asten Fallen Angel", price: 84.99, quantity: 1 })];
  const r = plan(prev, [{ product_id: "p1", quantity: 2 }], catalogCu([["p1", cat]]));
  assert.equal(r.items.length, 1, "trebuie sa ramana o singura linie");
  const l = r.items[0] as LinieComanda;
  assert.equal(l.quantity, 3);
  assert.equal(Math.round(l.price * l.quantity * 100) / 100, 250);
  // Subtotalul creste doar cu diferenta pana la pachet, nu cu 2 x 84,99.
  assert.equal(r.deltaSubtotal, 165.01);
});

test("linia de pachet scrisa de comanda directa se contopeste si ea", () => {
  // Un pachet de doua bucati la 10,45 lei inseamna 5,225 pe bucata. Rotunjit la
  // 5,23 — cum facea `placeOrder` — sta la exact o jumatate de ban de pretul din
  // catalog, adica taman pe pragul tolerantei: la o proba, unul din zece pachete
  // de doua cadea dincolo, dupa cum pica ultimul bit. O linie cazuta nu se mai
  // contopeste, deci comerciantul primea doua linii lipite in loc de pachet.
  const cat = simplu({ name: "Prosop", price: 6, trepte: { enabled: true, mode: "fixed", tier2_price: 10.45 } });
  assert.equal(poateContopi([linie({ name: "Prosop", price: 10.45 / 2, quantity: 2 })], "p1", cat), true);
  assert.equal(
    poateContopi([linie({ name: "Prosop", price: 5.23, quantity: 2 })], "p1", cat), true,
    "comenzile scrise INAINTE de reparatie poarta pretul rotunjit si trebuie sa se contopeasca si ele",
  );
  // Si valoarea taiata in jos (5,22 — asa rotunjeste `toFixed`, spre deosebire
  // de `Math.round`), fiindca sta tot la o jumatate de ban.
  assert.equal(poateContopi([linie({ name: "Prosop", price: 5.22, quantity: 2 })], "p1", cat), true);
  // Dar un ban intreg mai jos nu mai e pretul catalogului: acolo a fost un bump.
  assert.equal(poateContopi([linie({ name: "Prosop", price: 5.21, quantity: 2 })], "p1", cat), false);
});

test("contopirea hraneste stocul doar cu cantitatea ADAUGATA", () => {
  const cat = simplu({ price: 84.99, trepte: trepteMokka });
  const prev = [linie({ price: 84.99, quantity: 1 })];
  const r = plan(prev, [{ product_id: "p1", quantity: 2 }], catalogCu([["p1", cat]]));
  assert.deepEqual(r.adaugate, [{ product_id: "p1", variant_title: null, quantity: 2 }]);
});

test("o linie de treapta e tot autoritara, deci se contopeste", () => {
  const cat = simplu({ price: 84.99, trepte: trepteMokka });
  const unitDeTreapta = pretPeTrepte(construiesteTrepte(trepteMokka, 84.99), 2, 84.99).unitPrice;
  const prev = [linie({ price: unitDeTreapta, quantity: 2 })];
  assert.ok(poateContopi(prev, "p1", cat));
  const r = plan(prev, [{ product_id: "p1", quantity: 1 }], catalogCu([["p1", cat]]));
  assert.equal(r.items.length, 1);
  assert.equal(Math.round((r.items[0] as LinieComanda).price * 3 * 100) / 100, 250);
});

// ── Non-contopire, cate un test pe fiecare motiv ─────────────────────────────

test("NU se contopeste o pereche de bump (doua linii, acelasi produs si nume)", () => {
  const cat = simplu();
  const l: BumpItem = { product_id: "p1", name: "Produs simplu", price: 100, quantity: 3 };
  const linii: BumpItem[] = [l];
  aplicaBumpPeOBucata(linii, l, 60);
  assert.equal(linii.length, 2, "premisa: bump-ul chiar sparge linia");
  assert.equal(poateContopi(linii, "p1", cat), false);
  const r = plan(linii as unknown[], [{ product_id: "p1", quantity: 1 }], catalogCu([["p1", cat]]));
  assert.equal(r.items.length, 3);
  // Linia de bump ramane la 60: repretuirea ar fi urcat-o inapoi la 100.
  assert.equal((r.items[1] as LinieComanda).price, 60);
});

test("NU se contopeste o linie de bump ramasa singura (pret sub catalog)", () => {
  const cat = simplu();
  const l: BumpItem = { product_id: "p1", name: "Produs simplu", price: 100, quantity: 1 };
  const linii: BumpItem[] = [l];
  aplicaBumpPeOBucata(linii, l, 60);
  assert.equal(linii.length, 1);
  assert.equal(poateContopi(linii, "p1", cat), false);
});

test("NU se contopeste o linie de varianta", () => {
  const cat = variabil();
  const prev = [linie({ name: "ANTIFOANE INT UF REFILL (S)", price: 438, quantity: 1 })];
  assert.equal(poateContopi(prev, "p1", cat, "S"), false);
  const r = plan(prev, [{ product_id: "p1", variant_title: "S", quantity: 1 }], catalogCu([["p1", cat]]));
  assert.equal(r.items.length, 2);
});

test("NU se contopeste un pachet", () => {
  const cat = simplu({ is_bundle: true });
  const prev = [linie()];
  assert.equal(poateContopi(prev, "p1", cat), false);
});

test("NU se contopeste o linie vanduta la pretul de acum trei luni", () => {
  // „Apa Termala 300ml Byphasse": vanduta cu 42, catalogul de azi zice 52,43.
  const cat = simplu({ name: "Apa Termala 300ml Byphasse", price: 52.43 });
  const prev = [linie({ name: "Apa Termala 300ml Byphasse", price: 42, quantity: 1 })];
  assert.equal(poateContopi(prev, "p1", cat), false);
  const r = plan(prev, [{ product_id: "p1", quantity: 1 }], catalogCu([["p1", cat]]));
  assert.equal(r.items.length, 2);
  assert.equal((r.items[0] as LinieComanda).price, 42, "linia veche ramane la pretul ei");
  assert.equal(r.deltaSubtotal, 52.43);
});

test("NU se contopeste cand produsul a fost redenumit intre timp", () => {
  const cat = simplu({ name: "Produs simplu v2" });
  const prev = [linie({ name: "Produs simplu" })];
  assert.equal(poateContopi(prev, "p1", cat), false);
});

test("NU se contopeste cand produsul apare pe doua linii", () => {
  const cat = simplu();
  const prev = [linie(), linie({ quantity: 2 })];
  assert.equal(poateContopi(prev, "p1", cat), false);
});

// ── Invariante ───────────────────────────────────────────────────────────────

test("contopirea poate doar sa scada totalul, niciodata sa il urce", () => {
  const cat = simplu({ price: 84.99, trepte: trepteMokka });
  const trepte = construiesteTrepte(trepteMokka, 84.99);
  for (let existent = 1; existent <= 6; existent++) {
    for (let adaugat = 1; adaugat <= 6; adaugat++) {
      const prev = [linie({ price: 84.99, quantity: existent })];
      const r = plan(prev, [{ product_id: "p1", quantity: adaugat }], catalogCu([["p1", cat]]));
      const separat = pretPeTrepte(trepte, adaugat, 84.99).subtotal;
      assert.ok(
        r.deltaSubtotal <= separat + 0.005,
        `${existent}+${adaugat}: contopit ${r.deltaSubtotal} > separat ${separat}`,
      );
      assert.ok(r.deltaSubtotal >= 0, `${existent}+${adaugat}: subtotalul a scazut`);
    }
  }
});

test("suma liniilor non-extra creste exact cu deltaSubtotal", () => {
  const cat = simplu({ price: 84.99, trepte: trepteMokka });
  const prev = [linie({ price: 84.99, quantity: 1 }), { product_id: "extra_x", name: "Ambalaj", price: 10, quantity: 1 }];
  const sumaMarfa = (items: unknown[]) => Math.round(items
    .map((i) => i as LinieComanda)
    .filter((i) => !esteLinieExtra(i))
    .reduce((s, i) => s + i.price * i.quantity, 0) * 100) / 100;
  const inainte = sumaMarfa(prev);
  const r = plan(prev, [{ product_id: "p1", quantity: 2 }], catalogCu([["p1", cat]]));
  assert.equal(Math.round((sumaMarfa(r.items) - inainte) * 100) / 100, r.deltaSubtotal);
});

test("zero adaugari nu schimba nimic", () => {
  const prev = [linie(), { product_id: "extra_x", name: "Ambalaj", price: 10, quantity: 1 }];
  const r = plan(prev, [], catalogCu([["p1", simplu()]]));
  assert.equal(r.deltaSubtotal, 0);
  assert.deepEqual(r.items, prev);
  assert.deepEqual(r.adaugate, []);
});

test("liniile de extraoptiuni raman neatinse si in afara subtotalului", () => {
  const extra = { product_id: "extra_amb", name: "Ambalaj cadou", price: 15, quantity: 1 };
  const prev = [linie(), extra];
  const r = plan(prev, [{ product_id: "p1", quantity: 1 }], catalogCu([["p1", simplu()]]));
  assert.deepEqual(r.items[1], extra);
  assert.equal(sumaExtraoptiunilor(r.items), 15);
  // Extraoptiunea nu se contopeste si nu intra in delta.
  assert.equal(r.deltaSubtotal, 100);
});

test("liniile de marketplace fara product_id sunt tolerate", () => {
  const prev = [{ product_id: null, name: "Articol Trendyol", price: 50, quantity: 1 }];
  const r = plan(prev, [{ product_id: "p1", quantity: 1 }], catalogCu([["p1", simplu()]]));
  assert.equal(r.items.length, 2);
  assert.equal(r.deltaSubtotal, 100);
});

test("produs disparut din catalog: eroare, nu linie fara pret", () => {
  const r = planificaAdaugarea([], [{ product_id: "fantoma", quantity: 1 }], catalogCu([]));
  assert.ok("error" in r);
});

test("cantitatile invalide se ignora, nu se prabusesc", () => {
  const r = plan([], [
    { product_id: "p1", quantity: 0 },
    { product_id: "p1", quantity: -3 },
    { product_id: "p1", quantity: Number.NaN },
  ], catalogCu([["p1", simplu()]]));
  assert.equal(r.items.length, 0);
  assert.equal(r.deltaSubtotal, 0);
});

// ── recalculeazaTotal: aceeasi formula pe server si in previzualizare ────────

const fara = { vat_enabled: false, vat_rate: 0, prices_include_vat: true };

test("pragul de livrare gratuita se reevalueaza dupa adaugare", () => {
  // Comanda #0065: subtotal 108, prag 150, transport 20. Modalul arata 193, serverul scria 173.
  const r = recalculeazaTotal({
    subtotal: 158, extras: 0, discount: 0, cardDiscount: 0, codDiscount: 0, codFee: 0,
    shipping: 20, freeShippingThreshold: 150, vat: fara,
  });
  assert.equal(r.shipping, 0);
  assert.equal(r.total, 158);
});

test("sub prag, transportul ramane", () => {
  const r = recalculeazaTotal({
    subtotal: 108, extras: 0, discount: 0, cardDiscount: 0, codDiscount: 0, codFee: 0,
    shipping: 20, freeShippingThreshold: 150, vat: fara,
  });
  assert.equal(r.shipping, 20);
  assert.equal(r.total, 128);
});

test("magazin cu preturi fara TVA: taxa se adauga peste, pe baza de dupa reducere", () => {
  const r = recalculeazaTotal({
    subtotal: 100, extras: 0, discount: 20, cardDiscount: 0, codDiscount: 0, codFee: 0,
    shipping: 0, freeShippingThreshold: null,
    vat: { vat_enabled: true, vat_rate: 19, prices_include_vat: false },
  });
  assert.equal(r.vatAmount, 15.2);
  assert.equal(r.total, 95.2);
});

test("magazin cu preturi cu TVA: totalul nu se misca, doar se arata cota", () => {
  const r = recalculeazaTotal({
    subtotal: 100, extras: 0, discount: 0, cardDiscount: 0, codDiscount: 0, codFee: 0,
    shipping: 0, freeShippingThreshold: null,
    vat: { vat_enabled: true, vat_rate: 21, prices_include_vat: true },
  });
  assert.equal(r.total, 100);
  assert.equal(r.vatAmount, 17.36);
});

test("taxa de ramburs intra in total si in baza de TVA", () => {
  const r = recalculeazaTotal({
    subtotal: 100, extras: 0, discount: 0, cardDiscount: 0, codDiscount: 0, codFee: 10,
    shipping: 0, freeShippingThreshold: null,
    vat: { vat_enabled: true, vat_rate: 19, prices_include_vat: false },
  });
  assert.equal(r.vatAmount, 20.9);
  assert.equal(r.total, 130.9);
});

test("totalul nu coboara sub zero", () => {
  const r = recalculeazaTotal({
    subtotal: 10, extras: 0, discount: 100, cardDiscount: 0, codDiscount: 0, codFee: 0,
    shipping: 0, freeShippingThreshold: null, vat: fara,
  });
  assert.equal(r.total, 0);
});

test("serverul si previzualizarea dau acelasi numar pentru aceleasi intrari", () => {
  // Comparatia era functia pura cu ea insasi, deci trecea orice s-ar fi schimbat
  // in ea. Acum se compara cu formula scrisa de mana, aceeasi pe care o compun
  // cele doua formulare din magazin: daca una din ele apuca pe alt drum, pica.
  const intrare = {
    subtotal: 187.53, extras: 12.5, discount: 20, cardDiscount: 5, codDiscount: 0, codFee: 7.5,
    shipping: 19.99, freeShippingThreshold: 300,
    vat: { vat_enabled: true, vat_rate: 21, prices_include_vat: false },
  };
  const r = recalculeazaTotal(intrare);

  const baza = vatBase({
    goods: intrare.subtotal, extras: intrare.extras, shipping: intrare.shipping,
    discount: intrare.discount, cardDiscount: intrare.cardDiscount,
    codDiscount: intrare.codDiscount, codFee: intrare.codFee,
  });
  const { vatAmount, vatAddOn } = computeVat(baza, intrare.vat);
  const total = Math.round((intrare.subtotal + intrare.extras - intrare.discount - intrare.cardDiscount
    - intrare.codDiscount + intrare.codFee + intrare.shipping + vatAddOn) * 100) / 100;

  assert.equal(r.shipping, 19.99, "sub prag, transportul ramane");
  assert.equal(r.vatAmount, vatAmount);
  assert.equal(r.total, total);
});

// ── Slabirea variantelor ─────────────────────────────────────────────────────

test("slabirea pastreaza PRIMA combinatie la titluri duplicate", () => {
  // GEACA VISION de la eSAFE: „NEGRU / L" apare de doua ori, cu 203 si cu 231.
  const ps = {
    variants: {
      enabled: true,
      options: [{ id: "o1", name: "Culoare", values: ["NEGRU"] }, { id: "o2", name: "Marime", values: ["L"] }],
      combinations: [
        { id: "a", title: "NEGRU / L", price: "203", enabled: true, stock_quantity: "5", sku: "", compare_at_price: "", image: "" },
        { id: "b", title: "NEGRU / L", price: "231", enabled: true, stock_quantity: "1", sku: "", compare_at_price: "", image: "" },
      ],
    },
  };
  const slim = slabesteVariante(ps, 180);
  assert.equal(slim?.combos.length, 1);
  assert.equal(slim?.combos[0].price, 203);
  assert.equal(slim?.combos[0].stock, 5);
});

test("combinatiile stinse nu ajung in panou", () => {
  const ps = {
    variants: {
      enabled: true,
      options: [{ id: "o1", name: "Marime", values: ["S", "M"] }],
      combinations: [
        { id: "a", title: "S", price: "100", enabled: true, stock_quantity: "", sku: "", compare_at_price: "", image: "" },
        { id: "b", title: "M", price: "120", enabled: false, stock_quantity: "", sku: "", compare_at_price: "", image: "" },
      ],
    },
  };
  assert.deepEqual(slabesteVariante(ps, 90)?.combos.map((c) => c.title), ["S"]);
});

test("combinatia fara pret propriu mosteneste pretul de baza", () => {
  const ps = {
    variants: {
      enabled: true,
      options: [{ id: "o1", name: "Marime", values: ["S"] }],
      combinations: [{ id: "a", title: "S", price: "", enabled: true, stock_quantity: "", sku: "", compare_at_price: "", image: "" }],
    },
  };
  assert.equal(slabesteVariante(ps, 90)?.combos[0].price, 90);
});

test("produsul fara variante da null", () => {
  assert.equal(slabesteVariante({}, 90), null);
  assert.equal(slabesteVariante(null, 90), null);
});

test("forma slabita se reface in VariantsData pentru VariantPicker", () => {
  const slim = { options: [{ id: "o1", name: "Marime", values: ["S", "M"] }], combos: [{ title: "S", price: 100, stock: null }, { title: "M", price: 120, stock: 0 }] };
  const v = variantsDinSlim(slim);
  assert.equal(v.combinations.length, 2);
  assert.ok(v.combinations.every((c) => c.enabled));
  // Stocul nedeclarat ramane sir gol (= „nu tin socoteala"), zero ramane „0".
  assert.equal(v.combinations[0].stock_quantity, "");
  assert.equal(v.combinations[1].stock_quantity, "0");
});

test("cheia de linie desparte marimile aceluiasi produs", () => {
  assert.notEqual(cheieLinie("p1", "S"), cheieLinie("p1", "M"));
  assert.equal(cheieLinie("p1"), cheieLinie("p1", null));
});

test("NU se contopeste o linie personalizata: gravura clientului nu se intinde peste bucati noi", () => {
  const cat = simplu();
  const prev = [{
    ...linie(),
    customization: { grav: { type: "text", label: "Gravura", value: "Pentru Ana" } },
  }];
  assert.equal(poateContopi(prev, "p1", cat), false);
  const r = plan(prev, [{ product_id: "p1", quantity: 2 }], catalogCu([["p1", simplu()]]));
  assert.equal(r.items.length, 2);
  assert.deepEqual(r.items[0], prev[0], "linia personalizata ramane neatinsa");
});

test("NU se contopeste o linie de marketplace cu sku sau barcode", () => {
  const cat = simplu();
  assert.equal(poateContopi([{ ...linie(), sku: "AY-123" }], "p1", cat), false);
  assert.equal(poateContopi([{ ...linie(), barcode: "8690000000000" }], "p1", cat), false);
});

// ── Ce a scos la iveala verificarea adversa ──────────────────────────────────

test("peste 500 de bucati contopirea NU repretuieste in sus bucatile existente", () => {
  // `pretPeTrepte` renunta la pachete peste 500 de bucati si intoarce pretul
  // intreg: contopite, cele 300 de bucati luate cu 83,33 ar fi sarit la 100.
  const cat = simplu({ price: 100, trepte: { enabled: true, mode: "fixed", tier2_price: 170, tier3_price: 250 } });
  const unit = pretPeTrepte(construiesteTrepte(cat.trepte, 100), 300, 100).unitPrice;
  const prev = [linie({ price: unit, quantity: 300 })];
  const vechiSubtotal = Math.round(unit * 300 * 100) / 100;
  const r = plan(prev, [{ product_id: "p1", quantity: 250 }], catalogCu([["p1", cat]]));
  const separat = pretPeTrepte(construiesteTrepte(cat.trepte, 100), 250, 100).subtotal;
  assert.ok(r.deltaSubtotal <= separat + 0.005, `delta ${r.deltaSubtotal} > separat ${separat}`);
  assert.equal(r.items.length, 2, "linia trebuie sa plece separat, nu contopita");
  assert.equal(Math.round((r.items[0] as LinieComanda).price * 300 * 100) / 100, vechiSubtotal,
    "linia veche ramane la pretul ei");
});

test("invariantul de nescumpire tine si peste pragul de 500", () => {
  const cat = simplu({ price: 100, trepte: { enabled: true, mode: "fixed", tier2_price: 170, tier3_price: 250 } });
  const trepte = construiesteTrepte(cat.trepte, 100);
  for (const [existent, adaugat] of [[490, 20], [499, 1], [300, 250], [250, 250], [480, 30]]) {
    const unit = pretPeTrepte(trepte, existent, 100).unitPrice;
    const r = plan([linie({ price: unit, quantity: existent })], [{ product_id: "p1", quantity: adaugat }], catalogCu([["p1", cat]]));
    const separat = pretPeTrepte(trepte, adaugat, 100).subtotal;
    assert.ok(r.deltaSubtotal <= separat + 0.005, `${existent}+${adaugat}: ${r.deltaSubtotal} > ${separat}`);
  }
});

test("contributia fiecarei linii se aduna exact la deltaSubtotal", () => {
  const cat = simplu({ name: "Asten Fallen Angel", price: 84.99, trepte: trepteMokka });
  const prev = [linie({ name: "Asten Fallen Angel", price: 84.99, quantity: 1 })];
  const r = plan(prev, [{ product_id: "p1", quantity: 2 }], catalogCu([["p1", cat]]));
  const sumaContributiilor = Math.round(Object.values(r.contributii).reduce((s, v) => s + v, 0) * 100) / 100;
  assert.equal(sumaContributiilor, r.deltaSubtotal);
  // Contopirea: contributia e cresterea reala (165,01), nu 2 x 84,99 = 169,98.
  assert.equal(r.contributii[cheieLinie("p1", null)], 165.01);
});

test("contributia unei linii de pachet e subtotalul pachetului, nu pret x cantitate", () => {
  const cat = simplu({ price: 84.99, trepte: trepteMokka });
  const r = plan([], [{ product_id: "p1", quantity: 3 }], catalogCu([["p1", cat]]));
  assert.equal(r.contributii[cheieLinie("p1", null)], 250);
});

/* ─── Transportul in baza de TVA, si la editare ───────────────────────────── */

test("editarea: transportul isi poarta TVA-ul, la preturi fara TVA", () => {
  // Cazul eSAFE, refacut din panou: 500 marfa + 45 transport, cota 21.
  const r = recalculeazaTotal({
    subtotal: 500, extras: 0, discount: 0, cardDiscount: 0, codDiscount: 0, codFee: 0,
    shipping: 45, freeShippingThreshold: 999,
    vat: { vat_enabled: true, vat_rate: 21, prices_include_vat: false },
  });
  assert.equal(r.shipping, 45);
  assert.equal(r.vatAmount, 114.45);
  assert.equal(r.total, 659.45);
});

test("editarea: la preturi cu TVA inclus totalul nu se misca, doar TVA-ul inregistrat", () => {
  // O comanda veche editata pentru un fleac nu are voie sa-si schimbe pretul.
  const r = recalculeazaTotal({
    subtotal: 40, extras: 0, discount: 0, cardDiscount: 0, codDiscount: 0, codFee: 0,
    shipping: 20, freeShippingThreshold: null,
    vat: { vat_enabled: true, vat_rate: 21, prices_include_vat: true },
  });
  assert.equal(r.total, 60);
  assert.equal(r.vatAmount, 10.41);
});

test("editarea: trecerea pragului scoate si TVA-ul transportului", () => {
  const sub = recalculeazaTotal({
    subtotal: 900, extras: 0, discount: 0, cardDiscount: 0, codDiscount: 0, codFee: 0,
    shipping: 45, freeShippingThreshold: 999,
    vat: { vat_enabled: true, vat_rate: 21, prices_include_vat: false },
  });
  const peste = recalculeazaTotal({
    subtotal: 1000, extras: 0, discount: 0, cardDiscount: 0, codDiscount: 0, codFee: 0,
    shipping: 45, freeShippingThreshold: 999,
    vat: { vat_enabled: true, vat_rate: 21, prices_include_vat: false },
  });
  assert.equal(sub.vatAmount, 198.45, "945 x 21%");
  assert.equal(peste.shipping, 0);
  assert.equal(peste.vatAmount, 210, "1000 x 21%, fara transport");
});
