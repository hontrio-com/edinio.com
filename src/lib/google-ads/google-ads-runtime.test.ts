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
    __edinioAcordGoogle?: { analytics?: boolean; marketing?: boolean };
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
    /* Vizitatorul a acceptat: fara asta, coada tine evenimentele (vezi ultimul bloc din fisier). */
    g.__edinioAcordGoogle = { analytics: true, marketing: true };
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

/*
 * DATELE CLIENTULUI (enhanced conversions) SI ACORDUL DE MARKETING (25.11.2026).
 *
 * ⚠ Ce apara: de cand eticheta Google se incarca la orice vizita (consent mode avansat), `gtag` exista si la
 * cine a refuzat reclamele. Emailul si telefonul hash-uite ale unui asemenea om nu au voie sa ajunga la
 * eticheta. Intrebarea se pune in clipa in care apelul chiar ruleaza, dupa coada: acordul poate veni intre timp.
 */
describe("datele clientului pleaca spre eticheta numai cu acordul de marketing", () => {
  type Fereastra = {
    window?: unknown; location?: { href: string }; document?: { referrer: string };
    gtag?: (...a: unknown[]) => void;
    __edinioAcordGoogle?: { analytics?: boolean; marketing?: boolean };
    __edinioFlushQueue?: (v: string) => void;
    __edinioQ?: unknown[];
  };
  const g = globalThis as unknown as Fereastra;
  let gtagDateleClientului: (d: Record<string, unknown>) => void;
  let gtagRaw: (...a: unknown[]) => void;
  let gtagEvent: (e: string, d?: Record<string, unknown>) => void;
  const laGoogle: unknown[][] = [];
  const DATE = { sha256_email_address: "a".repeat(64), sha256_phone_number: "b".repeat(64) };

  before(async () => {
    g.window = globalThis;
    g.location = { href: "https://esafe.ro/confirm" };
    g.document = { referrer: "" };
    ({ gtagDateleClientului, gtagRaw, gtagEvent } = await import("@/lib/marketing"));
  });

  beforeEach(() => {
    laGoogle.length = 0;
    g.gtag = (...a: unknown[]) => { laGoogle.push(a); };
    g.__edinioQ = [];
    delete g.__edinioAcordGoogle;
  });

  test("cu acordul de marketing, datele ajung la eticheta", () => {
    g.__edinioAcordGoogle = { analytics: false, marketing: true };
    gtagDateleClientului(DATE);
    assert.deepEqual(laGoogle, [["set", "user_data", DATE]]);
  });

  test("⚠⚠ cu acordul doar pentru analiza, datele omului nu pleaca; conversia, da", () => {
    g.__edinioAcordGoogle = { analytics: true, marketing: false };
    gtagDateleClientului(DATE);
    gtagRaw("event", "conversion", { send_to: "AW-18567923104/abc" });
    assert.deepEqual(laGoogle, [["event", "conversion", { send_to: "AW-18567923104/abc" }]]);
  });

  test("⚠ fara stare cunoscuta se cade pe refuz: nimic nu pleaca", () => {
    gtagDateleClientului(DATE);
    assert.equal(laGoogle.length, 0);
    assert.equal(g.__edinioQ?.length, 1, "apelul nu a ramas in coada");
  });

  test("⚠ acordul se citeste cand apelul chiar ruleaza, dupa coada, iar datele raman inaintea conversiei", () => {
    /* Pagina de confirmare isi trage efectul inainte ca eticheta sa fi pornit: apelurile asteapta in coada. */
    delete g.gtag;
    gtagDateleClientului(DATE);
    gtagRaw("event", "conversion", { send_to: "AW-18567923104/abc" });
    /* `length`, nu `deepEqual` cu lista goala: acela ar ingusta tipul listei la „niciodata nimic”. */
    assert.equal(laGoogle.length, 0);

    /* Eticheta porneste, iar omul acceptase marketingul: scriptul ei de pornire goleste coada. */
    g.gtag = (...a: unknown[]) => { laGoogle.push(a); };
    g.__edinioAcordGoogle = { analytics: false, marketing: true };
    g.__edinioFlushQueue?.("ga");
    assert.deepEqual(laGoogle, [["set", "user_data", DATE], ["event", "conversion", { send_to: "AW-18567923104/abc" }]]);
  });

  test("⚠⚠ la cine a refuzat nu pleaca NIMIC, desi eticheta de reclame e in pagina", () => {
    /*
     * Eticheta de reclame poate porni inainte de raspunsul la banner, cu semnalele refuzate, ca Google Ads sa o
     * gaseasca pe site. `gtag` exista deci si la cine a refuzat. Evenimentele raman insa sub acord: numarul si
     * valoarea comenzii nu pleaca de la el.
     */
    g.__edinioAcordGoogle = { analytics: false, marketing: false };
    gtagEvent("purchase", { transaction_id: "c1", value: 163.98 });
    gtagDateleClientului(DATE);
    gtagRaw("event", "conversion", { send_to: "AW-18567923104/abc", transaction_id: "c1" });
    assert.equal(laGoogle.length, 0);
    g.__edinioFlushQueue?.("ga");
    assert.equal(laGoogle.length, 0, "golirea cozii a trimis evenimentele fara acord");
    assert.equal(g.__edinioQ?.length, 3);
  });

  test("⚠ daca omul accepta pe aceeasi pagina, evenimentele asteptate pleaca in ordinea lor", () => {
    g.__edinioAcordGoogle = { analytics: false, marketing: false };
    gtagEvent("purchase", { transaction_id: "c1", value: 163.98 });
    gtagDateleClientului(DATE);
    gtagRaw("event", "conversion", { send_to: "AW-18567923104/abc" });
    /* Bannerul: `__edinioGoogleRaspuns` scrie acordul, apoi goleste coada. */
    g.__edinioAcordGoogle = { analytics: true, marketing: true };
    g.__edinioFlushQueue?.("ga");
    assert.deepEqual(laGoogle.map((c) => (c as unknown[]).slice(0, 2)), [["event", "purchase"], ["set", "user_data"], ["event", "conversion"]]);
    assert.equal(g.__edinioQ?.length, 0);
  });
});
