import assert from "node:assert/strict";
import { test } from "node:test";
import {
  aplicaOfertaPeLinii, expandarePeOferta, extindeCategoriile, normalizeazaIds,
  opresteComanda, pretuiesteOfertele, refuzaOferta, setulOfertei,
  MAX_BUMPURI_AFISATE, MAX_OFERTE_ACCEPTATE,
  type OfertaCuReguli,
} from "./offer-pricing";
import { parseOfferConfig, parseOfferDisplay, parseOfferTrigger, type OfferProduct } from "./offer.types";
import { fbtCompanionPrices, imparteEconomiaCompanionilor, pretulSetului } from "./fbt-pricing";
import type { BumpItem } from "./bump-pricing";

/**
 * Ofertele la PLASAREA comenzii: acelasi drum ca la afisare.
 *
 * Pana acum, cele doua functii de la comanda citeau din `offers` doar tipul si
 * configuratia — `trigger` si `display` nici nu ajungeau in memorie — si
 * repretuiau orice linie al carei produs aparea in `config.productIds`. Id-ul
 * ofertei ajunge in browser, deci oricine il putea trimite pe o comanda straina.
 */

/* ─── Ajutoare ────────────────────────────────────────────────────────────── */

function produs(id: string, price: number, extra: Partial<OfferProduct> = {}): OfferProduct {
  return {
    id, name: id, slug: id, price, compareAtPrice: null, imageUrl: null,
    outOfStock: false, hasVariants: false, ...extra,
  };
}

// Ofertele se construiesc cu PARSERELE din productie, nu cu obiecte scrise de
// mana: implicitele de suprafata si plafonul lui `maxProducts` de acolo vin.
function oferta(
  id: string,
  type: OfertaCuReguli["type"],
  trigger: unknown,
  config: unknown,
  display: unknown = null,
  restul: Partial<Pick<OfertaCuReguli, "startsAt" | "endsAt" | "priority">> = {},
): OfertaCuReguli {
  return {
    id, type,
    trigger: parseOfferTrigger(trigger),
    config: parseOfferConfig(config),
    display: parseOfferDisplay(display, type),
    startsAt: restul.startsAt ?? null,
    endsAt: restul.endsAt ?? null,
    priority: restul.priority ?? 0,
  };
}

const linie = (product_id: string, price: number, quantity = 1): BumpItem =>
  ({ product_id, name: product_id, price, quantity });

const ACUM = Date.UTC(2026, 7, 3);

// Comanda directa: ancora e produsul din formular. `basePrice` e pretul de
// catalog (cu care s-a calculat economia aratata pe card), `unitPrice` cel chiar
// platit; pe un produs fara variante sunt acelasi numar.
function ruleaza(
  oferte: OfertaCuReguli[],
  linii: BumpItem[],
  oferibile: OfferProduct[],
  ancora: { id: string; unitPrice: number; basePrice?: number } | null = { id: "ancora", unitPrice: 100 },
  cuVariantaAleasa: string[] = [],
) {
  const rez = pretuiesteOfertele({
    oferte,
    linii,
    ctx: {
      ancora: ancora ? { id: ancora.id, category: null } : null,
      produse: [...(ancora ? [ancora.id] : []), ...linii.map((l) => l.product_id)]
        .map((id) => ({ id, category: null })),
      cuVariantaAleasa: new Set(cuVariantaAleasa),
    },
    oferibile: new Map(oferibile.map((p) => [p.id, p])),
    ancora: { basePrice: ancora?.basePrice ?? ancora?.unitPrice ?? 0, unitPrice: ancora?.unitPrice ?? 0 },
    nowMs: ACUM,
  });
  return { ...rez, linii, opreste: opresteComanda(rez.rejected) };
}

/* ─── 9a: declansatorul si suprafata ──────────────────────────────────────── */

