import assert from "node:assert/strict";
import { test, describe, before, beforeEach, after } from "node:test";
import { register } from "node:module";
import http from "node:http";
import type { AddressInfo } from "node:net";

/**
 * ═══ DISPECERII DE EMAIL, RULATI CHIAR EI (18.09.2026) ═══
 *
 * Baza e un PostgREST de proba (server HTTP local), furnizorii sunt un `fetch` de proba care
 * inregistreaza fiecare cerere. Se ruleaza functiile adevarate din `*-sync.ts`, ruta
 * webhookului Brevo si actiunea `saveBrevoSettings`.
 *
 * ⚠ CE APARA:
 *   - Klaviyo nu raporteaza venit pentru o plata cu cardul neincasata, si il raporteaza cand
 *     banii intra; anularea pleaca numai pentru ce a fost raportat ca vanzare;
 *   - anularea si rambursarea ajung la toti trei;
 *   - cumparatorul de marketplace nu ajunge la niciunul (poarta sta in cititorul comenzii);
 *   - linkurile de produs sunt pe domeniul propriu al magazinului;
 *   - un produs respins nu mai opreste tot lotul;
 *   - webhookul Brevo scrie respingerile si spamul, nu doar dezabonarile;
 *   - confirmarea dubla Brevo nu porneste cu un sablon care nu e de confirmare.
 */

type Rand = Record<string, unknown>;
const U1 = "u9000000-0000-4000-8000-000000000001";
const BIZ = "b9000000-0000-4000-8000-000000000001";

let TABELE: Record<string, Rand[]> = {};
let scrieri: Array<{ tabel: string; metoda: string; corp: unknown }> = [];

function valoare(r: Rand, cheie: string): unknown {
  if (cheie.includes("->>")) {
    const [col, camp] = cheie.split("->>");
    const obj = r[col] as Rand | null | undefined;
    return obj ? obj[camp] : undefined;
  }
  return r[cheie];
}

function filtreaza(randuri: Rand[], url: URL): Rand[] {
  return randuri.filter((r) => {
    for (const [k, v] of url.searchParams) {
      if (["select", "limit", "order", "offset", "on_conflict", "columns"].includes(k)) continue;
      const val = valoare(r, k);
      if (v.startsWith("eq.")) { if (String(val) !== v.slice(3)) return false; continue; }
      if (v.startsWith("in.(")) {
        const lista = v.slice(4, -1).split(",").map((x) => x.replace(/^"|"$/g, ""));
        if (!lista.includes(String(val))) return false;
        continue;
      }
      if (v === "is.null") { if (val !== null && val !== undefined) return false; continue; }
      if (v === "not.is.null") { if (val === null || val === undefined) return false; continue; }
      throw new Error(`operator neasteptat: ${k}=${v}`);
    }
    return true;
  });
}

const baza = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://baza");
  const tabel = url.pathname.replace("/rest/v1/", "");
  let corpBrut = "";
  req.on("data", (b) => (corpBrut += b));
  req.on("end", () => {
    const json = (cod: number, corp: unknown) => { res.writeHead(cod, { "content-type": "application/json" }); res.end(JSON.stringify(corp)); };
    /*
     * ⚠ O eroare aici se RASPUNDE (400), nu se arunca: aruncata in handler, raspunsul nu mai
     * pleca, cererea atarna, iar o proba „cadea” din termen, adica din motivul gresit.
     */
    try {
      const randuri = TABELE[tabel];
      if (!randuri) return json(404, { message: `tabel de proba necunoscut: ${tabel}` });
      if (req.method === "POST" || req.method === "PATCH" || req.method === "DELETE") {
        const corp = corpBrut ? JSON.parse(corpBrut) : null;
        scrieri.push({ tabel, metoda: req.method, corp });
        if (req.method === "PATCH") for (const r of filtreaza(randuri, url)) Object.assign(r, corp as Rand);
        if (req.method === "POST") randuri.push(...(Array.isArray(corp) ? corp : [corp]));
        res.writeHead(req.method === "POST" ? 201 : 204);
        return res.end();
      }
      const gasite = filtreaza(randuri, url);
      if (!(req.headers.accept ?? "").includes("vnd.pgrst.object")) return json(200, gasite);
      if (gasite.length !== 1) return json(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
      return json(200, gasite[0]);
    } catch (e) {
      return json(400, { message: (e as Error).message });
    }
  });
});

