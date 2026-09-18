import assert from "node:assert/strict";
import { test, describe, beforeEach, after } from "node:test";

/**
 * ═══ MAILCHIMP, BREVO, KLAVIYO: CONFORM DOCUMENTATIEI LOR (18.09.2026) ═══
 *
 * Functiile se RULEAZA, cu un `fetch` de proba care inregistreaza fiecare cerere si raspunde
 * ce vrea proba. Fiecare afirmatie de mai jos vine dintr-un spec citit cap la cap:
 *
 *   - Klaviyo: `github.com/klaviyo/openapi`, `openapi/stable.json`, revizia 2026-07-15;
 *   - Brevo: `swagger_definition_v3.yml` si `developers.brevo.com/docs/limit-headers`;
 *   - Mailchimp: `mailchimp-client-lib-codegen/spec/marketing.json`.
 */

process.env.NEXT_PUBLIC_SITE_URL = "https://edinio.com";

type Apel = { metoda: string; url: string; corp: unknown; antete: Record<string, string>; redirect?: string; semnal: boolean };
type Raspuns = { status: number; corp?: unknown; antete?: Record<string, string> };

let apeluri: Apel[] = [];
let raspunde: (a: Apel) => Raspuns = () => ({ status: 200, corp: {} });

const fetchAdevarat = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const a: Apel = {
    metoda: init?.method ?? "GET",
    url,
    corp: init?.body ? JSON.parse(String(init.body)) : undefined,
    antete: Object.fromEntries(new Headers(init?.headers).entries()),
    redirect: init?.redirect,
    semnal: !!init?.signal,
  };
  apeluri.push(a);
  const r = raspunde(a);
  const fara = r.status === 204 || r.corp === undefined;
  return new Response(fara ? null : JSON.stringify(r.corp), { status: r.status, headers: r.antete });
}) as typeof fetch;
after(() => { globalThis.fetch = fetchAdevarat; });

beforeEach(() => {
  apeluri = [];
  raspunde = () => ({ status: 200, corp: {} });
});

const { cerereExterna, asteptareDupa429, ASTEPTARE_MAXIMA_MS } = await import("@/lib/email-marketing/transport");
const klaviyo = await import("@/lib/klaviyo");
const klaviyoEcom = await import("@/lib/klaviyo-ecommerce");
const brevo = await import("@/lib/brevo");
const brevoEcom = await import("@/lib/brevo-ecommerce");
const mailchimp = await import("@/lib/mailchimp");
const mailchimpEcom = await import("@/lib/mailchimp-ecommerce");
const { aFostRaportataCaVanzare, metricaKlaviyo } = await import("@/lib/klaviyo-sync");
const { stareFinanciaraMailchimp, atribuireMailchimp } = await import("@/lib/mailchimp-sync");
const { verdictDinEroare } = await import("@/lib/email-marketing/coada");

const fara = async () => {};