test("bump revendicat pe o comanda pe care nu o declanseaza: comanda se opreste", () => {
  // Cazul din productie: oferta 454fd138 se aprinde pe trei produse anume, dar
  // magazinul are 51. Fara `trigger` in memorie, o comanda pe oricare din
  // celelalte 48 lua produsul oferit la 16 in loc de 18.
  const o = oferta("bump", "order_bump", { scope: "products", productIds: ["declansator"] }, { productIds: ["oferit"], fixedPrice: 16, discountMode: "fixed_price" });
  const linii = [linie("oferit", 18)];
  const rez = ruleaza([o], linii, [produs("oferit", 18)], { id: "altceva", unitPrice: 40 });

  assert.deepEqual(rez.rejected, [{ id: "bump", motiv: "declansator" }]);
  assert.equal(rez.opreste, true);
  assert.equal(linii[0].price, 18, "pretul nu are voie sa se schimbe");
  assert.equal(rez.savings, 0);
});

test("acelasi bump, pe comanda care CHIAR il declanseaza: se aplica", () => {
  const o = oferta("bump", "order_bump", { scope: "products", productIds: ["declansator"] }, { productIds: ["oferit"], fixedPrice: 16, discountMode: "fixed_price" });
  const linii = [linie("declansator", 40), linie("oferit", 18)];
  const rez = ruleaza([o], linii, [produs("oferit", 18)], { id: "declansator", unitPrice: 40 });

  assert.deepEqual(rez.applied, ["bump"]);
  assert.equal(rez.opreste, false);
  assert.equal(linii[1].price, 16);
  assert.equal(rez.savings, 2);
});

test("declansatorul se poate aprinde si dintr-o linie din cos, nu doar din ancora", () => {
  const o = oferta("bump", "order_bump", { scope: "products", productIds: ["dinCos"] }, { productIds: ["oferit"], discountMode: "percent", discountPercent: 50 });
  const linii = [linie("dinCos", 30), linie("oferit", 20)];
  const rez = ruleaza([o], linii, [produs("oferit", 20)], { id: "ancora", unitPrice: 100 });

  assert.deepEqual(rez.applied, ["bump"]);
  assert.equal(linii[1].price, 10);
});

test("bump marcat doar pentru cos nu se poate revendica la plasarea comenzii", () => {
  const o = oferta("bump", "order_bump", { scope: "all" }, { productIds: ["oferit"], fixedPrice: 5, discountMode: "fixed_price" }, { surfaces: ["cart"] });
  const rez = ruleaza([o], [linie("oferit", 20)], [produs("oferit", 20)]);

  assert.deepEqual(rez.rejected, [{ id: "bump", motiv: "suprafata" }]);
  assert.equal(rez.opreste, true);
});

test("display gol inseamna implicitele tipului, nu refuz", () => {
  // Capcana: pe jsonb-ul brut, o oferta perfect legitima (fara `display` completat)
  // ar fi picat la verificarea de suprafata si ar fi oprit comanda.
  const o = oferta("bump", "order_bump", { scope: "all" }, { productIds: ["oferit"], fixedPrice: 5, discountMode: "fixed_price" }, {});
  const rez = ruleaza([o], [linie("oferit", 20)], [produs("oferit", 20)]);

  assert.deepEqual(rez.applied, ["bump"]);
});

test("FBT revendicat pe calea cosului, unde nu exista ancora: refuz", () => {
  const o = oferta("fbt", "frequently_bought", { scope: "all" }, { productIds: ["comp"], discountMode: "percent", discountPercent: 10 });
  const rez = ruleaza([o], [linie("comp", 50)], [produs("comp", 50)], null);

  assert.deepEqual(rez.rejected, [{ id: "fbt", motiv: "fara_ancora" }]);
  assert.equal(rez.opreste, true);
});

test("tipurile fara pret (cross_sell si restul) se refuza, nu se ignora", () => {
  const o = oferta("cs", "cross_sell", { scope: "all" }, { productIds: ["oferit"], discountMode: "percent", discountPercent: 90 });
  const linii = [linie("oferit", 20)];
  const rez = ruleaza([o], linii, [produs("oferit", 20)]);

  assert.deepEqual(rez.rejected, [{ id: "cs", motiv: "tip" }]);
  assert.equal(linii[0].price, 20);
});

