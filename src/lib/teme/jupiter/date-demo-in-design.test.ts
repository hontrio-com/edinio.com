import { strict as assert } from "node:assert";
import { test } from "node:test";
import { section } from "@/lib/storefront/design/defaults";
import { cardurileHero } from "@/lib/storefront/design/hero-carduri";
import { placileDinSetari } from "@/lib/storefront/design/placi-promo";
import type { DesignContext, StoreDesign } from "@/lib/storefront/design/types";
import { temaDupaCheie } from "../teme";
import { DATE_DEMO_JUPITER } from "./date-demo";
import { designJupiter, faraTexteleDemo, MESAJ_BARA_DEMO } from "./design";

/*
 * Etapele 18.3-18.4: textele demo ale temei (cardurile bannerului, placile de recomandare, mesajul barii de sus) intra
 * doar unde magazinul n-are ale lui, ca importul („Adaugă, marcate demo”), si ies cu „Șterge datele demo” doar cat au
 * ramas neschimbate. Gasit la 18.3: aplicarea golea cardurile LUI si ii inlocuia placile cu ale temei.
 */

const D = DATE_DEMO_JUPITER;
const ctx: DesignContext = {
  primaryColor: "#07c527",
  pageContent: { product_sections: [{ id: "r1", title: "Oferte", enabled: true, mode: "selected", productIds: ["a"] }] },
  features: {},
};

const hero = (d: StoreDesign) => d.home.find((s) => s.kind === "hero")!;
const placi = (d: StoreDesign) => d.home.filter((s) => s.kind === "placi_promo");
const cuSetari = (d: StoreDesign, kind: string, setari: Record<string, unknown>): StoreDesign =>
  ({ ...d, home: d.home.map((s) => (s.kind === kind ? { ...s, settings: { ...s.settings, ...setari } } : s)) });

test("⚠⚠ cardurile LUI din banner raman, si cu datele demo, si fara ele", () => {
  const ale = [{ titlu: "Al meu", text: "t", imagine: "m.jpg", link: "/contact" }];
  const baza = cuSetari(designJupiter(ctx, null), "hero", { carduri: ale });
  for (const date of [D, null]) {
    assert.deepEqual(cardurileHero(hero(designJupiter(ctx, date, baza)).settings).map((c) => c.titlu), ["Al meu"], String(!!date));
  }
});

test("⚠⚠ placile de recomandare ale LUI raman, fara o a doua sectiune a temei; una goala de-a lui primeste placile demo", () => {
  const aleLui = section("ale-mele", "placi_promo", "rotunde", true, { titlu: "Ale mele", placi: [{ titlu: "X", imagine: "x.jpg", link: "/x" }] });
  const baza = designJupiter(ctx, null);
  const cuAleLui: StoreDesign = { ...baza, home: [...baza.home.filter((s) => s.kind !== "placi_promo"), aleLui] };
  const d = designJupiter(ctx, D, cuAleLui);
  assert.deepEqual(placi(d).map((s) => s.id), ["ale-mele"], "o singura sectiune, a lui");
  assert.deepEqual(placileDinSetari(placi(d)[0].settings).map((p) => p.titlu), ["X"]);

  // Si a doua lui sectiune de placi ramane, cu starea ei (dupa ale temei, ca restul sectiunilor lui).
  const aDoua = section("a-doua", "placi_promo", "rotunde", false, { titlu: "A doua", placi: [{ titlu: "Y", imagine: "y.jpg", link: "/y" }] });
  const d3 = designJupiter(ctx, D, { ...cuAleLui, home: [...cuAleLui.home, aDoua] });
  assert.deepEqual(placi(d3).map((s) => `${s.id}:${s.enabled}`), ["ale-mele:true", "a-doua:false"]);

  const goala = { ...aleLui, settings: { ...aleLui.settings, placi: [] } };
  const d2 = designJupiter(ctx, D, { ...baza, home: [...baza.home.filter((s) => s.kind !== "placi_promo"), goala] });
  assert.deepEqual(placi(d2).map((s) => s.id), ["ale-mele"], "tot a lui, cu id-ul lui");
  assert.equal(placileDinSetari(placi(d2)[0].settings).length, D.placi.length);
  assert.equal(placi(d2)[0].settings.titlu, "Ale mele", "titlul lui ramane");
});

