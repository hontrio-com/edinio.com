import test from "node:test";
import assert from "node:assert/strict";

import {
  bucatileDeclansatorului, pretuiesteOfertele, refuzaOferta, setulOfertei,
  TIPURI_CU_PRET, type OfertaCuReguli,
} from "./offer-pricing";
import { cosulDinLinii } from "./porti";
import {
  bucatiDeCumparat, bucatiDeOferit, cadoulSeAlege, inlocuiesteProdusul,
  parseOfferConfig, parseOfferDisplay, parseOfferTrigger, seAcceptaInFormular,
  TIPURI_DIN_FORMULAR,
  type OfferProduct, type OfferType,
} from "./offer.types";
import { liniileAcceptate, linieDeSchimbat, ofertePeCareLePoateArata } from "./linii-acceptate";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * UPGRADE, „CUMPERI X PRIMEȘTI Y” ȘI CADOUL                     (24.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Trei tipuri noi, o singură mecanică: cumpărătorul bifează în formularul de
 * comandă, browserul trimite produsul ca LINIE plus id-ul ofertei, iar serverul
 * re-judecă tot și rescrie prețul liniei.
 *
 * ⚠⚠ PROBA DE TEMELIE E PRIMA: un rând de ofertă scris ÎNAINTE de azi trebuie
 * să producă exact același jsonb și exact aceleași prețuri. Trei tipuri noi n-au
 * voie să miște niciun leu la cele 13 oferte care rulează.
 */

/* ── Unelte ─────────────────────────────────────────────────────────────── */

function oferta(
  type: OfferType,
  config: Record<string, unknown>,
  trigger: Record<string, unknown> = { scope: "all" },
  display: Record<string, unknown> = {},
): OfertaCuReguli {
  return {
    id: `id-${type}`,
    type,
    trigger: parseOfferTrigger(trigger),
    config: parseOfferConfig(config),
    display: parseOfferDisplay(display, type),
    startsAt: null,
    endsAt: null,
    priority: 0,
  };
}

function produs(id: string, price: number, extra: Partial<OfferProduct> = {}): OfferProduct {
  return {
    id, name: `Produsul ${id}`, slug: id, price, compareAtPrice: null, imageUrl: null,
    outOfStock: false, needsChoice: false, ...extra,
  };
}

const NIMIC = { ancora: null, produse: [] as { id: string; category: string | null }[], cos: cosulDinLinii([]) };

/* ══ 1. Nimic din ce exista nu se schimbă ═══════════════════════════════ */

test("⚠⚠ configurația unei oferte vechi NU capătă niciun câmp nou", () => {
  /*
   * Cele 13 oferte de pe producție au configurații de forma asta. Parserul e
   * singura poartă între jsonb și regulă, iar un câmp scris „ca să se vadă”
   * ar fi apărut pe fiecare rând la prima salvare din panou.
   */
  const vechi = { productIds: ["p1"], autoByCategory: false, maxProducts: 4, discountMode: "percent", discountPercent: 10 };
  const c = parseOfferConfig(vechi);
  assert.equal(c.inlocuieste, undefined, "schimbul se scrie DOAR când e oprit");
  assert.equal(c.cumperiBucati, undefined);
  assert.equal(c.primestiBucati, undefined);
  assert.equal(c.cadouLaAlegere, undefined);
  assert.deepEqual(Object.keys(c).sort(), ["autoByCategory", "discountMode", "discountPercent", "maxProducts", "productIds"]);
});

test("⚠ cititorii întreabă ÎNTÂI tipul: un câmp rătăcit pe alt tip nu se citește", () => {
  /*
   * `parseOfferConfig` nu primește tipul, deci scrie ce găsește. Poarta pe tip e
   * la citire — aceeași doctrină ca `cantitateaCeruta`.
   */
  const c = parseOfferConfig({ inlocuieste: false, cumperiBucati: 5, primestiBucati: 3, cadouLaAlegere: true });
  assert.equal(inlocuiesteProdusul("order_bump", c), false, "bump-ul nu schimbă nimic niciodată");
  assert.equal(inlocuiesteProdusul("upgrade", c), false, "aici chiar s-a cerut „nu schimba”");
  assert.equal(bucatiDeCumparat("order_bump", c), 0, "doar BOGO numără bucăți de cumpărat");
  assert.equal(bucatiDeOferit("order_bump", c), 1, "restul dau o bucată");
  assert.equal(bucatiDeOferit("bogo", c), 3);
  assert.equal(cadoulSeAlege("order_bump", c), false);
  assert.equal(cadoulSeAlege("gift", c), true);
});

test("⚠ lipsa câmpului la upgrade înseamnă SCHIMB, nu adăugare", () => {
  assert.equal(inlocuiesteProdusul("upgrade", parseOfferConfig({})), true);
  assert.equal(inlocuiesteProdusul("upgrade", parseOfferConfig({ inlocuieste: false })), false);
});

test("cele patru tipuri din formular au voie să schimbe prețuri, restul nu", () => {
  for (const t of TIPURI_DIN_FORMULAR) {
    assert.equal(seAcceptaInFormular(t), true, t);
    assert.ok(TIPURI_CU_PRET.includes(t), `${t} trebuie să poată repretui o linie`);
  }
  for (const t of ["cross_sell", "volume", "post_purchase", "spend_reward"] as OfferType[]) {
    assert.equal(seAcceptaInFormular(t), false, t);
    assert.ok(!TIPURI_CU_PRET.includes(t), `${t} nu are voie să schimbe un preț`);
  }
});

/* ══ 2. „Cumperi X” se numără pe declanșator, fără produsul dăruit ══════ */

test("⚠⚠ bucățile dăruite NU se numără în „cumperi X” — altfel oferta se hrănește singură", () => {
  /*
   * Declanșator „toate produsele”, cadoul e chiar în coș (la comandă el E linie,
   * fiindcă altfel n-ar avea ce revendica). Numărat cu el, un „cumperi 2” s-ar
   * fi împlinit din bucata primită gratis.
   */
  const trigger = parseOfferTrigger({ scope: "all" });
  const cos = cosulDinLinii([
    { productId: "a", quantity: 1, unitPrice: 50 },
    { productId: "cadou", quantity: 1, unitPrice: 0 },
  ]);
  const produse = [{ id: "a", category: null }, { id: "cadou", category: null }];
  assert.equal(bucatileDeclansatorului(trigger, cos, produse), 2, "fără excludere ies două");
  assert.equal(bucatileDeclansatorului(trigger, cos, produse, ["cadou"]), 1, "cu excludere, una singură");
});

test("„cumperi X” numără BUCĂȚI, nu produse deosebite, și doar pe declanșator", () => {
  const trigger = parseOfferTrigger({ scope: "products", productIds: ["a"] });
  const cos = cosulDinLinii([
    { productId: "a", quantity: 3, unitPrice: 10 },
    { productId: "b", quantity: 9, unitPrice: 10 },
  ]);
  const produse = [{ id: "a", category: null }, { id: "b", category: null }];
  assert.equal(bucatileDeclansatorului(trigger, cos, produse), 3, "b nu aprinde oferta");
});

test("pe categorii, bucățile se numără din categoriile extinse", () => {
  const trigger = parseOfferTrigger({ scope: "categories", categories: ["Creme"] });
  const cos = cosulDinLinii([{ productId: "a", quantity: 2, unitPrice: 10 }]);
  const produse = [{ id: "a", category: "Creme de fata" }];
  assert.equal(bucatileDeclansatorului(trigger, cos, produse), 0, "categoria-frunză nu e cea aleasă");
  assert.equal(
    bucatileDeclansatorului(trigger, cos, produse, [], new Set(["Creme", "Creme de fata"])),
    2,
    "cu subarborele coborât, se numără",
  );
});

test("⚠⚠ „cumperi 2” OPREȘTE oferta când coșul are una singură", () => {
  const o = oferta("bogo", { productIds: ["z"], cumperiBucati: 2, primestiBucati: 1, discountMode: "fixed_price", fixedPrice: 0 },
    { scope: "products", productIds: ["a"] });
  const ctx = {
    ancora: null,
    produse: [{ id: "a", category: null }, { id: "z", category: null }],
    cos: cosulDinLinii([{ productId: "a", quantity: 1, unitPrice: 50 }, { productId: "z", quantity: 1, unitPrice: 0 }]),
  };
  assert.equal(refuzaOferta(o, ctx, Date.now()), "prea_putine");

  const cuDoua = {
    ...ctx,
    cos: cosulDinLinii([{ productId: "a", quantity: 2, unitPrice: 50 }, { productId: "z", quantity: 1, unitPrice: 0 }]),
  };
  assert.equal(refuzaOferta(o, cuDoua, Date.now()), null);
});

/* ══ 3. Upgrade-ul cu schimb ═══════════════════════════════════════════ */

test("⚠⚠ upgrade-ul CU schimb trece fără produsul declanșator — chiar el l-a scos", () => {
  const o = oferta("upgrade", { productIds: ["mare"], discountMode: "fixed_price", fixedPrice: 89 },
    { scope: "products", productIds: ["mic"] });
  /* Comanda are doar produsul mare: cel mic a ieșit când s-a bifat schimbul. */
  const ctx = {
    ancora: null,
    produse: [{ id: "mare", category: null }],
    cos: cosulDinLinii([{ productId: "mare", quantity: 1, unitPrice: 99 }]),
  };
  assert.equal(refuzaOferta(o, ctx, Date.now()), null);
});

test("⚠ upgrade-ul FĂRĂ schimb cere declanșatorul, ca orice altă ofertă", () => {
  const o = oferta("upgrade", { productIds: ["mare"], inlocuieste: false, discountMode: "fixed_price", fixedPrice: 89 },
    { scope: "products", productIds: ["mic"] });
  const faraMic = {
    ancora: null,
    produse: [{ id: "mare", category: null }],
    cos: cosulDinLinii([{ productId: "mare", quantity: 1, unitPrice: 99 }]),
  };
  assert.equal(refuzaOferta(o, faraMic, Date.now()), "declansator");

  const cuMic = {
    ancora: null,
    produse: [{ id: "mic", category: null }, { id: "mare", category: null }],
    cos: cosulDinLinii([{ productId: "mic", quantity: 1, unitPrice: 59 }, { productId: "mare", quantity: 1, unitPrice: 99 }]),
  };
  assert.equal(refuzaOferta(o, cuMic, Date.now()), null);
});

test("un upgrade fără linie de schimbat NU se arată", () => {
  const o = {
    id: "u1", type: "upgrade" as const, title: "Treci la 100 ml", style: "card" as const,
    amplasare: "sub_produs" as const,
    products: [produs("mare", 99, { pretOferta: 89 })],
    pricing: { price: 89, compareAt: 99, savings: 10 },
    reguli: { inlocuieste: true, deSchimbat: ["mic"] },
  };
  assert.equal(ofertePeCareLePoateArata([o], [], new Set()).length, 0, "fără crema mică, nimic");
  const cuLinie = [{ key: "mic", productId: "mic", quantity: 1 }];
  assert.equal(ofertePeCareLePoateArata([o], cuLinie, new Set(["mic"])).length, 1);
  assert.equal(linieDeSchimbat(o, cuLinie)?.key, "mic");

  /*
   * ⚠⚠ OFERTA BIFATĂ ÎȘI GĂSEȘTE MAI DEPARTE LINIA. Cu o simplă mulțime de chei
   * scoase, linia ieșea și din lista în care se caută, oferta dispărea de pe
   * ecran și prețul ei nu mai intra în comandă — văzut pe ecran, în magazinul
   * demo: coșul scădea cu 49 și nu creștea cu 69.
   */
  assert.equal(linieDeSchimbat(o, cuLinie, { u1: "mic" })?.key, "mic", "e chiar linia ei");
  assert.equal(ofertePeCareLePoateArata([o], cuLinie, new Set(["mic"]), { u1: "mic" }).length, 1);

  /* ⚠ Dar linia luată de ALT upgrade nu se mai poate lua. */
  assert.equal(linieDeSchimbat(o, cuLinie, { altaOferta: "mic" }), undefined);
});

/* ══ 4. Cadoul la alegere ══════════════════════════════════════════════ */

test("⚠⚠ cadoul LA ALEGERE acceptă ORICARE dintre cele arătate, nu doar primul", () => {
  const o = { type: "gift" as OfferType, config: parseOfferConfig({ productIds: ["c1", "c2", "c3"], maxProducts: 3, cadouLaAlegere: true, discountMode: "fixed_price", fixedPrice: 0 }) };
  const candidati = [produs("c1", 30), produs("c2", 40), produs("c3", 50)];
  /* Clientul a ales al treilea: el e în comandă, ceilalți doi nu. */
  const rez = setulOfertei(o, candidati, null, new Set(["c3"]));
  assert.ok("set" in rez);
  assert.deepEqual(rez.set.map((p) => p.id), ["c1", "c2", "c3"], "toate trei rămân acceptabile");
});

test("⚠ fără alegere, cadoul se poartă ca un bump: primul care se poate da", () => {
  const o = { type: "gift" as OfferType, config: parseOfferConfig({ productIds: ["c1", "c2", "c3"], maxProducts: 3, discountMode: "fixed_price", fixedPrice: 0 }) };
  const candidati = [produs("c1", 30), produs("c2", 40), produs("c3", 50)];
  const rez = setulOfertei(o, candidati, null, new Set());
  assert.ok("set" in rez);
  assert.deepEqual(rez.set.map((p) => p.id), ["c1"]);
});

test("⚠ fereastra rămâne: al zecelea cadou dintr-o listă de zece, cu trei arătate, NU se poate cere", () => {
  const o = { type: "gift" as OfferType, config: parseOfferConfig({ productIds: ["c1", "c2", "c3", "c4"], maxProducts: 3, cadouLaAlegere: true, discountMode: "fixed_price", fixedPrice: 0 }) };
  const candidati = [produs("c1", 30), produs("c2", 40), produs("c3", 50), produs("c4", 500)];
  const rez = setulOfertei(o, candidati, null, new Set(["c4"]));
  assert.ok("set" in rez);
  assert.ok(!rez.set.some((p) => p.id === "c4"), "cel scump, de dincolo de fereastră, rămâne pe dinafară");
});

/* ══ 5. Prețul chiar scris pe linii ════════════════════════════════════ */

function liniiDe(...x: [string, number, number][]) {
  return x.map(([product_id, quantity, price]) => ({ product_id, name: product_id, quantity, price }));
}

test("⚠⚠ „cumperi 2, primești 2 gratis” ieftinește DOUĂ bucăți, nu una și nu toate", () => {
  const o = oferta("bogo", { productIds: ["z"], cumperiBucati: 2, primestiBucati: 2, discountMode: "fixed_price", fixedPrice: 0 },
    { scope: "products", productIds: ["a"] }, { surfaces: ["checkout"] });
  const linii = liniiDe(["a", 2, 50], ["z", 3, 20]);
  const rez = pretuiesteOfertele({
    oferte: [o],
    linii,
    ctx: {
      ancora: null,
      produse: [{ id: "a", category: null }, { id: "z", category: null }],
      cos: cosulDinLinii([{ productId: "a", quantity: 2, unitPrice: 50 }, { productId: "z", quantity: 3, unitPrice: 20 }]),
    },
    oferibile: new Map([["z", produs("z", 20)]]),
    ancora: { basePrice: 0, unitPrice: 0 },
    nowMs: Date.now(),
  });
  assert.deepEqual(rez.applied, [o.id]);
  /* Două bucăți de la 20 la 0 = 40 lei economie; a treia rămâne întreagă. */
  assert.equal(rez.savings, 40);
  assert.equal(rez.venitPeOferta[o.id], 0, "gratuit înseamnă venit zero, dar linia e în comandă");
  const zetele = linii.filter((l) => l.product_id === "z");
  assert.deepEqual(
    zetele.map((l) => [l.quantity, l.price]).sort(),
    [[1, 20], [2, 0]].sort(),
    "una la preț întreg, două la zero",
  );
});

test("⚠ când linia are mai puține bucăți decât dă oferta, se ieftinesc cele care sunt", () => {
  const o = oferta("bogo", { productIds: ["z"], cumperiBucati: 1, primestiBucati: 3, discountMode: "fixed_price", fixedPrice: 0 },
    { scope: "all" }, { surfaces: ["checkout"] });
  const linii = liniiDe(["a", 1, 50], ["z", 1, 20]);
  const rez = pretuiesteOfertele({
    oferte: [o],
    linii,
    ctx: {
      ancora: null,
      produse: [{ id: "a", category: null }, { id: "z", category: null }],
      cos: cosulDinLinii([{ productId: "a", quantity: 1, unitPrice: 50 }, { productId: "z", quantity: 1, unitPrice: 20 }]),
    },
    oferibile: new Map([["z", produs("z", 20)]]),
    ancora: { basePrice: 0, unitPrice: 0 },
    nowMs: Date.now(),
  });
  assert.equal(rez.savings, 20);
  assert.equal(linii.find((l) => l.product_id === "z")!.price, 0);
});

test("upgrade-ul repretuiește O SINGURĂ bucată, restul liniei rămâne întreagă", () => {
  const o = oferta("upgrade", { productIds: ["mare"], discountMode: "fixed_price", fixedPrice: 89 },
    { scope: "products", productIds: ["mic"] }, { surfaces: ["checkout"] });
  const linii = liniiDe(["mare", 2, 99]);
  const rez = pretuiesteOfertele({
    oferte: [o],
    linii,
    ctx: {
      ancora: null,
      produse: [{ id: "mare", category: null }],
      cos: cosulDinLinii([{ productId: "mare", quantity: 2, unitPrice: 99 }]),
    },
    oferibile: new Map([["mare", produs("mare", 99)]]),
    ancora: { basePrice: 0, unitPrice: 0 },
    nowMs: Date.now(),
  });
  assert.equal(rez.savings, 10, "99 → 89 pe o bucată");
  assert.equal(rez.venitPeOferta[o.id], 89);
  assert.deepEqual(linii.map((l) => [l.quantity, l.price]).sort(), [[1, 89], [1, 99]].sort());
});

test("⚠ o ofertă care nu ieftinește nimic tot aduce venit: bucata ei e în comandă", () => {
  const o = oferta("gift", { productIds: ["c"], discountMode: "none" },
    { scope: "all" }, { surfaces: ["checkout"] });
  const linii = liniiDe(["c", 1, 30]);
  const rez = pretuiesteOfertele({
    oferte: [o],
    linii,
    ctx: { ancora: null, produse: [{ id: "c", category: null }], cos: cosulDinLinii([{ productId: "c", quantity: 1, unitPrice: 30 }]) },
    oferibile: new Map([["c", produs("c", 30)]]),
    ancora: { basePrice: 0, unitPrice: 0 },
    nowMs: Date.now(),
  });
  assert.equal(rez.savings, 0);
  assert.equal(rez.venitPeOferta[o.id], 30);
});

/* ══ 6. Porțile și suprafața se cer la toate patru ═════════════════════ */

test("⚠⚠ porțile opresc cadoul exact ca la bump", () => {
  const o = oferta("gift", { productIds: ["c"], discountMode: "fixed_price", fixedPrice: 0 },
    { scope: "all", conditions: { minValue: 300 } }, { surfaces: ["checkout"] });
  const sub = {
    ancora: null,
    produse: [{ id: "a", category: null }, { id: "c", category: null }],
    cos: cosulDinLinii([{ productId: "a", quantity: 1, unitPrice: 299 }, { productId: "c", quantity: 1, unitPrice: 0 }]),
  };
  assert.equal(refuzaOferta(o, sub, Date.now()), "poarta");
  const peste = {
    ...sub,
    cos: cosulDinLinii([{ productId: "a", quantity: 1, unitPrice: 300 }, { productId: "c", quantity: 1, unitPrice: 0 }]),
  };
  assert.equal(refuzaOferta(o, peste, Date.now()), null);
});

test("⚠ cadoul NU-și deschide singur poarta cu propriul preț", () => {
  /*
   * La afișare, cadoul nu e în coș; la comandă E. Fără excluderea produselor
   * ofertei, un cadou de 60 de lei ar fi dus un coș de 250 peste pragul de 300.
   */
  const o = oferta("gift", { productIds: ["c"], discountMode: "none" },
    { scope: "all", conditions: { minValue: 300 } }, { surfaces: ["checkout"] });
  const ctx = {
    ancora: null,
    produse: [{ id: "a", category: null }, { id: "c", category: null }],
    cos: cosulDinLinii([{ productId: "a", quantity: 1, unitPrice: 250 }, { productId: "c", quantity: 1, unitPrice: 60 }]),
  };
  assert.equal(refuzaOferta(o, ctx, Date.now()), "poarta");
});

test("suprafața greșită refuză toate cele patru tipuri", () => {
  for (const t of TIPURI_DIN_FORMULAR) {
    const o = oferta(t, { productIds: ["x"], discountMode: "none" }, { scope: "all" }, { surfaces: ["product_page"] });
    assert.equal(refuzaOferta(o, NIMIC, Date.now()), "suprafata", t);
  }
});

test("în afara ferestrei, toate patru se refuză înaintea oricărei alte verificări", () => {
  for (const t of TIPURI_DIN_FORMULAR) {
    const o = { ...oferta(t, { productIds: ["x"] }, { scope: "all" }, { surfaces: ["checkout"] }), endsAt: "2020-01-01T00:00:00Z" };
    assert.equal(refuzaOferta(o, NIMIC, Date.now()), "fereastra", t);
  }
});

/* ══ 7. Ce trimite browserul ═══════════════════════════════════════════ */

test("⚠⚠ două oferte care dau același cadou nu trimit de două ori aceeași linie", () => {
  /*
   * Serverul marchează liniile atinse și ieftinește una singură. Trimise de
   * două ori, ecranul ar fi arătat două cadouri și factura unul.
   */
  const comun = {
    style: "card" as const, amplasare: "sub_produs" as const,
    pricing: { price: 0, compareAt: 30, savings: 30 },
    products: [produs("c", 30, { pretOferta: 0 })],
  };
  const a = { ...comun, id: "of-a", type: "gift" as const, title: "Cadou A" };
  const b = { ...comun, id: "of-b", type: "gift" as const, title: "Cadou B" };
  const linii = liniileAcceptate([a, b], new Set(["of-a", "of-b"]), new Set());
  assert.equal(linii.length, 1, "a doua ofertă n-are ce mai da");
  assert.equal(linii[0].offerId, "of-a");
});

test("linia unei oferte poartă bucățile cerute și prețul produsului ALES", () => {
  const o = {
    id: "g1", type: "gift" as const, title: "Alege cadoul", style: "card" as const,
    amplasare: "sub_produs" as const,
    products: [produs("c1", 30, { pretOferta: 0 }), produs("c2", 40, { pretOferta: 0 })],
    pricing: { price: 0, compareAt: 30, savings: 30 },
    reguli: { laAlegere: true },
  };
  const linii = liniileAcceptate([o], new Set(["g1"]), new Set(), { g1: "c2" });
  assert.equal(linii[0].product.id, "c2");
  assert.equal(linii[0].pret, 0);
  assert.equal(linii[0].pretIntreg, 40);
  assert.equal(linii[0].bucati, 1);
});

test("„primești 3” trimite trei bucăți, nu una", () => {
  const o = {
    id: "b1", type: "bogo" as const, title: "Cumperi 2, primești 3", style: "card" as const,
    amplasare: "sub_produs" as const,
    products: [produs("z", 20, { pretOferta: 0 })],
    pricing: { price: 0, compareAt: 20, savings: 20 },
    reguli: { cumperi: 2, primesti: 3 },
  };
  const linii = liniileAcceptate([o], new Set(["b1"]), new Set());
  assert.equal(linii[0].bucati, 3);
});