test("oferta iesita din fereastra, sau inca neinceputa, nu se poate revendica", () => {
  const cfg = { productIds: ["oferit"], fixedPrice: 5, discountMode: "fixed_price" };
  const incheiata = oferta("bump", "order_bump", { scope: "all" }, cfg, null, { endsAt: new Date(ACUM - 1000).toISOString() });
  assert.deepEqual(ruleaza([incheiata], [linie("oferit", 20)], [produs("oferit", 20)]).rejected,
    [{ id: "bump", motiv: "fereastra" }]);

  const viitoare = oferta("bump", "order_bump", { scope: "all" }, cfg, null, { startsAt: new Date(ACUM + 86_400_000).toISOString() });
  assert.deepEqual(ruleaza([viitoare], [linie("oferit", 20)], [produs("oferit", 20)]).rejected,
    [{ id: "bump", motiv: "fereastra" }]);

  const inauntru = oferta("bump", "order_bump", { scope: "all" }, cfg, null, {
    startsAt: new Date(ACUM - 86_400_000).toISOString(), endsAt: new Date(ACUM + 86_400_000).toISOString(),
  });
  assert.deepEqual(ruleaza([inauntru], [linie("oferit", 20)], [produs("oferit", 20)]).applied, ["bump"]);
});

/* ─── 9b: setul pe care magazinul l-ar fi aratat ──────────────────────────── */

test("bump: nu se poate revendica produsul scump din spatele listei", () => {
  // Magazinul arata PRIMUL produs vandabil. Cu `fixedPrice: 10` si patru produse
  // in configuratie, cine putea alege singur produsul lua telefonul la 10 lei.
  const o = oferta("bump", "order_bump", { scope: "all" }, { productIds: ["ieftin", "scump"], fixedPrice: 10, discountMode: "fixed_price" });
  const linii = [linie("scump", 500)];
  const rez = ruleaza([o], linii, [produs("ieftin", 12), produs("scump", 500)]);

  assert.equal(linii[0].price, 500, "produsul scump ramane la pretul lui");
  assert.deepEqual(rez.rejected, [{ id: "bump", motiv: "lipsa_din_comanda" }]);
  assert.equal(rez.opreste, false, "nu s-a promis nimic, deci comanda merge mai departe");
});

test("bump: produsul de dupa unul deja cumparat e legitim (asa l-a aratat magazinul)", () => {
  // `resolveCartOffers` exclude ce e deja in cos, deci cu „ieftin" in cos
  // magazinul chiar arata „scump".
  const o = oferta("bump", "order_bump", { scope: "all" }, { productIds: ["ieftin", "scump"], discountMode: "percent", discountPercent: 10 });
  const linii = [linie("ieftin", 12), linie("scump", 500)];
  const rez = ruleaza([o], linii, [produs("ieftin", 12), produs("scump", 500)]);

  assert.deepEqual(rez.applied, ["bump"]);
  assert.equal(linii[1].price, 450);
  assert.equal(linii[0].price, 12, "linia din cos ramane neatinsa");
});

test("bump: produsul comandat din formular ascunde bump-ul, ca o linie din cos", () => {
  // `OrderModal` cere bump-urile cu `[product.id, ...cosul]`, deci magazinul
  // exclude ancora din lista si arata produsul urmator. Ancora nu e printre
  // liniile purtate, deci reconstituirea trebuie sa o adauge singura — altfel
  // clientul platea intreg produsul pe care il vazuse redus.
  const o = oferta("bump", "order_bump", { scope: "all" }, { productIds: ["ancora", "oferit"], discountMode: "percent", discountPercent: 25 });
  const linii = [linie("oferit", 40)];
  const rez = ruleaza([o], linii, [produs("ancora", 100), produs("oferit", 40)], { id: "ancora", unitPrice: 100 });

  assert.deepEqual(rez.applied, ["bump"]);
  assert.equal(linii[0].price, 30);
});

