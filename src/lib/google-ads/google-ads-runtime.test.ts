import assert from "node:assert/strict";
import { test, describe, before, beforeEach } from "node:test";

/**
 * RUNTIME-UL `gtagEvent`, RULAT CHIAR EL (18.09.2026).
 *
 * ⚠ Ce apara: articolele primesc ID-ul de oferta si `google_business_vertical` NUMAI cand magazinul are un ID
 * de conversie Google Ads, si `item_id` (al GA4) ramane neatins. Fara asta, remarketingul dinamic n-are ce
 * arata, iar cu asta pusa peste tot ar fi plecat campuri in plus in GA4-ul oricui.
 */

type Rand = Record<string, unknown>;

describe("articolele pentru remarketingul dinamic", () => {
  type Fereastra = {
    window?: unknown; location?: { href: string }; document?: { referrer: string };
    gtag?: (...a: unknown[]) => void; __edinioGoogleAds?: { id?: string };
  };
  const g = globalThis as unknown as Fereastra;
  let gtagEvent: (e: string, d?: Record<string, unknown>) => void;
  const laGoogle: unknown[][] = [];

  before(async () => {
    g.window = globalThis;
    g.location = { href: "https://caian-textile.ro/product/husa" };
    g.document = { referrer: "" };
    ({ gtagEvent } = await import("@/lib/marketing"));
  });

  beforeEach(() => {
    laGoogle.length = 0;
    g.gtag = (...a: unknown[]) => { laGoogle.push(a); };
    delete g.__edinioGoogleAds;
  });

  const ultimul = () => laGoogle[laGoogle.length - 1] as [string, string, Rand];

  test("⚠ cu ID de conversie: `id` si `google_business_vertical`, fara sa atinga `item_id`", () => {
    g.__edinioGoogleAds = { id: "AW-123456789" };
    gtagEvent("add_to_cart", {
      currency: "RON", value: 90,
      items: [{ item_id: "p1", id: "p1-rosu", item_name: "Husa", price: 45, quantity: 2 }],
    });
    const [, nume, date] = ultimul();
    assert.equal(nume, "add_to_cart");
    assert.deepEqual(date.items, [{
      item_id: "p1", id: "p1-rosu", item_name: "Husa", price: 45, quantity: 2, google_business_vertical: "retail",
    }]);
  });

  test("fara `id` dat de apelant, se foloseste `item_id`", () => {
    g.__edinioGoogleAds = { id: "AW-123456789" };
    gtagEvent("view_cart", { items: [{ item_id: "simplu", quantity: 1 }] });
    assert.deepEqual(ultimul()[2].items, [{ item_id: "simplu", quantity: 1, id: "simplu", google_business_vertical: "retail" }]);
  });

  test("⚠ fara ID de conversie Google Ads, articolele raman EXACT cum erau", () => {
    gtagEvent("view_item", { currency: "RON", items: [{ item_id: "p1", item_name: "Husa" }] });
    assert.deepEqual(ultimul()[2], { currency: "RON", items: [{ item_id: "p1", item_name: "Husa" }] });
  });

  test("un eveniment fara articole trece neschimbat, iar un articol fara ID nu primeste fel", () => {
    g.__edinioGoogleAds = { id: "AW-123456789" };
    gtagEvent("search", { search_term: "ciorapi" });
    assert.deepEqual(ultimul()[2], { search_term: "ciorapi" });
    gtagEvent("view_item_list", { items: [{ item_name: "fara id" }] });
    assert.deepEqual(ultimul()[2].items, [{ item_name: "fara id" }]);
  });
});