test("mesajul barii de sus: al lui ramane; cel demo doar in locul gol si doar cu datele demo", () => {
  const baza = designJupiter(ctx, null);
  const cuAlLui = { ...baza, chrome: { ...baza.chrome, header: { ...baza.chrome.header, settings: { ...baza.chrome.header.settings, topText: "Livrare gratuita peste 300 lei" } } } };
  assert.equal(designJupiter(ctx, D, cuAlLui).chrome.header.settings.topText, "Livrare gratuita peste 300 lei");
  assert.equal(designJupiter(ctx, D).chrome.header.settings.topText, MESAJ_BARA_DEMO);
  assert.notEqual(designJupiter(ctx, null).chrome.header.settings.topText, MESAJ_BARA_DEMO);
});

test("radacina catalogului magazinului: in cardurile si placile demo si in „Toate produsele” din subsol", () => {
  const d = designJupiter(ctx, D, undefined, { radacinaCatalog: "/produse" });
  for (const c of cardurileHero(hero(d).settings)) assert.match(c.link, /^\/produse\?cat=/);
  for (const p of placileDinSetari(placi(d)[0].settings)) assert.match(p.link, /^\/produse\?cat=/);
  const comenzi = (d.chrome.footer.blocks ?? []).find((b) => b.id === "comenzi")!;
  assert.equal((comenzi.settings.linkuri as { adresa: string }[])[0].adresa, "/produse");
  // Fara radacina (magazinul demo), ca inainte.
  const demo = designJupiter(ctx, D);
  assert.match(cardurileHero(hero(demo).settings)[0].link, /^\/magazin\?cat=/);
});

test("„Șterge datele demo”: cardurile, placile si mesajul demo ies, iar ce ramane arata ca tema aplicata fara date", () => {
  const cu = designJupiter(ctx, D);
  const { design, schimbat } = faraTexteleDemo(cu, D);
  assert.equal(schimbat, true);
  const fara = designJupiter(ctx, null);
  assert.deepEqual(hero(design).settings.carduri, hero(fara).settings.carduri);
  assert.deepEqual(placi(design)[0].settings.placi, placi(fara)[0].settings.placi);
  assert.equal(design.chrome.header.settings.topText, "");
  const iar = faraTexteleDemo(design, D);
  assert.equal(iar.schimbat, false);
  assert.equal(iar.design, design, "a doua oara, nimic de scos: acelasi design, deci nimic de publicat");
});

test("⚠ un card demo schimbat de el (titlul) ramane; mesajul lui din bara ramane", () => {
  const cu = designJupiter(ctx, D);
  const [primul, al2lea] = hero(cu).settings.carduri as Record<string, unknown>[];
  const schimbat = cuSetari(cu, "hero", { carduri: [{ ...primul, titlu: "Schimbat de mine" }, al2lea] });
  const cuMesaj = { ...schimbat, chrome: { ...schimbat.chrome, header: { ...schimbat.chrome.header, settings: { ...schimbat.chrome.header.settings, topText: "Al meu" } } } };
  const { design } = faraTexteleDemo(cuMesaj, D);
  assert.deepEqual((hero(design).settings.carduri as { titlu: string }[]).map((c) => c.titlu), ["Schimbat de mine"]);
  assert.equal(design.chrome.header.settings.topText, "Al meu");
});

test("tema isi da inversul textelor ei demo", () => {
  assert.equal(temaDupaCheie("jupiter")?.faraTexteleDemo, faraTexteleDemo);
});