test("bump: produsele epuizate sau cu variante nu se pot revendica", () => {
  const o = oferta("bump", "order_bump", { scope: "all" }, { productIds: ["epuizat"], fixedPrice: 1, discountMode: "fixed_price" });
  const rez = ruleaza([o], [linie("epuizat", 30)], [produs("epuizat", 30, { outOfStock: true })]);
  assert.deepEqual(rez.rejected, [{ id: "bump", motiv: "set_gol" }]);

  const o2 = oferta("bump", "order_bump", { scope: "all" }, { productIds: ["cuVariante"], fixedPrice: 1, discountMode: "fixed_price" });
  const rez2 = ruleaza([o2], [linie("cuVariante", 30)], [produs("cuVariante", 30, { hasVariants: true })]);
  assert.deepEqual(rez2.rejected, [{ id: "bump", motiv: "set_gol" }]);
});

test("bump: produsul inactiv sau pachet nici nu ajunge candidat", () => {
  // `oferibile` primeste doar produsele active si ne-pachet, exact ca
  // `fetchOfferProducts` la afisare.
  const o = oferta("bump", "order_bump", { scope: "all" }, { productIds: ["pachet"], fixedPrice: 1, discountMode: "fixed_price" });
  const rez = ruleaza([o], [linie("pachet", 300)], []);
  assert.deepEqual(rez.rejected, [{ id: "bump", motiv: "set_gol" }]);
});

test("bump: fereastra aluneca peste produsele pe care cosul le-a ascuns", () => {
  const o = oferta("bump", "order_bump", { scope: "all" }, { productIds: ["a", "b", "c", "d", "e"], maxProducts: 2, fixedPrice: 1, discountMode: "fixed_price" });
  const set = setulOfertei(o, [produs("a", 10), produs("b", 20), produs("c", 30), produs("d", 40), produs("e", 50)], null, new Set(["a", "b", "e"]));

  assert.ok("set" in set);
  assert.deepEqual(set.set.map((p) => p.id), ["a", "b", "c"],
    "a si b au linii, deci fereastra aluneca; c e primul care nu putea fi ascuns");
});

test("bump: dincolo de maxProducts chiar nu se mai arata nimic", () => {
  // Fereastra aluneca DOAR peste produsele pe care cosul le putea ascunde. Doua
  // produse nevandabile, pe care nu le-a cumparat nimeni, ocupa locuri in lista
  // afisata, deci al treilea nu mai incape: fara plafon, ar fi fost revendicabil.
  const o = oferta("bump", "order_bump", { scope: "all" }, { productIds: ["x", "y", "z"], maxProducts: 2, fixedPrice: 1, discountMode: "fixed_price" });
  const candidati = [produs("x", 10, { outOfStock: true }), produs("y", 20, { hasVariants: true }), produs("z", 500)];
  assert.deepEqual(setulOfertei(o, candidati, null, new Set(["z"])), { motiv: "set_gol" });

  // Cu plafonul implicit (4), acelasi z e legitim.
  const larg = oferta("bump", "order_bump", { scope: "all" }, { productIds: ["x", "y", "z"], fixedPrice: 1, discountMode: "fixed_price" });
  const set = setulOfertei(larg, candidati, null, new Set(["z"]));
  assert.ok("set" in set);
  assert.deepEqual(set.set.map((p) => p.id), ["z"]);
});

test("FBT: setul se cumpara intreg sau deloc", () => {
  const o = oferta("fbt", "frequently_bought", { scope: "all" }, { productIds: ["c1", "c2"], discountMode: "percent", discountPercent: 10 });
  const linii = [linie("c1", 50)];
  const rez = ruleaza([o], linii, [produs("c1", 50), produs("c2", 30)]);

  assert.deepEqual(rez.rejected, [{ id: "fbt", motiv: "set_incomplet" }]);
  assert.equal(rez.opreste, true);
  assert.equal(linii[0].price, 50);
});

test("FBT: ancora nu intra in propriul set", () => {
  const o = oferta("fbt", "frequently_bought", { scope: "all" }, { productIds: ["ancora", "comp"], discountMode: "percent", discountPercent: 10 });
  const set = setulOfertei(o, [produs("ancora", 100), produs("comp", 50)], "ancora", new Set());

  assert.ok("set" in set);
  assert.deepEqual(set.set.map((p) => p.id), ["comp"]);
});