/* ── furnizorii ────────────────────────────────────────────────────────── */
type Apel = { metoda: string; url: string; corp: unknown };
let apeluri: Apel[] = [];
let raspunde: (a: Apel) => { status: number; corp?: unknown } = () => ({ status: 200, corp: {} });
const fetchAdevarat = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith("http://127.0.0.1")) return fetchAdevarat(input, init);
  const a: Apel = { metoda: init?.method ?? "GET", url, corp: init?.body ? JSON.parse(String(init.body)) : undefined };
  apeluri.push(a);
  const r = raspunde(a);
  const gol = r.status === 204 || r.corp === undefined;
  return new Response(gol ? null : JSON.stringify(r.corp), { status: r.status });
}) as typeof fetch;

const HOOK = `data:text/javascript,${encodeURIComponent(
  `export async function resolve(specifier, context, next) {
     if (specifier === "@/lib/supabase/server") {
       return { url: "data:text/javascript," + encodeURIComponent("export const createClient = async () => globalThis.__clientDeProba();"), shortCircuit: true, format: "module" };
     }
     if (specifier === "next/cache") {
       return { url: "data:text/javascript," + encodeURIComponent("export const revalidatePath = () => {}; export const revalidateTag = () => {};"), shortCircuit: true, format: "module" };
     }
     return next(specifier, context);
   }`,
)}`;

let K: typeof import("@/lib/klaviyo-sync");
let B: typeof import("@/lib/brevo-sync");
let M: typeof import("@/lib/mailchimp-sync");
let rutaBrevo: typeof import("@/app/api/brevo/webhook/route");
let actiuniBrevo: typeof import("@/lib/actions/brevo.actions");
let NextRequestCls: typeof import("next/server").NextRequest;
const g = globalThis as unknown as { __clientDeProba: () => unknown };

before(async () => {
  await new Promise<void>((r) => baza.listen(0, "127.0.0.1", () => r()));
  const { port } = baza.address() as AddressInfo;
  const adresa = `http://127.0.0.1:${port}`;
  process.env.NEXT_PUBLIC_SUPABASE_URL = adresa;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "cheie-anonima-de-proba";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "cheie-de-serviciu-de-proba";
  process.env.NEXT_PUBLIC_SITE_URL = "https://edinio.com";
  register(HOOK);
  const { createClient } = await import("@supabase/supabase-js");
  const adevarat = createClient(adresa, "cheie-anonima-de-proba", { auth: { autoRefreshToken: false, persistSession: false } });
  g.__clientDeProba = () => ({
    auth: { getUser: async () => ({ data: { user: { id: U1 } }, error: null }) },
    from: (t: string) => adevarat.from(t),
  });
  K = await import("@/lib/klaviyo-sync");
  B = await import("@/lib/brevo-sync");
  M = await import("@/lib/mailchimp-sync");
  rutaBrevo = await import("@/app/api/brevo/webhook/route");
  actiuniBrevo = await import("@/lib/actions/brevo.actions");
  NextRequestCls = (await import("next/server")).NextRequest;
});

after(async () => {
  globalThis.fetch = fetchAdevarat;
  await new Promise<void>((r) => baza.close(() => r()));
});

const MAGAZIN = { slug: "magazin", custom_domain: "magazin.ro" };
const LINII = [
  { product_id: "p1", name: "Tricou (M)", price: 35, quantity: 2, slug: "tricou" },
  { product_id: "p2", name: "Sapca", price: 20, quantity: 1 },
];
const comanda = (id: string, extra: Rand = {}): Rand => ({
  id, business_id: BIZ, customer_email: "om@x.ro", customer_name: "Ion Pop", total: 90, items: LINII,
  created_at: "2026-09-18T08:00:00Z", order_source: null, payment_method: "ramburs", payment_status: "unpaid",
  businesses: MAGAZIN, ...extra,
});

beforeEach(() => {
  apeluri = [];
  scrieri = [];
  raspunde = () => ({ status: 202 });
  TABELE = {
    businesses: [{ id: BIZ, user_id: U1, ...MAGAZIN }],
    store_settings: [{
      business_id: BIZ,
      klaviyo_config: { enabled: true, api_key: "pk_proba", list_id: "L1", ecommerce_sync: true },
      brevo_config: { enabled: true, api_key: "xkeysib-proba", list_id: 7, ecommerce_sync: true, webhook_secret: "secret-brevo" },
      mailchimp_config: { enabled: true, api_key: "k-us21", server_prefix: "us21", audience_id: "AUD", ecommerce_sync: true, ecommerce_store_id: "edinio_b_AUD" },
    }],
    orders: [
      comanda("c-ramburs"),
      comanda("c-card-neplatit", { payment_method: "stripe", payment_status: "unpaid" }),
      comanda("c-card-platit", { payment_method: "stripe", payment_status: "paid" }),
      comanda("c-marketplace", { order_source: { marketplace: "emag" } }),
    ],
    products: [
      { id: "p1", business_id: BIZ, name: "Tricou", price: 30, images: ["https://img/1.jpg"], slug: "tricou", description: null },
      { id: "p2", business_id: BIZ, name: "Sapca", price: 20, images: [], slug: null, description: null },
      { id: "p3", business_id: BIZ, name: "Geanta", price: 99, images: [], slug: "geanta", description: "Din piele" },
    ],
    brevo_suppressions: [],
    mailchimp_suppressions: [],
    error_logs: [],
  };
});