/* ══════════════════════════════════════════════════════════════════════════ */
describe("transportul comun", () => {
  test("429 se reia dupa `Retry-After`, apoi reuseste", async () => {
    let n = 0;
    raspunde = () => (++n === 1 ? { status: 429, corp: {}, antete: { "retry-after": "2" } } : { status: 200, corp: { ok: 1 } });
    const asteptari: number[] = [];
    const r = await cerereExterna("https://api.brevo.com/v3/x", { method: "POST", headers: {}, body: "{}" }, { dormi: async (ms) => { asteptari.push(ms); } });
    assert.ok("raspuns" in r && r.raspuns.status === 200);
    assert.equal(apeluri.length, 2);
    assert.deepEqual(asteptari, [2000]);
  });

  test("antetul Brevo `x-sib-ratelimit-reset` (secunde) e citit cand lipseste `Retry-After`", () => {
    assert.equal(asteptareDupa429(new Headers({ "x-sib-ratelimit-reset": "3" }), 0), 3000);
  });

  test("`Retry-After` ca data HTTP", () => {
    const acum = Date.parse("2026-09-18T10:00:00Z");
    assert.equal(asteptareDupa429(new Headers({ "retry-after": "Fri, 18 Sep 2026 10:00:04 GMT" }), 0, acum), 4000);
  });

  test("peste plafon NU se asteapta (o limita pe ORA nu se rezolva stand pe loc)", () => {
    assert.equal(asteptareDupa429(new Headers({ "x-sib-ratelimit-reset": "3600" }), 0), null);
    assert.equal(asteptareDupa429(new Headers({ "retry-after": String(ASTEPTARE_MAXIMA_MS / 1000 + 1) }), 0), null);
  });

  test("fara antet: 1s, apoi 2s", () => {
    assert.equal(asteptareDupa429(new Headers(), 0), 1000);
    assert.equal(asteptareDupa429(new Headers(), 1), 2000);
  });

  test("se renunta dupa doua reluari, cu statusul 429 intors", async () => {
    raspunde = () => ({ status: 429, corp: {}, antete: { "retry-after": "0" } });
    const r = await cerereExterna("https://a.klaviyo.com/api/x", { method: "GET", headers: {} }, { dormi: fara });
    assert.ok("raspuns" in r && r.raspuns.status === 429);
    assert.equal(apeluri.length, 3);
  });

  test("⚠ 500 si caderea de retea NU se reiau (un POST repetat poate dubla o comanda)", async () => {
    raspunde = () => ({ status: 500, corp: {} });
    await cerereExterna("https://a.klaviyo.com/api/x", { method: "POST", headers: {}, body: "{}" }, { dormi: fara });
    assert.equal(apeluri.length, 1);

    apeluri = [];
    raspunde = () => { throw new TypeError("fetch failed"); };
    const r = await cerereExterna("https://a.klaviyo.com/api/x", { method: "POST", headers: {}, body: "{}" }, { dormi: fara });
    assert.ok("retea" in r);
    assert.equal(apeluri.length, 1);
  });

  test("⚠ fara redirectari si cu termen, la toti trei (cheia API sta in antet)", async () => {
    raspunde = () => ({ status: 200, corp: { data: [] } });
    await klaviyo.getLists({ api_key: "pk_x" });
    await brevo.getLists({ api_key: "xkeysib-x" });
    await mailchimp.mcRequest({ api_key: "k-us21", server_prefix: "us21" }, "GET", "/lists");
    assert.equal(apeluri.length, 3);
    for (const a of apeluri) {
      assert.equal(a.redirect, "error", a.url);
      assert.ok(a.semnal, `${a.url}: fara termen`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe("Klaviyo", () => {
  const CONFIG = { enabled: true, api_key: "pk_proba", list_id: "LISTA1", ecommerce_sync: true };

  test("revizia e cea a specului stabil, iar cheia pleaca in forma lor", async () => {
    assert.equal(klaviyo.REVISION, "2026-07-15");
    raspunde = () => ({ status: 200, corp: { data: [] } });
    await klaviyo.getLists({ api_key: "pk_proba" });
    assert.equal(apeluri[0].antete.revision, "2026-07-15");
    assert.equal(apeluri[0].antete.authorization, "Klaviyo-API-Key pk_proba");
  });

  describe("⚠⚠ cine s-a dezabonat nu e readus in lista", () => {
    for (const reason of ["HARD_BOUNCE", "INVALID_EMAIL", "SPAM_COMPLAINT", "UNSUBSCRIBE", "USER_SUPPRESSED"]) {
      test(`suprimarea globala ${reason}`, () => {
        assert.equal(klaviyo.profilSuprimat({ suppression: [{ reason }] }, "LISTA1"), true);
      });
    }
    test("suprimat chiar pe lista noastra, da; pe alta lista, nu", () => {
      assert.equal(klaviyo.profilSuprimat({ list_suppressions: [{ list_id: "LISTA1", reason: "UNSUBSCRIBE" }] }, "LISTA1"), true);
      assert.equal(klaviyo.profilSuprimat({ list_suppressions: [{ list_id: "ALTA", reason: "UNSUBSCRIBE" }] }, "LISTA1"), false);
    });
    test("dezabonat, sau fara drept la marketing", () => {
      assert.equal(klaviyo.profilSuprimat({ consent: "UNSUBSCRIBED" }, "LISTA1"), true);
      assert.equal(klaviyo.profilSuprimat({ can_receive_email_marketing: false }, "LISTA1"), true);
    });
    test("un profil curat, sau unul inexistent, se aboneaza", () => {
      assert.equal(klaviyo.profilSuprimat({ consent: "NEVER_SUBSCRIBED", can_receive_email_marketing: true, suppression: [], list_suppressions: [] }, "LISTA1"), false);
      assert.equal(klaviyo.profilSuprimat(undefined, "LISTA1"), false);
    });

    test("abonarea intreaba INTAI starea si trimite numai profilele curate, cu sursa consimtamantului", async () => {
      raspunde = (a) => {
        if (a.metoda === "GET") {
          return { status: 200, corp: { data: [
            { attributes: { email: "spam@x.ro", subscriptions: { email: { marketing: { can_receive_email_marketing: false, suppression: [{ reason: "SPAM_COMPLAINT" }] } } } } },
            { attributes: { email: "curat@x.ro", subscriptions: { email: { marketing: { can_receive_email_marketing: true, suppression: [] } } } } },
          ], links: { next: null } } };
        }
        return { status: 202 };
      };
      const r = await klaviyo.subscribeProfiles(CONFIG, ["Spam@X.ro", "curat@x.ro", "nou@x.ro"], "Edinio: Checkout");
      assert.deepEqual(r, { ok: true, sariti: 1 });
      const [citire, abonare] = apeluri;
      const q = new URL(citire.url).searchParams;
      assert.equal(new URL(citire.url).pathname, "/api/profiles");
      assert.equal(q.get("additional-fields[profile]"), "subscriptions");
      assert.match(q.get("filter") ?? "", /^any\(email,\[/);
      assert.equal(abonare.metoda, "POST");
      assert.equal(new URL(abonare.url).pathname, "/api/profile-subscription-bulk-create-jobs");
      const attrs = (abonare.corp as { data: { attributes: { custom_source?: string; profiles: { data: Array<{ attributes: { email: string } }> } } } }).data.attributes;
      assert.equal(attrs.custom_source, "Edinio: Checkout");
      assert.deepEqual(attrs.profiles.data.map((p) => p.attributes.email), ["curat@x.ro", "nou@x.ro"]);
    });

    test("⚠ daca starea nu se poate citi, NU se aboneaza nimeni", async () => {
      raspunde = (a) => (a.metoda === "GET" ? { status: 403, corp: { errors: [{ detail: "missing scope" }] } } : { status: 202 });
      const r = await klaviyo.subscribeProfiles(CONFIG, ["a@x.ro"]);
      assert.ok("error" in r);
      assert.equal(apeluri.filter((a) => a.metoda === "POST").length, 0, "a abonat fara sa stie cine s-a dezabonat");
    });

    test("conectarea refuza o cheie care nu poate citi profilele", async () => {
      raspunde = (a) => (new URL(a.url).pathname === "/api/accounts"
        ? { status: 200, corp: { data: [{ attributes: { contact_information: { organization_name: "Magazin" } } }] } }
        : { status: 403, corp: { errors: [{ detail: "forbidden" }] } });
      const r = await klaviyo.pingKlaviyo("pk_proba");
      assert.ok("error" in r && /profiles:read/.test(r.error));
    });
  });

  describe("evenimentele de comanda", () => {
    const COMANDA = {
      id: "c1", email: "om@x.ro", first_name: "Ion", total: 123.456, currency: "RON",
      items: [
        { product_id: "p1", name: "Tricou", price: 50, quantity: 2, url: "https://m.ro/product/tricou" },
        { product_id: "p1", name: "Tricou (M)", price: 23.456, quantity: 1 },
      ],
    };

    test("corpul are campurile cerute de spec, moneda si `unique_id`", () => {
      const a = klaviyoEcom.corpEvenimentComanda("Placed Order", COMANDA).data.attributes;
      for (const k of ["properties", "metric", "profile"]) assert.ok(k in a, `lipseste ${k}`);
      assert.equal(a.value_currency, "RON");
      assert.equal(a.value, 123.46);
      assert.equal(a.unique_id, "c1");
      assert.equal(a.metric.data.attributes.name, "Placed Order");
      assert.equal(a.properties.Items[0].RowTotal, 100);
    });

    test("„Ordered Product” are `unique_id` pe LINIE (acelasi produs in doua variante nu se pierde)", () => {
      const a = klaviyoEcom.corpProdusComandat(COMANDA, 0).data.attributes;
      const b = klaviyoEcom.corpProdusComandat(COMANDA, 1).data.attributes;
      assert.notEqual(a.unique_id, b.unique_id);
      assert.equal(a.value, 100);
      assert.equal(a.value_currency, "RON");
      assert.equal(a.metric.data.attributes.name, "Ordered Product");
    });

    test("„Placed Order” pleaca cu cate un „Ordered Product” pe linie; anularea, singura", async () => {
      raspunde = () => ({ status: 202 });
      await klaviyoEcom.trackOrderEvent(CONFIG, "Placed Order", COMANDA);
      assert.deepEqual(apeluri.map((a) => (a.corp as { data: { attributes: { metric: { data: { attributes: { name: string } } } } } }).data.attributes.metric.data.attributes.name),
        ["Placed Order", "Ordered Product", "Ordered Product"]);
      apeluri = [];
      await klaviyoEcom.trackOrderEvent(CONFIG, "Cancelled Order", COMANDA);
      assert.equal(apeluri.length, 1);
    });

    test("vanzarea raportata: rambursul da, cardul numai dupa ce banii au intrat", () => {
      assert.equal(aFostRaportataCaVanzare("ramburs", "unpaid"), true);
      assert.equal(aFostRaportataCaVanzare("stripe", "unpaid"), false);
      assert.equal(aFostRaportataCaVanzare("netopia", "paid"), true);
      assert.equal(aFostRaportataCaVanzare("stripe", "refunded"), true);
    });
  });

  describe("catalogul", () => {
    const P = { id: "p1", title: "Tricou", url: "https://m.ro/product/tricou", price: 50 };
    test("produsul existent se actualizeaza cu un singur PATCH", async () => {
      raspunde = () => ({ status: 200, corp: {} });
      assert.deepEqual(await klaviyoEcom.upsertCatalogItem(CONFIG, P), { ok: true });
      assert.deepEqual(apeluri.map((a) => a.metoda), ["PATCH"]);
      assert.match(apeluri[0].url, /catalog-items\/%24custom%3A%3A%3A%24default%3A%3A%3Ap1$/);
    });
    test("produsul lipsa (404) se creeaza", async () => {
      raspunde = (a) => (a.metoda === "PATCH" ? { status: 404, corp: { errors: [{ detail: "not found" }] } } : { status: 201, corp: {} });
      assert.deepEqual(await klaviyoEcom.upsertCatalogItem(CONFIG, P), { ok: true });
      assert.deepEqual(apeluri.map((a) => a.metoda), ["PATCH", "POST"]);
      const at = (apeluri[1].corp as { data: { attributes: Record<string, unknown> } }).data.attributes;
      assert.equal(at.external_id, "p1");
      assert.equal(at.integration_type, "$custom");
    });
    test("⚠ o cheie respinsa NU mai aduce si un POST care ascunde eroarea", async () => {
      raspunde = () => ({ status: 401, corp: { errors: [{ detail: "bad key" }] } });
      const r = await klaviyoEcom.upsertCatalogItem(CONFIG, P);
      assert.ok("error" in r && r.status === 401);
      assert.equal(apeluri.length, 1);
    });
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe("Brevo", () => {
  const CONFIG = { enabled: true, api_key: "xkeysib-proba", list_id: 7, ecommerce_sync: true };

  test("⚠⚠ catalogul se ACTUALIZEAZA: `updateEnabled: true` (fara el, 400 pe orice produs existent)", async () => {
    raspunde = () => ({ status: 204 });
    await brevoEcom.upsertProduct(CONFIG, { id: "p1", name: "Tricou", price: 50 });
    assert.equal((apeluri[0].corp as { updateEnabled?: boolean }).updateEnabled, true);
  });

  test("⚠ liniile comenzii NU rescriu produsul: `updateEnabled: false`", async () => {
    raspunde = (a) => (new URL(a.url).pathname === "/v3/products" ? { status: 400, corp: { message: "Product already exists" } } : { status: 204 });
    const r = await brevoEcom.syncOrder(CONFIG, {
      id: "c1", email: "om@x.ro", status: "pending", amount: 70,
      lines: [{ product: { id: "p1", name: "Tricou (M)", price: 35 }, quantity: 2, price: 35 }],
    });
    assert.deepEqual(r, { ok: true }, "un produs deja existent a oprit comanda");
    const produs = apeluri.find((a) => new URL(a.url).pathname === "/v3/products");
    assert.equal((produs?.corp as { updateEnabled?: boolean }).updateEnabled, false);
  });

  test("lotul are cel mult 100 de produse si `updateEnabled: true`", async () => {
    raspunde = () => ({ status: 201, corp: {} });
    const produse = Array.from({ length: 250 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, price: 1 }));
    await brevoEcom.batchProducts(CONFIG, produse);
    assert.deepEqual(apeluri.map((a) => (a.corp as { products: unknown[] }).products.length), [100, 100, 50]);
    for (const a of apeluri) assert.equal((a.corp as { updateEnabled: boolean }).updateEnabled, true);
  });

  test("comanda are campurile cerute de spec, iar cantitatea cu zecimale pleaca in `quantityFloat`", () => {
    const c = brevoEcom.corpComanda({
      id: "c1", email: "om@x.ro", status: "cancelled", amount: 10,
      lines: [{ product: { id: "p1", name: "A", price: 2 }, quantity: 2, price: 2 }, { product: { id: "p2", name: "B", price: 4 }, quantity: 1.5, price: 4 }],
    }, "edinio_b", "2026-09-18T10:00:00.000Z");
    for (const k of ["id", "createdAt", "updatedAt", "status", "amount", "products"]) assert.ok(k in c, `lipseste ${k}`);
    assert.deepEqual(c.products[0], { productId: "p1", price: 2, quantity: 2 });
    assert.deepEqual(c.products[1], { productId: "p2", price: 4, quantityFloat: 1.5 });
    assert.equal(c.status, "cancelled");
  });

  test("confirmarea dubla: capatul lor, cu cele patru campuri cerute", async () => {
    raspunde = () => ({ status: 201 });
    const r = await brevo.createDoiContact({ ...CONFIG, double_optin: true, doi_template_id: 12 }, { email: "om@x.ro", fname: "Ion" }, "https://magazin.ro");
    assert.deepEqual(r, { ok: true });
    assert.equal(new URL(apeluri[0].url).pathname, "/v3/contacts/doubleOptinConfirmation");
    const corp = apeluri[0].corp as Record<string, unknown>;
    assert.deepEqual(corp.includeListIds, [7]);
    assert.equal(corp.templateId, 12);
    assert.equal(corp.redirectionUrl, "https://magazin.ro");
    assert.equal(corp.email, "om@x.ro");
  });

  test("⚠ un sablon obisnuit nu trece drept sablon de confirmare", async () => {
    raspunde = () => ({ status: 200, corp: { id: 3, name: "Newsletter", doiTemplate: false, isActive: true } });
    assert.ok("error" in (await brevo.verificaSablonDoi(CONFIG, 3)));
    raspunde = () => ({ status: 200, corp: { id: 12, name: "Confirmare", doiTemplate: true, isActive: true } });
    assert.deepEqual(await brevo.verificaSablonDoi(CONFIG, 12), { ok: true, name: "Confirmare" });
  });

  describe("webhookul", () => {
    test("⚠⚠ adresa e pe gazda canonica, nu pe apexul care raspunde 308", () => {
      assert.equal(brevo.brevoWebhookUrl("s1"), "https://www.edinio.com/api/brevo/webhook?secret=s1");
    });
    test("se inregistreaza cu dezabonare, respingere definitiva si spam", async () => {
      raspunde = (a) => (a.metoda === "GET" ? { status: 200, corp: { webhooks: [] } } : { status: 201, corp: { id: 9 } });
      const r = await brevo.registerWebhook(CONFIG, "https://www.edinio.com/api/brevo/webhook?secret=s1");
      assert.deepEqual(r, { ok: true, id: 9 });
      assert.deepEqual((apeluri[1].corp as { events: string[] }).events, ["unsubscribed", "hardBounce", "spam"]);
      assert.equal((apeluri[1].corp as { type: string }).type, "marketing");
    });
    test("unul vechi, doar cu dezabonarea, se ACTUALIZEAZA (nu se dubleaza)", async () => {
      const url = "https://www.edinio.com/api/brevo/webhook?secret=s1";
      raspunde = (a) => (a.metoda === "GET" ? { status: 200, corp: { webhooks: [{ id: 4, url, events: ["unsubscribed"] }] } } : { status: 204 });
      const r = await brevo.registerWebhook(CONFIG, url);
      assert.deepEqual(r, { ok: true, id: 4 });
      assert.equal(apeluri[1].metoda, "PUT");
      assert.match(apeluri[1].url, /\/webhooks\/4$/);
      assert.deepEqual(new Set((apeluri[1].corp as { events: string[] }).events), new Set(["unsubscribed", "hardBounce", "spam"]));
    });
    test("numele din CORP (`unsubscribe`, `hard_bounce`, `spam`) sunt recunoscute; restul nu suprima", () => {
      assert.equal(brevo.motivDeSuprimare("unsubscribe"), "unsubscribed");
      assert.equal(brevo.motivDeSuprimare("unsubscribed"), "unsubscribed");
      assert.equal(brevo.motivDeSuprimare("hard_bounce"), "hard_bounce");
      assert.equal(brevo.motivDeSuprimare("hardBounce"), "hard_bounce");
      assert.equal(brevo.motivDeSuprimare("spam"), "spam");
      for (const e of ["soft_bounce", "opened", "click", "delivered", "list_addition", ""]) assert.equal(brevo.motivDeSuprimare(e), null, e);
    });
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe("Mailchimp", () => {
  const CONFIG = { enabled: true, api_key: "k-us21", server_prefix: "us21", audience_id: "AUD2", ecommerce_sync: true, ecommerce_store_id: "edinio_b_AUD2" };

  test("⚠⚠ adresa webhookului e pe gazda canonica (Mailchimp o valideaza cu un GET si vrea 200, nu 308)", () => {
    assert.equal(mailchimp.mailchimpWebhookUrl("s1"), "https://www.edinio.com/api/mailchimp/webhook?secret=s1");
  });

  test("⚠ o linie de comanda NU rescrie produsul existent (pret de varianta, de treapta)", async () => {
    raspunde = (a) => (a.metoda === "GET" ? { status: 200, corp: { id: "p1" } } : { status: 200, corp: {} });
    await mailchimpEcom.syncOrder(CONFIG, "edinio_b_AUD2", {
      id: "c1", email: "om@x.ro", currency_code: "RON", total: 35,
      lines: [{ product: { id: "p1", title: "Tricou (M)", price: 35 }, quantity: 1, price: 35 }],
    });
    /* GET pe produs (exista, deci nu se atinge), apoi comanda prin PUT: „Add or update order”, idempotent. */
    assert.deepEqual(apeluri.map((a) => a.metoda), ["GET", "PUT"]);
    assert.match(apeluri[1].url, /\/orders\/c1$/);
  });

  test("produsul lipsa se creeaza din linie", async () => {
    raspunde = (a) => (a.metoda === "GET" ? { status: 404, corp: { detail: "not found" } } : { status: 200, corp: {} });
    await mailchimpEcom.ensureProduct(CONFIG, "edinio_b_AUD2", { id: "p9", title: "Nou", price: 10 });
    assert.deepEqual(apeluri.map((a) => a.metoda), ["GET", "POST"]);
  });

  test("anularea: `financial_status` si `cancelled_at_foreign`; rambursarea: doar statusul", async () => {
    assert.deepEqual(mailchimpEcom.corpComandaIntoarsa("anulata", "2026-09-18T10:00:00Z"), { financial_status: "cancelled", cancelled_at_foreign: "2026-09-18T10:00:00Z" });
    assert.deepEqual(mailchimpEcom.corpComandaIntoarsa("rambursata", "x"), { financial_status: "refunded" });
    raspunde = () => ({ status: 404, corp: {} });
    assert.deepEqual(await mailchimpEcom.markOrderReturned(CONFIG, "s", "c1", "anulata"), { ok: true }, "o comanda care n-a ajuns in Mailchimp n-are ce anula");
  });

  test("⚠ magazinul de comert e LEGAT DE AUDIENTA (`list_id` nu se poate schimba)", async () => {
    assert.equal(mailchimpEcom.mailchimpStoreId("b", "AUD2"), "edinio_b_AUD2");
    raspunde = () => ({ status: 200, corp: { id: "edinio_b", list_id: "AUD1" } });
    const r = await mailchimpEcom.ensureStore({ ...CONFIG, ecommerce_store_id: "edinio_b" }, "b", { name: "M", currency: "RON" });
    assert.ok("error" in r, "comenzile ar fi intrat in magazinul audientei vechi");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   COADA: triggerul din baza, ruterul, cronul
   ══════════════════════════════════════════════════════════════════════════

   ⚠ De la 18.09.2026 evenimentele de comanda nu mai pleaca din aplicatie: le scrie un trigger pe
   `orders` (migratia `2027-01-28-email-marketing-coada.sql`), iar cronul le trimite. Probele de mai
   jos citesc SURSA si stiu ce pot: spun ca legaturile exista. Purtarea triggerului a fost probata pe
   productie intr-o tranzactie anulata (vezi `docs/marketing/EMAIL-MARKETING.md`); a functiilor de
   trimitere, in `email-sync-runtime.test.ts`.
*/
describe("coada", async () => {
  const { readFileSync, readdirSync, statSync } = await import("node:fs");
  const citeste = (f: string) => readFileSync(f, "utf8");
  const MIGRATIA = citeste("migrations/2027-01-28-email-marketing-coada.sql");

  test("triggerul prinde crearea si ORICE schimbare de status sau de plata", () => {
    assert.match(MIGRATIA, /after insert on public\.orders/);
    assert.match(MIGRATIA, /after update of status, payment_status on public\.orders/);
    for (const [status, fel] of [["shipped", "expediata"], ["delivered", "livrata"], ["cancelled", "anulata"], ["refunded", "rambursata"]]) {
      assert.match(MIGRATIA, new RegExp(`new\\.status = '${status}' then v_feluri := v_feluri \\|\\| '${fel}'`), `${status} -> ${fel}`);
    }
    assert.match(MIGRATIA, /new\.payment_status = 'paid' then\s+v_feluri := v_feluri \|\| 'platita'/);
  });

  test("⚠ triggerul NU poate opri o comanda: orice eroare a lui se inghite", () => {
    assert.match(MIGRATIA, /exception when others then[\s\S]*?return new;/);
  });

  test("⚠ revendicarea pastreaza ordinea pe (comanda, furnizor) si o arenda mai lunga decat cronul", () => {
    /*
     * ⚠ CLAUZA INTREAGA, pana la paranteza care o inchide. Cautata doar pe inceput, o conditie
     * strecurata la coada (`and false`) o anula fara ca proba sa observe: bancul de mutanti a prins-o.
     */
    assert.match(MIGRATIA, /and not exists \(\s*select 1\s+from public\.email_marketing_coada p\s+where p\.order_id = c\.order_id\s+and p\.furnizor = c\.furnizor\s+and p\.id < c\.id\s+and p\.trimis_la is null\s+and p\.abandonat_la is null\s*\)/);
    assert.match(MIGRATIA, /for update skip locked/);
    const arendaMinute = Number(MIGRATIA.match(/now\(\) \+ interval '(\d+) minutes'/)?.[1]);
    const ruta = citeste("src/app/api/cron/email-marketing/route.ts");
    const maxDuration = Number(ruta.match(/export const maxDuration = (\d+);/)?.[1]);
    assert.ok(arendaMinute * 60 > maxDuration, `arenda (${arendaMinute} min) nu depaseste maxDuration (${maxDuration} s)`);
  });

  test("cronul e programat din minut in minut si cere secretul", () => {
    const v = JSON.parse(citeste("vercel.json")) as { crons: Array<{ path: string; schedule: string }> };
    assert.deepEqual(v.crons.find((c) => c.path === "/api/cron/email-marketing")?.schedule, "* * * * *");
    assert.match(citeste("src/app/api/cron/email-marketing/route.ts"), /if \(!verificaCron\(req\)\)/);
  });

  test("⚠ un singur loc trimite evenimentele de comanda: ruterul cozii", () => {
    const toate: string[] = [];
    const umbla = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = `${d}/${n}`;
        if (statSync(p).isDirectory()) umbla(p);
        else if (/\.tsx?$/.test(n) && !n.endsWith(".test.ts")) toate.push(p);
      }
    };
    umbla("src");
    assert.ok(toate.length > 100, "plasa n-a gasit fisierele");
    for (const f of toate) {
      const s = citeste(f);
      /* Definite in `*-sync.ts`, chemate NUMAI din ruter. */
      if (/eveniment(Mailchimp|Brevo|Klaviyo)\(/.test(s) && !f.endsWith("-sync.ts") && !f.endsWith("email-marketing/comanda.ts")) {
        assert.fail(`${f} trimite evenimente de comanda pe langa coada`);
      }
      assert.doesNotMatch(s, /void maybe(Sync|Track|Mark)(Mailchimp|Brevo|Klaviyo)/, `${f}: apel \`void\` gol catre un furnizor de email`);
      assert.doesNotMatch(s, /anuntaEmail(Plata|Intoarcere)\(/, `${f}: cablarea veche, pe langa coada, s-a intors`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe("⚠ campania Mailchimp se fotografiaza la aterizare si ajunge pe comanda", async () => {
  const { readFileSync } = await import("node:fs");

  test("`captureAttribution` rulata ea: `mc_cid` si `mc_tc` din adresa intra in fotografie", async () => {
    const memorie = new Map<string, string>();
    const g = globalThis as unknown as Record<string, unknown>;
    const inainte = { window: g.window, document: g.document, localStorage: g.localStorage };
    g.window = { location: { href: "https://magazin.ro/produse/tricou?mc_cid=a1b2c3d4e5&mc_tc=prec&mc_eid=xyz" } };
    g.document = { referrer: "", cookie: "" };
    g.localStorage = {
      getItem: (k: string) => memorie.get(k) ?? null,
      setItem: (k: string, v: string) => { memorie.set(k, v); },
      removeItem: (k: string) => { memorie.delete(k); },
      key: () => null,
      get length() { return memorie.size; },
    };
    try {
      const { captureAttribution } = await import("@/lib/storefront/attribution");
      captureAttribution("");
      const scrisa = JSON.parse(memorie.get("edinio_attribution") ?? "{}") as Record<string, string>;
      assert.equal(scrisa.mc_cid, "a1b2c3d4e5");
      assert.equal(scrisa.mc_tc, "prec");
      assert.equal(scrisa.landing, "/produse/tricou");
    } finally {
      g.window = inainte.window; g.document = inainte.document; g.localStorage = inainte.localStorage;
    }
  });

  test("serverul le pastreaza (lista alba a atribuirii)", () => {
    const s = readFileSync("src/lib/actions/order.actions.ts", "utf8");
    const lista = s.slice(s.indexOf("const CHEI_ATRIBUIRE"), s.indexOf("] as const;", s.indexOf("const CHEI_ATRIBUIRE")));
    assert.match(lista, /"mc_cid", "mc_tc"/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe("reguli pure ale evenimentelor", () => {
  test("verdictul unei erori: 5xx, 408, 409, 429 si reteaua se reiau; restul de 4xx e refuz", () => {
    for (const s of [undefined, 500, 503, 408, 409, 429]) assert.equal(verdictDinEroare({ error: "x", status: s }).fel, "esuat", String(s));
    for (const s of [400, 401, 403, 404, 422]) assert.equal(verdictDinEroare({ error: "x", status: s }).fel, "refuzat", String(s));
  });

  test("Klaviyo: metrica fiecarui eveniment, si cand nu pleaca nimic", () => {
    assert.deepEqual(metricaKlaviyo("creata", "ramburs", "unpaid"), { metric: "Placed Order" });
    assert.ok("sarit" in metricaKlaviyo("creata", "stripe", "unpaid"));
    assert.deepEqual(metricaKlaviyo("creata", "stripe", "paid"), { metric: "Placed Order" });
    assert.deepEqual(metricaKlaviyo("platita", "stripe", "paid"), { metric: "Placed Order" });
    assert.deepEqual(metricaKlaviyo("expediata", "ramburs", "unpaid"), { metric: "Fulfilled Order" });
    assert.deepEqual(metricaKlaviyo("livrata", "ramburs", "unpaid"), { metric: "Delivered Order" });
    assert.deepEqual(metricaKlaviyo("anulata", "ramburs", "unpaid"), { metric: "Cancelled Order" });
    assert.ok("sarit" in metricaKlaviyo("anulata", "stripe", "unpaid"));
    assert.deepEqual(metricaKlaviyo("rambursata", "stripe", "refunded"), { metric: "Refunded Order" });
  });

  test("Mailchimp: starea financiara din randul de acum", () => {
    assert.equal(stareFinanciaraMailchimp("pending", "unpaid"), "pending");
    assert.equal(stareFinanciaraMailchimp("shipped", "paid"), "paid");
    assert.equal(stareFinanciaraMailchimp("cancelled", "paid"), "cancelled");
    assert.equal(stareFinanciaraMailchimp("delivered", "refunded"), "refunded");
  });

  test("⚠ Mailchimp: campania, codul de urmarire si aterizarea, curatate", () => {
    assert.deepEqual(atribuireMailchimp({ mc_cid: "a1b2c3d4e5", mc_tc: "prec", landing: "/p/x" }, "https://magazin.ro"),
      { campaign_id: "a1b2c3d4e5", tracking_code: "prec", landing_site: "https://magazin.ro/p/x" });
    /* `prec` e SINGURA valoare permisa de spec; un id cu caractere ciudate nu pleaca. */
    assert.deepEqual(atribuireMailchimp({ mc_cid: "a1b<script>", mc_tc: "click" }, null), {});
    assert.deepEqual(atribuireMailchimp(null, "https://m.ro"), {});
  });

  test("Mailchimp: corpul comenzii duce reducerea, transportul, adresa si campania", () => {
    const c = mailchimpEcom.corpComanda({
      id: "c1", email: "Om@X.ro", currency_code: "RON", total: 90, financial_status: "pending",
      campaign_id: "abc", landing_site: "https://m.ro/p", tracking_code: "prec", shipping_total: 15, discount_total: 10,
      promos: [{ code: "T10", amount_discounted: 10, type: "fixed" }],
      shipping_address: { city: "Brasov", country_code: "RO", address1: undefined },
      lines: [{ product: { id: "p1", title: "A", price: 35 }, quantity: 2, price: 35 }],
    });
    for (const k of ["id", "customer", "currency_code", "order_total", "lines"]) assert.ok(k in c, `lipseste ${k}`);
    assert.equal(c.campaign_id, "abc");
    assert.deepEqual(c.shipping_address, { city: "Brasov", country_code: "RO" });
    assert.equal((c.customer as Record<string, unknown>).opt_in_status, false);
  });

  test("Mailchimp: operatiile lotului de catalog", () => {
    const ops = mailchimpEcom.operatiiCatalog("s1", [{ id: "p1", title: "A", price: 1, url: "https://m.ro/product/a" }], ["p9"]);
    assert.deepEqual(ops.map((o) => [o.method, o.path]), [["PUT", "/ecommerce/stores/s1/products/p1"], ["DELETE", "/ecommerce/stores/s1/products/p9"]]);
    assert.equal(JSON.parse((ops[0] as { body?: string }).body as string).variants[0].id, "p1");
  });

  test("Klaviyo: 250 de produse = 3 bucati, cate un job de creare si unul de actualizare", async () => {
    raspunde = () => ({ status: 202 });
    const produse = Array.from({ length: 250 }, (_, i) => ({ id: `p${i}`, title: `P${i}`, url: `https://m.ro/product/p${i}`, price: 1 }));
    const r = await klaviyoEcom.catalogInLot({ enabled: true, api_key: "pk_x", list_id: "L" }, produse);
    assert.deepEqual(r, { ok: true, joburi: 6 });
    assert.deepEqual(apeluri.map((a) => new URL(a.url).pathname.split("/").pop()), [
      "catalog-item-bulk-create-jobs", "catalog-item-bulk-update-jobs",
      "catalog-item-bulk-create-jobs", "catalog-item-bulk-update-jobs",
      "catalog-item-bulk-create-jobs", "catalog-item-bulk-update-jobs",
    ]);
    const n = (apeluri[4].corp as { data: { attributes: { items: { data: unknown[] } } } }).data.attributes.items.data.length;
    assert.equal(n, 50);
  });

  test("⚠⚠ Brevo: comertul se activeaza; 403 inseamna „in activare”, nu esec", async () => {
    raspunde = (a) => (new URL(a.url).pathname === "/v3/ecommerce/activate" ? { status: 200, corp: {} } : { status: 403, corp: { message: "eCommerce is not activated" } });
    assert.deepEqual(await brevo.asiguraComertul({ api_key: "k" }), { ok: true, moneda: "in-activare" });
    apeluri = [];
    raspunde = (a) => (new URL(a.url).pathname === "/v3/ecommerce/activate" ? { status: 400, corp: { message: "already activated" } }
      : a.metoda === "GET" ? { status: 200, corp: { code: "EUR" } } : { status: 200, corp: { code: "RON" } });
    assert.deepEqual(await brevo.asiguraComertul({ api_key: "k" }), { ok: true, moneda: "setata" });
    assert.deepEqual(apeluri.at(-1)?.corp, { code: "RON" });
  });

  test("Brevo: produsele scoase din vanzare pleaca in lot cu `isDeleted`", async () => {
    raspunde = () => ({ status: 201, corp: {} });
    await brevoEcom.batchProducts({ enabled: true, api_key: "k", list_id: 1 }, [{ id: "p3", name: "G", price: 9 }], true);
    assert.deepEqual((apeluri[0].corp as { products: unknown[] }).products, [{ id: "p3", name: "G", price: 9, isDeleted: true }]);
  });
});