test("FBT: un produs nevandabil purtat din cos NU blocheaza comanda", () => {
  // Capcana in care s-a cazut o data: c2 are variante, deci magazinul nu-l pune
  // niciodata in setul de pe card — dar clientul il avea de mult in cos, cu
  // marimea aleasa. Daca prezenta lui in comanda ar insemna „setul s-a schimbat",
  // fiecare comanda „cumpara impreuna" a magazinului ar fi refuzata cat timp
  // produsul ala sta in cos, iar cosul supravietuieste reincarcarii.
  const o = oferta("fbt", "frequently_bought", { scope: "all" }, { productIds: ["c1", "c2"], discountMode: "percent", discountPercent: 10 });
  const linii = [linie("c1", 50), linie("c2", 30)];
  const rez = ruleaza([o], linii, [produs("c1", 50), produs("c2", 30, { hasVariants: true })],
    { id: "ancora", unitPrice: 100 }, ["c2"]);

  assert.deepEqual(rez.applied, ["fbt"]);
  assert.equal(rez.opreste, false);
  assert.equal(linii[1].price, 30, "linia purtata din cos ramane la pretul ei");
  assert.equal(linii[0].price, fbtCompanionPrices(100, [50], o.config)[0]);
});

test("FBT: acelasi produs, dar FARA varianta aleasa, inseamna set schimbat", () => {
  // Aceeasi asezare ca mai sus, doar ca linia lui c2 n-are varianta: atunci nu
  // vine din cos, ci din setul de pe card, iar setul s-a schimbat de sub client
  // intre randare si trimitere. Pretuit pe setul cel nou, c2 s-ar incasa INTREG,
  // in tacere, desi pe buton scria pretul setului vechi.
  const o = oferta("fbt", "frequently_bought", { scope: "all" }, { productIds: ["c1", "c2"], discountMode: "percent", discountPercent: 10 });
  const linii = [linie("c1", 50), linie("c2", 30)];
  const rez = ruleaza([o], linii, [produs("c1", 50), produs("c2", 30, { hasVariants: true })]);

  assert.deepEqual(rez.rejected, [{ id: "fbt", motiv: "set_incomplet" }]);
  assert.equal(rez.opreste, true);
  assert.equal(linii[0].price, 50, "niciun pret nu se schimba pe o comanda refuzata");
});

test("FBT: ancora cu varianta — economia e a setului de pe card, impartirea e pe pretul platit", () => {
  // Cardul primeste economia calculata de server pe pretul de BAZA (asa il
  // randeaza pagina de produs) si o imparte cu pretul VARIANTEI alese. Cu un
  // singur numar pe server, cele doua se despart: la „pret fix" clientul vedea
  // 45 si platea 20.
  const cfg = { productIds: ["comp"], discountMode: "fixed_price", fixedPrice: 120 };
  const o = oferta("fbt", "frequently_bought", { scope: "all" }, cfg);
  const linii = [linie("comp", 50)];
  ruleaza([o], linii, [produs("comp", 50)], { id: "ancora", unitPrice: 250, basePrice: 100 });

  // Exact aritmetica de pe card: economia setului de catalog (100+50-120 = 30),
  // impartita pe cota companionilor din setul chiar platit (250+50).
  const deiPeCard = imparteEconomiaCompanionilor(250, [50], pretulSetului([100, 50], o.config).savings);
  assert.equal(linii[0].price, deiPeCard[0]);
});

/* ─── 9c si cumularea ─────────────────────────────────────────────────────── */

test("bump pe o linie de mai multe bucati: se reduce O SINGURA bucata", () => {
  const o = oferta("bump", "order_bump", { scope: "all" }, { productIds: ["p"], discountMode: "percent", discountPercent: 50 });
  const linii = [linie("p", 20, 5)];
  const rez = ruleaza([o], linii, [produs("p", 20)]);

  assert.equal(rez.savings, 10);
  assert.deepEqual(linii.map((l) => [l.price, l.quantity]), [[20, 4], [10, 1]]);
});