const numeMetrica = (a: Apel) => (a.corp as { data?: { attributes?: { metric?: { data?: { attributes?: { name?: string } } } } } })?.data?.attributes?.metric?.data?.attributes?.name;
const catre = (gazda: string) => apeluri.filter((a) => new URL(a.url).host === gazda);

/* ══════════════════════════════════════════════════════════════════════════ */
describe("Klaviyo: venitul pleaca numai pentru vanzari", () => {
  test("⚠ la plata cu cardul, NIMIC la creare", async () => {
    await K.maybeTrackKlaviyoOrder({ businessId: BIZ, orderSource: null, paymentMethod: "stripe", order: { id: "x", email: "om@x.ro", total: 90, items: LINII } });
    assert.equal(apeluri.length, 0);
  });

  test("la ramburs, „Placed Order” si cate un „Ordered Product” pe linie, la creare", async () => {
    await K.maybeTrackKlaviyoOrder({ businessId: BIZ, orderSource: null, paymentMethod: "ramburs", storeUrl: "https://magazin.ro", order: { id: "x", email: "om@x.ro", total: 90, items: LINII } });
    assert.deepEqual(apeluri.map(numeMetrica), ["Placed Order", "Ordered Product", "Ordered Product"]);
  });

  test("cand banii intra, „Placed Order”, cu linkurile pe domeniul propriu", async () => {
    await K.maybeMarkKlaviyoOrderPaid("c-card-platit");
    assert.equal(numeMetrica(apeluri[0]), "Placed Order");
    const items = (apeluri[0].corp as { data: { attributes: { properties: { Items: Array<{ ProductURL?: string }> } } } }).data.attributes.properties.Items;
    assert.equal(items[0].ProductURL, "https://magazin.ro/product/tricou");
    assert.equal(items[1].ProductURL, "https://magazin.ro/product/p2", "produsul fara slug n-a primit link");
  });

  test("⚠ anularea unui card NEPLATIT nu pleaca (n-a fost niciodata „Placed Order”)", async () => {
    await K.maybeMarkKlaviyoOrderReturned("c-card-neplatit", "anulata");
    assert.equal(apeluri.length, 0);
  });

  test("anularea unui ramburs pleaca drept „Cancelled Order”, rambursarea drept „Refunded Order”", async () => {
    await K.maybeMarkKlaviyoOrderReturned("c-ramburs", "anulata");
    await K.maybeMarkKlaviyoOrderReturned("c-card-platit", "rambursata");
    assert.deepEqual(apeluri.map(numeMetrica), ["Cancelled Order", "Refunded Order"]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe("anularea si rambursarea ajung la toti trei", () => {
  test("Brevo: comanda se retrimite cu statusul nou", async () => {
    raspunde = (a) => (new URL(a.url).pathname === "/v3/products" ? { status: 400, corp: { message: "exists" } } : { status: 204 });
    await B.maybeMarkBrevoOrderReturned("c-ramburs", "rambursata");
    const cmd = apeluri.find((a) => new URL(a.url).pathname === "/v3/orders/status");
    assert.equal((cmd?.corp as { status: string }).status, "refunded");
    assert.equal((cmd?.corp as { id: string }).id, "c-ramburs");
  });

  test("Mailchimp: `financial_status: cancelled` si data anularii", async () => {
    raspunde = () => ({ status: 200, corp: {} });
    await M.maybeMarkMailchimpOrderReturned("c-ramburs", "anulata");
    assert.equal(apeluri.length, 1);
    assert.equal(apeluri[0].metoda, "PATCH");
    assert.match(apeluri[0].url, /\/ecommerce\/stores\/edinio_b_AUD\/orders\/c-ramburs$/);
    assert.equal((apeluri[0].corp as { financial_status: string }).financial_status, "cancelled");
    assert.ok((apeluri[0].corp as { cancelled_at_foreign?: string }).cancelled_at_foreign);
  });

  test("⚠⚠ cumparatorul de marketplace nu ajunge la NICIUNUL", async () => {
    await K.maybeMarkKlaviyoOrderPaid("c-marketplace");
    await K.maybeMarkKlaviyoOrderReturned("c-marketplace", "anulata");
    await B.maybeMarkBrevoOrderPaid("c-marketplace");
    await B.maybeMarkBrevoOrderReturned("c-marketplace", "anulata");
    await M.maybeMarkMailchimpOrderPaid("c-marketplace");
    await M.maybeMarkMailchimpOrderReturned("c-marketplace", "anulata");
    assert.equal(apeluri.length, 0);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe("abonarea Brevo", () => {
  test("⚠ cu confirmarea dubla pornita, pleaca pe capatul DOI, cu intoarcere in magazin", async () => {
    (TABELE.store_settings[0].brevo_config as Rand).double_optin = true;
    (TABELE.store_settings[0].brevo_config as Rand).doi_template_id = 12;
    raspunde = () => ({ status: 201 });
    await B.maybeSyncBrevoSubscriber({ businessId: BIZ, source: "checkout", email: "om@x.ro", name: "Ion Pop" });
    assert.equal(apeluri.length, 1);
    assert.equal(new URL(apeluri[0].url).pathname, "/v3/contacts/doubleOptinConfirmation");
    assert.equal((apeluri[0].corp as { redirectionUrl: string }).redirectionUrl, "https://magazin.ro");
  });

  test("fara ea, contactul se adauga direct", async () => {
    raspunde = () => ({ status: 201, corp: { id: 1 } });
    await B.maybeSyncBrevoSubscriber({ businessId: BIZ, source: "checkout", email: "om@x.ro" });
    assert.equal(new URL(apeluri[0].url).pathname, "/v3/contacts");
  });

  test("cine e in suprimari (dezabonat, respins, spam) nu mai pleaca deloc", async () => {
    TABELE.brevo_suppressions.push({ id: 1, business_id: BIZ, email: "om@x.ro", reason: "spam" });
    await B.maybeSyncBrevoSubscriber({ businessId: BIZ, source: "checkout", email: "Om@X.ro" });
    assert.equal(apeluri.length, 0);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe("catalogul in lot", () => {
  test("Brevo: un singur lot, `updateEnabled`, linkuri pe domeniul propriu", async () => {
    raspunde = () => ({ status: 201, corp: {} });
    await B.maybeSyncBrevoProductsBulk({ businessId: BIZ, ids: ["p1", "p2", "p3"], action: "upsert" });
    assert.equal(apeluri.length, 1);
    assert.equal(new URL(apeluri[0].url).pathname, "/v3/products/batch");
    const corp = apeluri[0].corp as { updateEnabled: boolean; products: Array<{ id: string; url?: string }> };
    assert.equal(corp.updateEnabled, true);
    assert.equal(corp.products.find((p) => p.id === "p1")?.url, "https://magazin.ro/product/tricou");
    assert.equal(corp.products.find((p) => p.id === "p2")?.url, "https://magazin.ro/product/p2");
  });

  test("⚠ Klaviyo: un produs respins NU mai opreste restul lotului, si se scrie o data", async () => {
    let n = 0;
    raspunde = () => (++n === 1 ? { status: 400, corp: { errors: [{ detail: "invalid price" }] } } : { status: 200, corp: {} });
    await K.maybeSyncKlaviyoProductsBulk({ businessId: BIZ, ids: ["p1", "p2", "p3"], action: "upsert" });
    assert.equal(apeluri.filter((a) => a.metoda === "PATCH").length, 3, "lotul s-a oprit la primul produs respins");
    const jurnal = scrieri.filter((s) => s.tabel === "error_logs");
    assert.equal(jurnal.length, 1);
    assert.match(JSON.stringify(jurnal[0].corp), /1 din 3/);
  });

  test("Klaviyo: o cheie respinsa opreste lotul (s-ar repeta la fiecare produs)", async () => {
    raspunde = () => ({ status: 401, corp: { errors: [{ detail: "bad key" }] } });
    await K.maybeSyncKlaviyoProductsBulk({ businessId: BIZ, ids: ["p1", "p2", "p3"], action: "upsert" });
    assert.equal(apeluri.length, 1);
  });

  test("Mailchimp: produsul primeste link (pana acum nu primea niciunul)", async () => {
    raspunde = (a) => (a.metoda === "GET" ? { status: 404, corp: {} } : { status: 200, corp: {} });
    await M.maybeSyncMailchimpProduct({ businessId: BIZ, action: "upsert", product: { id: "p3", name: "Geanta", price: 99, slug: "geanta" } });
    const post = apeluri.find((a) => a.metoda === "POST");
    assert.equal((post?.corp as { url?: string }).url, "https://magazin.ro/product/geanta");
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe("ruta webhookului Brevo, rulata ea", () => {
  const trimite = (corp: unknown, secret = "secret-brevo") => rutaBrevo.POST(new NextRequestCls(
    `https://www.edinio.com/api/brevo/webhook?secret=${secret}`,
    { method: "POST", body: JSON.stringify(corp), headers: { "content-type": "application/json" } },
  ));

  for (const [event, motiv] of [["unsubscribe", "unsubscribed"], ["hard_bounce", "hard_bounce"], ["spam", "spam"]] as const) {
    test(`„${event}” se scrie in suprimari cu motivul „${motiv}”`, async () => {
      const r = await trimite({ event, email: " Om@X.ro " });
      assert.equal(r.status, 200);
      const s = scrieri.find((x) => x.tabel === "brevo_suppressions");
      assert.ok(s, "nu s-a scris nimic");
      assert.deepEqual(s.corp, { business_id: BIZ, email: "om@x.ro", reason: motiv });
    });
  }

  test("deschiderile, clickurile si respingerile temporare nu suprima", async () => {
    for (const event of ["opened", "click", "soft_bounce", "delivered"]) await trimite({ event, email: "om@x.ro" });
    assert.equal(scrieri.filter((x) => x.tabel === "brevo_suppressions").length, 0);
  });

  test("un secret strain nu scrie nimic, dar raspunde tot 200", async () => {
    const r = await trimite({ event: "spam", email: "om@x.ro" }, "alt-secret");
    assert.equal(r.status, 200);
    assert.equal(scrieri.length, 0);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe("`saveBrevoSettings`, rulat el: confirmarea dubla", () => {
  const furnizor = (doiTemplate: boolean) => (a: Apel) => {
    const p = new URL(a.url).pathname;
    if (p.startsWith("/v3/smtp/templates/")) return { status: 200, corp: { id: 12, name: "Confirmare", doiTemplate, isActive: true } };
    if (p === "/v3/contacts/attributes") return { status: 200, corp: { attributes: [{ name: "SOURCE" }, { name: "COUNTY" }, { name: "ORDER_VALUE" }, { name: "PHONE" }] } };
    if (p === "/v3/webhooks" && a.metoda === "GET") return { status: 200, corp: { webhooks: [] } };
    return { status: 201, corp: { id: 5 } };
  };

  test("⚠ un sablon care nu e de confirmare e refuzat, si nu se scrie nimic", async () => {
    raspunde = furnizor(false);
    const r = await actiuniBrevo.saveBrevoSettings(BIZ, { double_optin: true, doi_template_id: 12 });
    assert.ok("error" in r && /confirmare dubla/.test(r.error));
    assert.equal(scrieri.filter((s) => s.tabel === "store_settings").length, 0);
  });

  test("fara sablon ales, refuzat", async () => {
    raspunde = furnizor(true);
    const r = await actiuniBrevo.saveBrevoSettings(BIZ, { double_optin: true, doi_template_id: null });
    assert.ok("error" in r);
  });

  test("cu un sablon de confirmare adevarat, se salveaza cu numele lui, iar webhookul pleaca pe gazda canonica", async () => {
    raspunde = furnizor(true);
    const r = await actiuniBrevo.saveBrevoSettings(BIZ, { double_optin: true, doi_template_id: 12 });
    assert.ok("config" in r, JSON.stringify(r));
    assert.equal(r.config.double_optin, true);
    assert.equal(r.config.doi_template_name, "Confirmare");
    const hook = apeluri.find((a) => new URL(a.url).pathname === "/v3/webhooks" && a.metoda === "POST");
    assert.equal((hook?.corp as { url: string }).url, "https://www.edinio.com/api/brevo/webhook?secret=secret-brevo");
  });

  test("⚠ importul clientilor existenti e refuzat cat timp confirmarea dubla e pornita (ar ocoli-o)", async () => {
    (TABELE.store_settings[0].brevo_config as Rand).double_optin = true;
    (TABELE.store_settings[0].brevo_config as Rand).doi_template_id = 12;
    const r = await actiuniBrevo.syncExistingCustomers(BIZ);
    assert.ok("error" in r && /confirmarea dubla/.test(r.error));
    assert.equal(catre("api.brevo.com").length, 0);
  });
});