test("FBT pe o linie de mai multe bucati: tot o singura bucata", () => {
  const o = oferta("fbt", "frequently_bought", { scope: "all" }, { productIds: ["comp"], discountMode: "percent", discountPercent: 10 });
  const linii = [linie("comp", 50, 3)];
  const rez = ruleaza([o], linii, [produs("comp", 50)], { id: "ancora", unitPrice: 100 });

  const asteptat = fbtCompanionPrices(100, [50], o.config)[0];
  assert.deepEqual(rez.applied, ["fbt"]);
  assert.deepEqual(linii.map((l) => [l.price, l.quantity]), [[50, 2], [asteptat, 1]]);
});

test("o linie atinsa de o oferta nu mai poate fi atinsa de a doua", () => {
  const a = oferta("a", "order_bump", { scope: "all" }, { productIds: ["p"], discountMode: "percent", discountPercent: 50 }, null, { priority: 2 });
  const b = oferta("b", "order_bump", { scope: "all" }, { productIds: ["p"], discountMode: "percent", discountPercent: 50 }, null, { priority: 1 });
  const linii = [linie("p", 20)];
  const rez = ruleaza([a, b], linii, [produs("p", 20)]);

  assert.deepEqual(rez.applied, ["a"]);
  assert.deepEqual(rez.rejected, [{ id: "b", motiv: "lipsa_din_comanda" }]);
  assert.equal(linii[0].price, 10, "10, nu 5: a doua oferta nu recalculeaza peste pretul redus");
});

test("ordinea de aplicare e a serverului, nu a payload-ului", () => {
  const mic = oferta("mic", "order_bump", { scope: "all" }, { productIds: ["p"], discountMode: "percent", discountPercent: 10 }, null, { priority: 1 });
  const mare = oferta("mare", "order_bump", { scope: "all" }, { productIds: ["p"], discountMode: "percent", discountPercent: 60 }, null, { priority: 9 });

  for (const ordine of [[mic, mare], [mare, mic]]) {
    const linii = [linie("p", 100)];
    const rez = ruleaza(ordine, linii, [produs("p", 100)]);
    assert.deepEqual(rez.applied, ["mare"], "prioritatea mai mare se aplica prima, oricum ar veni id-urile");
    assert.equal(linii[0].price, 40);
  }
});

test("al doilea set cumparate frecvent impreuna nu se poate revendica", () => {
  const a = oferta("f1", "frequently_bought", { scope: "all" }, { productIds: ["c1"], discountMode: "percent", discountPercent: 10 }, null, { priority: 2 });
  const b = oferta("f2", "frequently_bought", { scope: "all" }, { productIds: ["c2"], discountMode: "percent", discountPercent: 10 }, null, { priority: 1 });
  const linii = [linie("c1", 50), linie("c2", 40)];
  const rez = ruleaza([a, b], linii, [produs("c1", 50), produs("c2", 40)]);

  assert.deepEqual(rez.applied, ["f1"]);
  assert.deepEqual(rez.rejected, [{ id: "f2", motiv: "prea_multe" }]);
  assert.equal(linii[1].price, 40);
});

test("acelasi produs trecut de doua ori in oferta se reduce o singura data", () => {
  const o = oferta("fbt", "frequently_bought", { scope: "all" }, { productIds: ["comp", "comp"], discountMode: "percent", discountPercent: 10 });
  const linii = [linie("comp", 50, 2)];
  const rez = ruleaza([o], linii, [produs("comp", 50)], { id: "ancora", unitPrice: 100 });

  const asteptat = fbtCompanionPrices(100, [50], o.config)[0];
  assert.deepEqual(rez.applied, ["fbt"]);
  assert.deepEqual(linii.map((l) => [l.price, l.quantity]), [[50, 1], [asteptat, 1]]);
});

test("pretul se ia din CATALOG, nu de pe linie", () => {
  // Preturile liniilor se recalculeaza oricum pe server, dar reducerea nu are
  // voie sa porneasca dintr-un numar venit din afara.
  const o = oferta("bump", "order_bump", { scope: "all" }, { productIds: ["p"], discountMode: "percent", discountPercent: 50 });
  const linii = [linie("p", 1)];
  const rez = ruleaza([o], linii, [produs("p", 200)]);

  assert.equal(linii[0].price, 1, "100 de lei (jumatate din catalog) e peste pretul liniei, deci nu se scade nimic");
  assert.equal(rez.savings, 0);
});

test("bump-ul cu pretul special egal cu cel de catalog nu misca nimic", () => {
  // Doua din cele trei bump-uri din productie arata asa: fixedPrice = pretul produsului.
  const o = oferta("bump", "order_bump", { scope: "all" }, { productIds: ["p"], fixedPrice: 55, discountMode: "fixed_price" });
  const linii = [linie("p", 55)];
  const rez = ruleaza([o], linii, [produs("p", 55)]);

  assert.deepEqual(rez.applied, ["bump"]);
  assert.equal(rez.savings, 0);
  assert.equal(linii.length, 1, "nicio linie de reducere de 0 lei");
});

/* ─── Legatura cu ce s-a aratat pe ecran ──────────────────────────────────── */

test("ancora se pretuieste cu varianta aleasa, ca pe card", () => {
  // Cardul imparte economia folosind pretul AFISAT (al variantei), serverul lua
  // pretul de BAZA al produsului: pe un produs cu variante, ecranul si incasarea
  // nu puteau fi de acord.
  const o = oferta("fbt", "frequently_bought", { scope: "all" }, { productIds: ["comp"], discountMode: "percent", discountPercent: 10 });
  const linii = [linie("comp", 50)];
  ruleaza([o], linii, [produs("comp", 50)], { id: "ancora", unitPrice: 250 });

  assert.equal(linii[0].price, fbtCompanionPrices(250, [50], o.config)[0]);
});

test("bump fara produsul lui in comanda: fara reducere, dar si fara refuz", () => {
  const o = oferta("bump", "order_bump", { scope: "all" }, { productIds: ["p"], discountMode: "percent", discountPercent: 50 });
  const linii = [linie("altul", 30)];
  const rez = ruleaza([o], linii, [produs("p", 20)]);

  assert.deepEqual(rez.rejected, [{ id: "bump", motiv: "lipsa_din_comanda" }]);
  assert.equal(rez.opreste, false);
  assert.deepEqual(linii, [linie("altul", 30)]);
});

/* ─── Categorii ───────────────────────────────────────────────────────────── */

test("categoriile se extind in subarbore", () => {
  const arbore = [
    { id: "1", name: "Imbracaminte", parent_id: null },
    { id: "2", name: "Rochii", parent_id: "1" },
    { id: "3", name: "Rochii de seara", parent_id: "2" },
    { id: "4", name: "Pantofi", parent_id: null },
  ];
  assert.deepEqual([...extindeCategoriile(arbore, ["Imbracaminte"])].sort(),
    ["Imbracaminte", "Rochii", "Rochii de seara"]);
  assert.deepEqual([...extindeCategoriile(arbore, ["Rochii"])].sort(), ["Rochii", "Rochii de seara"]);
});

test("expandarea unei oferte nu se amesteca cu a alteia", () => {
  // Cat timp exista o singura multime, comuna tuturor ofertelor magazinului,
  // oferta pe „Rochii" se aprindea si pe un produs din „Pantofi", numai fiindca
  // alta oferta alesese „Pantofi".
  const arbore = [
    { id: "1", name: "Rochii", parent_id: null },
    { id: "2", name: "Pantofi", parent_id: null },
  ];
  const peRochii = oferta("r", "order_bump", { scope: "categories", categories: ["Rochii"] }, { productIds: ["oferit"] });
  const pePantofi = oferta("p", "order_bump", { scope: "categories", categories: ["Pantofi"] }, { productIds: ["oferit"] });
  const ctx = {
    ancora: { id: "pantof", category: "Pantofi" },
    produse: [{ id: "pantof", category: "Pantofi" }],
  };
  // Chiar ajutorul folosit si de magazin, si de comanda.
  const extinsele = expandarePeOferta(arbore);
  assert.equal(refuzaOferta(peRochii, { ...ctx, categoriiExtinse: extinsele(peRochii) }, ACUM), "declansator");
  assert.equal(refuzaOferta(pePantofi, { ...ctx, categoriiExtinse: extinsele(pePantofi) }, ACUM), null);
  // Multimea comuna a celor doua oferte o lasa pe cea gresita sa treaca:
  assert.equal(refuzaOferta(peRochii, { ...ctx, categoriiExtinse: extindeCategoriile(arbore, ["Rochii", "Pantofi"]) }, ACUM), null);
  // Si o oferta care nu se declanseaza pe categorii nu cere niciun arbore.
  assert.equal(extinsele(oferta("t", "order_bump", { scope: "all" }, { productIds: ["oferit"] })), undefined);
});

test("ciclu in arborele de categorii: nu blocheaza", () => {
  const arbore = [
    { id: "1", name: "A", parent_id: "2" },
    { id: "2", name: "B", parent_id: "1" },
  ];
  assert.deepEqual([...extindeCategoriile(arbore, ["A"])].sort(), ["A", "B"]);
});

/* ─── Contorul si plafoanele ──────────────────────────────────────────────── */

test("nicio oferta acceptata inseamna zero atingeri", () => {
  const linii = [linie("p", 20, 3)];
  const rez = ruleaza([], linii, [produs("p", 20)]);
  assert.deepEqual(rez, { savings: 0, applied: [], rejected: [], linii, opreste: false });
});

const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("id-urile revendicate se curata inainte de orice interogare", () => {
  assert.deepEqual(normalizeazaIds([UUID(1), UUID(1), UUID(2)]), { ids: [UUID(1), UUID(2)], preaMulte: false });
  assert.deepEqual(normalizeazaIds(undefined), { ids: [], preaMulte: false });
  // Coloanele sunt `uuid`: un sir care nu se poate converti face interogarea sa
  // cada, iar o interogare cazuta opreste acum comanda. Deci nu ajunge acolo.
  assert.deepEqual(normalizeazaIds(["", "a", "x".repeat(65), "'; drop table offers;--"]),
    { ids: [], preaMulte: false });

  const multe = Array.from({ length: MAX_OFERTE_ACCEPTATE + 1 }, (_, i) => UUID(i));
  assert.equal(normalizeazaIds(multe).preaMulte, true);
  assert.equal(normalizeazaIds(multe.slice(0, MAX_OFERTE_ACCEPTATE)).preaMulte, false);
});

test("magazinul nu poate arata mai multe bump-uri decat accepta comanda", () => {
  // Altfel clientul bifeaza tot ce vede si serverul ii opreste comanda pentru un
  // plafon despre care interfata nu stia nimic. Un loc ramane pentru setul FBT.
  assert.ok(MAX_BUMPURI_AFISATE < MAX_OFERTE_ACCEPTATE);
  assert.equal(MAX_BUMPURI_AFISATE + 1, MAX_OFERTE_ACCEPTATE);
});

test("bump: o linie fara nicio bucata nu consuma oferta", () => {
  const o = oferta("bump", "order_bump", { scope: "all" }, { productIds: ["p"], discountMode: "percent", discountPercent: 50 });
  const linii = [linie("p", 20, 1), linie("p", 20, 0)];
  const rez = ruleaza([o], linii, [produs("p", 20)]);

  assert.deepEqual(rez.applied, ["bump"]);
  assert.equal(rez.savings, 10);
  assert.equal(linii[0].price, 10, "reducerea merge pe linia adevarata, nu pe cea goala");
  assert.equal(linii[1].price, 20);
});

test("aplicaOfertaPeLinii nu atinge de doua ori linia desprinsa", () => {
  const o = oferta("bump", "order_bump", { scope: "all" }, { productIds: ["p"], discountMode: "percent", discountPercent: 50 });
  const linii = [linie("p", 20, 5)];
  const atinse = new Set<BumpItem>();
  const set = [produs("p", 20)];

  const unu = aplicaOfertaPeLinii(linii, o, set, { basePrice: 0, unitPrice: 0 }, atinse);
  assert.deepEqual(unu, { savings: 10 });
  // A doua trecere gaseste doar linia ramasa la pret intreg — cea desprinsa e insemnata.
  const doi = aplicaOfertaPeLinii(linii, o, set, { basePrice: 0, unitPrice: 0 }, atinse);
  assert.deepEqual(doi, { motiv: "lipsa_din_comanda" });
  assert.deepEqual(linii.map((l) => [l.price, l.quantity]), [[20, 4], [10, 1]]);
});
