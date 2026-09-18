import assert from "node:assert/strict";
import { test, describe, before, beforeEach, after } from "node:test";
import { register } from "node:module";
import http from "node:http";
import type { AddressInfo } from "node:net";

/**
 * ═══ DISPECERII DE EMAIL, RULATI CHIAR EI (18.09.2026) ═══
 *
 * Baza e un PostgREST de proba (server HTTP local), furnizorii sunt un `fetch` de proba care
 * inregistreaza fiecare cerere. Se ruleaza functiile adevarate din `*-sync.ts`, CHIAR RUTA cronului
 * care goleste coada, ruta webhookului Brevo si actiunea `saveBrevoSettings`.
 *
 * ⚠ CE APARA:
 *   - evenimentele de comanda din coada ajung la fiecare furnizor in forma lui (Klaviyo: metrici;
 *     Brevo: comanda intreaga cu statusul de acum; Mailchimp: comanda prin PUT, apoi schimbari punctuale);
 *   - Klaviyo nu raporteaza venit pentru o plata cu cardul neincasata;
 *   - cumparatorul de marketplace nu ajunge la niciunul (poarta sta in cititorul comenzii);
 *   - cronul insemneaza corect fiecare verdict: trimis, sarit, refuzat (abandon pe loc), esuat (reincercare);
 *   - catalogul intreg pleaca in loturi, dupa starea din baza (activ, stins, sters);
 *   - webhookul Brevo scrie respingerile si spamul, nu doar dezabonarile;
 *   - confirmarea dubla Brevo nu porneste cu un sablon care nu e de confirmare.
 */

type Rand = Record<string, unknown>;
const U1 = "u9000000-0000-4000-8000-000000000001";
const BIZ = "b9000000-0000-4000-8000-000000000001";

let TABELE: Record<string, Rand[]> = {};
let scrieri: Array<{ tabel: string; metoda: string; corp: unknown; url: string }> = [];
let REVENDICATE: Rand[] = [];

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
      if (tabel === "rpc/email_marketing_revendica") return json(200, REVENDICATE);
      const randuri = TABELE[tabel];
      if (!randuri) return json(404, { message: `tabel de proba necunoscut: ${tabel}` });
      if (req.method === "POST" || req.method === "PATCH" || req.method === "DELETE") {
        const corp = corpBrut ? JSON.parse(corpBrut) : null;
        scrieri.push({ tabel, metoda: req.method, corp, url: url.search });
        if (req.method === "PATCH") for (const r of filtreaza(randuri, url)) Object.assign(r, corp as Rand);
        if (req.method === "POST") randuri.push(...(Array.isArray(corp) ? corp : [corp]));
        res.writeHead(req.method === "POST" ? 201 : 204);
        return res.end();
      }
      const gasite = filtreaza(randuri, url);
      if (!(req.headers.accept ?? "").includes("vnd.pgrst.object")) return json(200, gasite);
      if (gasite.length > 1) return json(406, { code: "PGRST116", message: "JSON object requested, multiple rows returned" });
      if (gasite.length === 0) {
        /* `.maybeSingle()` primeste 406 cu zero randuri si il intoarce ca `null`; `.single()` il intoarce ca eroare. */
        return json(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: "The result contains 0 rows" });
      }
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
let rutaCron: typeof import("@/app/api/cron/email-marketing/route");
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
  process.env.CRON_SECRET = "secret-cron-de-proba";
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
  rutaCron = await import("@/app/api/cron/email-marketing/route");
  actiuniBrevo = await import("@/lib/actions/brevo.actions");
  NextRequestCls = (await import("next/server")).NextRequest;
});

after(async () => {
  globalThis.fetch = fetchAdevarat;
  await new Promise<void>((r) => baza.close(() => r()));
});

const MAGAZIN = { slug: "magazin", custom_domain: "magazin.ro", store_name: "Magazinul Meu", business_name: "SRL", email: "shop@magazin.ro" };
const LINII = [
  { product_id: "p1", name: "Tricou (M)", price: 35, quantity: 2, slug: "tricou" },
  { product_id: "p2", name: "Sapca", price: 20, quantity: 1 },
];
const comanda = (id: string, extra: Rand = {}): Rand => ({
  id, business_id: BIZ, customer_email: "om@x.ro", customer_name: "Ion Pop", customer_phone: "0722123456",
  total: 90, items: LINII, created_at: "2026-09-18T08:00:00Z", order_source: null,
  status: "pending", payment_method: "ramburs", payment_status: "unpaid",
  discount_code: "TOAMNA10", discount_amount: 10, shipping_cost: 15,
  shipping_address: { address: "Str. Lunga 1", city: "Brasov", county: "Brasov", postcode: "500001", country: "RO" },
  businesses: MAGAZIN, ...extra,
});

beforeEach(() => {
  apeluri = [];
  scrieri = [];
  REVENDICATE = [];
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
      comanda("c-din-campanie", { order_source: { mc_cid: "a1b2c3d4e5", mc_tc: "prec", landing: "/produse/tricou" } }),
    ],
    products: [
      { id: "p1", business_id: BIZ, name: "Tricou", price: 30, images: ["https://img/1.jpg"], slug: "tricou", description: null, is_active: true },
      { id: "p2", business_id: BIZ, name: "Sapca", price: 20, images: [], slug: null, description: null, is_active: true },
      { id: "p3", business_id: BIZ, name: "Geanta", price: 99, images: [], slug: "geanta", description: "Din piele", is_active: false },
    ],
    brevo_suppressions: [],
    mailchimp_suppressions: [],
    error_logs: [],
    email_marketing_coada: [],
  };
});

const numeMetrica = (a: Apel) => (a.corp as { data?: { attributes?: { metric?: { data?: { attributes?: { name?: string } } } } } })?.data?.attributes?.metric?.data?.attributes?.name;
const cale = (a: Apel) => new URL(a.url).pathname;

/* ══════════════════════════════════════════════════════════════════════════ */
describe("Klaviyo: evenimentele din coada", () => {
  test("⚠ comanda cu cardul NEPLATITA: nimic la creare", async () => {
    const v = await K.evenimentKlaviyo("c-card-neplatit", "creata");
    assert.equal(v.fel, "sarit");
    assert.equal(apeluri.length, 0);
  });

  test("ramburs la creare: „Placed Order” si cate un „Ordered Product” pe linie, cu linkuri pe domeniul propriu", async () => {
    const v = await K.evenimentKlaviyo("c-ramburs", "creata");
    assert.deepEqual(v, { fel: "trimis" });
    assert.deepEqual(apeluri.map(numeMetrica), ["Placed Order", "Ordered Product", "Ordered Product"]);
    const items = (apeluri[0].corp as { data: { attributes: { properties: { Items: Array<{ ProductURL?: string }> } } } }).data.attributes.properties.Items;
    assert.equal(items[0].ProductURL, "https://magazin.ro/product/tricou");
    assert.equal(items[1].ProductURL, "https://magazin.ro/product/p2");
  });

  test("plata incasata: „Placed Order”", async () => {
    assert.deepEqual(await K.evenimentKlaviyo("c-card-platit", "platita"), { fel: "trimis" });
    assert.equal(numeMetrica(apeluri[0]), "Placed Order");
  });

  test("expediata, livrata, anulata, rambursata: metricile lor", async () => {
    for (const fel of ["expediata", "livrata", "anulata", "rambursata"] as const) await K.evenimentKlaviyo("c-ramburs", fel);
    assert.deepEqual(apeluri.map(numeMetrica), ["Fulfilled Order", "Delivered Order", "Cancelled Order", "Refunded Order"]);
  });

  test("⚠ anularea unui card NEPLATIT nu pleaca (n-a fost niciodata vanzare)", async () => {
    const v = await K.evenimentKlaviyo("c-card-neplatit", "anulata");
    assert.equal(v.fel, "sarit");
    assert.equal(apeluri.length, 0);
  });

  test("verdictul furnizorului: 5xx se reia, 4xx e refuz", async () => {
    raspunde = () => ({ status: 503, corp: { errors: [{ detail: "down" }] } });
    assert.equal((await K.evenimentKlaviyo("c-ramburs", "creata")).fel, "esuat");
    raspunde = () => ({ status: 400, corp: { errors: [{ detail: "bad" }] } });
    assert.equal((await K.evenimentKlaviyo("c-ramburs", "creata")).fel, "refuzat");
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe("Brevo: comanda intreaga, cu statusul de ACUM", () => {
  test("statusul din rand, nu din eveniment (la ramburs „platita” vine dupa livrare)", async () => {
    raspunde = (a) => (cale(a) === "/v3/products" ? { status: 400, corp: { message: "exists" } } : { status: 204 });
    (TABELE.orders[0] as Rand).status = "delivered";
    (TABELE.orders[0] as Rand).payment_status = "paid";
    assert.deepEqual(await B.evenimentBrevo("c-ramburs", "platita"), { fel: "trimis" });
    const cmd = apeluri.find((a) => cale(a) === "/v3/orders/status");
    const corp = cmd?.corp as { status: string; coupons?: string[]; billing?: Record<string, string> };
    assert.equal(corp.status, "completed");
    assert.deepEqual(corp.coupons, ["TOAMNA10"]);
    assert.equal(corp.billing?.city, "Brasov");
    assert.equal(corp.billing?.countryCode, "RO");
    assert.equal(corp.billing?.paymentMethod, "ramburs");
  });

  test("statusurile, in vocabularul lor", () => {
    assert.equal(B.statusBrevo("pending", "unpaid", "stripe"), "pending");
    assert.equal(B.statusBrevo("pending", "unpaid", "ramburs"), "processing");
    assert.equal(B.statusBrevo("confirmed", "paid", "stripe"), "processing");
    assert.equal(B.statusBrevo("shipped", "unpaid", "ramburs"), "completed");
    assert.equal(B.statusBrevo("cancelled", "paid", "stripe"), "cancelled");
    assert.equal(B.statusBrevo("shipped", "refunded", "stripe"), "refunded");
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe("Mailchimp: comanda prin PUT, apoi schimbari punctuale", () => {
  test("⚠ comanda venita dintr-o campanie poarta campania, codul de urmarire si pagina de aterizare", async () => {
    raspunde = (a) => (a.metoda === "GET" ? { status: 200, corp: { id: "exista" } } : { status: 200, corp: {} });
    assert.deepEqual(await M.evenimentMailchimp("c-din-campanie", "creata"), { fel: "trimis" });
    const put = apeluri.find((a) => a.metoda === "PUT");
    assert.match(put?.url ?? "", /\/ecommerce\/stores\/edinio_b_AUD\/orders\/c-din-campanie$/);
    const c = put?.corp as Record<string, unknown>;
    assert.equal(c.campaign_id, "a1b2c3d4e5");
    assert.equal(c.tracking_code, "prec");
    assert.equal(c.landing_site, "https://magazin.ro/produse/tricou");
    assert.equal(c.financial_status, "pending");
    assert.equal(c.shipping_total, 15);
    assert.deepEqual(c.promos, [{ code: "TOAMNA10", amount_discounted: 10, type: "fixed" }]);
    assert.equal((c.shipping_address as Record<string, string>).city, "Brasov");
  });

  test("platita, expediata, anulata, rambursata: PATCH-ul lor; livrata: nimic", async () => {
    raspunde = () => ({ status: 200, corp: {} });
    await M.evenimentMailchimp("c-ramburs", "platita");
    await M.evenimentMailchimp("c-ramburs", "expediata");
    await M.evenimentMailchimp("c-ramburs", "anulata");
    await M.evenimentMailchimp("c-ramburs", "rambursata");
    assert.equal((await M.evenimentMailchimp("c-ramburs", "livrata")).fel, "sarit");
    assert.deepEqual(apeluri.map((a) => a.corp), [
      { financial_status: "paid" },
      { fulfillment_status: "shipped" },
      { financial_status: "cancelled", cancelled_at_foreign: (apeluri[2].corp as Rand).cancelled_at_foreign },
      { financial_status: "refunded" },
    ]);
    assert.ok((apeluri[2].corp as Rand).cancelled_at_foreign);
  });

  test("o comanda pe care Mailchimp n-o are (404): sarita, nu reincercata la nesfarsit", async () => {
    raspunde = () => ({ status: 404, corp: { detail: "not found" } });
    assert.equal((await M.evenimentMailchimp("c-ramburs", "platita")).fel, "sarit");
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe("⚠⚠ poarta de marketplace si integrarea oprita", () => {
  test("cumparatorul de marketplace nu ajunge la NICIUNUL, la niciun eveniment", async () => {
    for (const fel of ["creata", "platita", "expediata", "anulata"] as const) {
      assert.equal((await K.evenimentKlaviyo("c-marketplace", fel)).fel, "sarit");
      assert.equal((await B.evenimentBrevo("c-marketplace", fel)).fel, "sarit");
      assert.equal((await M.evenimentMailchimp("c-marketplace", fel)).fel, "sarit");
    }
    assert.equal(apeluri.length, 0);
  });

  test("integrarea oprita intre timp: sarit, fara nicio cerere", async () => {
    (TABELE.store_settings[0].klaviyo_config as Rand).ecommerce_sync = false;
    (TABELE.store_settings[0].brevo_config as Rand).enabled = false;
    (TABELE.store_settings[0].mailchimp_config as Rand).ecommerce_sync = false;
    assert.equal((await K.evenimentKlaviyo("c-ramburs", "creata")).fel, "sarit");
    assert.equal((await B.evenimentBrevo("c-ramburs", "creata")).fel, "sarit");
    assert.equal((await M.evenimentMailchimp("c-ramburs", "creata")).fel, "sarit");
    assert.equal(apeluri.length, 0);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe("cronul, rulat el", () => {
  const cere = (secret = "secret-cron-de-proba") => rutaCron.GET(new NextRequestCls("https://www.edinio.com/api/cron/email-marketing", { headers: { authorization: `Bearer ${secret}` } }));
  const marcaj = (id: number) => scrieri.filter((s) => s.tabel === "email_marketing_coada" && s.url.includes(`id=eq.${id}`)).map((s) => s.corp as Rand);

  test("fara secret: 401, nu se revendica nimic", async () => {
    const r = await cere("gresit");
    assert.equal(r.status, 401);
  });

  test("fiecare verdict se insemneaza cum trebuie", async () => {
    REVENDICATE = [
      { id: 1, business_id: BIZ, order_id: "c-ramburs", furnizor: "klaviyo", fel: "creata", incercari: 0 },
      { id: 2, business_id: BIZ, order_id: "c-card-neplatit", furnizor: "klaviyo", fel: "creata", incercari: 0 },
      { id: 3, business_id: BIZ, order_id: "c-ramburs", furnizor: "brevo", fel: "platita", incercari: 2 },
      { id: 4, business_id: BIZ, order_id: "c-ramburs", furnizor: "mailchimp", fel: "platita", incercari: 0 },
    ];
    raspunde = (a) => {
      const h = new URL(a.url).host;
      if (h === "a.klaviyo.com") return { status: 202 };
      if (h === "api.brevo.com") return { status: 503, corp: { message: "down" } };
      return { status: 400, corp: { detail: "invalid" } };
    };
    const r = await cere();
    const corp = await r.json() as Rand;
    assert.deepEqual({ trimise: corp.trimise, sarite: corp.sarite, esecuri: corp.esecuri, refuzate: corp.refuzate },
      { trimise: 1, sarite: 1, esecuri: 1, refuzate: 1 });

    assert.equal(marcaj(1)[0].rezultat, "trimis");
    assert.ok(marcaj(1)[0].trimis_la);
    assert.match(String(marcaj(2)[0].rezultat), /^sarit: plata online/);
    assert.equal(marcaj(3)[0].incercari, 3, "esecul n-a crescut numarul de incercari");
    assert.ok(marcaj(3)[0].next_retry_at, "esecul nu s-a reprogramat");
    assert.equal(marcaj(3)[0].abandonat_la, undefined);
    assert.ok(marcaj(4)[0].abandonat_la, "refuzul nu s-a abandonat pe loc");
    assert.equal(scrieri.filter((s) => s.tabel === "error_logs").length, 1, "refuzul nu s-a scris in jurnal");
  });

  test("coada goala: nicio cerere catre furnizori", async () => {
    const r = await cere();
    assert.deepEqual(await r.json(), { ok: true, luate: 0 });
    assert.equal(apeluri.length, 0);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe("catalogul, dupa starea din baza", () => {
  test("Klaviyo, tot catalogul: joburi de creare si actualizare; cel stins, nepublicat", async () => {
    const r = await K.sincronizeazaProduseleKlaviyo(BIZ);
    assert.ok("ok" in r);
    const creare = apeluri.filter((a) => cale(a) === "/api/catalog-item-bulk-create-jobs");
    const actualizare = apeluri.filter((a) => cale(a) === "/api/catalog-item-bulk-update-jobs");
    assert.equal(creare.length, 1);
    assert.equal(actualizare.length, 2);
    const creat = (creare[0].corp as { data: { attributes: { items: { data: Array<{ attributes: { external_id: string; url: string } }> } } } }).data.attributes.items.data;
    assert.deepEqual(creat.map((i) => i.attributes.external_id), ["p1", "p2"]);
    assert.equal(creat[1].attributes.url, "https://magazin.ro/product/p2");
    const stins = (actualizare[1].corp as { data: { attributes: { items: { data: Array<{ id: string; attributes: { published: boolean } }> } } } }).data.attributes.items.data;
    assert.deepEqual(stins.map((i) => [i.id, i.attributes.published]), [["$custom:::$default:::p3", false]]);
  });

  test("Klaviyo, un produs sters din baza: sters si din catalog", async () => {
    raspunde = () => ({ status: 204 });
    await K.sincronizeazaProduseleKlaviyo(BIZ, ["p-disparut"]);
    assert.deepEqual(apeluri.map((a) => [a.metoda, cale(a)]), [["DELETE", "/api/catalog-items/%24custom%3A%3A%3A%24default%3A%3A%3Ap-disparut"]]);
  });

  test("Brevo, tot catalogul: un lot activ si unul cu `isDeleted`", async () => {
    raspunde = () => ({ status: 201, corp: {} });
    await B.sincronizeazaProduseleBrevo(BIZ);
    const loturi = apeluri.filter((a) => cale(a) === "/v3/products/batch").map((a) => a.corp as { products: Array<{ id: string; isDeleted?: boolean; url?: string }>; updateEnabled: boolean });
    assert.equal(loturi.length, 2);
    assert.deepEqual(loturi[0].products.map((p) => p.id), ["p1", "p2"]);
    assert.equal(loturi[0].products[0].url, "https://magazin.ro/product/tricou");
    assert.deepEqual(loturi[1].products.map((p) => [p.id, p.isDeleted]), [["p3", true]]);
    for (const l of loturi) assert.equal(l.updateEnabled, true);
  });

  test("Mailchimp, tot catalogul: lot cu PUT pe cele active si DELETE pe cel stins", async () => {
    raspunde = () => ({ status: 200, corp: { id: "lot-1" } });
    const r = await M.sincronizeazaProduseleMailchimp(BIZ);
    assert.ok("ok" in r && r.loturi.length === 1);
    const ops = (apeluri.find((a) => cale(a) === "/3.0/batches")?.corp as { operations: Array<{ method: string; path: string; body?: string }> }).operations;
    assert.deepEqual(ops.map((o) => [o.method, o.path]), [
      ["PUT", "/ecommerce/stores/edinio_b_AUD/products/p1"],
      ["PUT", "/ecommerce/stores/edinio_b_AUD/products/p2"],
      ["DELETE", "/ecommerce/stores/edinio_b_AUD/products/p3"],
    ]);
    assert.equal(JSON.parse(ops[0].body as string).url, "https://magazin.ro/product/tricou");
  });

  test("Mailchimp, un produs editat: un singur PUT, imediat", async () => {
    raspunde = () => ({ status: 200, corp: {} });
    await M.maybeSyncMailchimpProduct({ businessId: BIZ, action: "upsert", product: { id: "p1", name: "Tricou", price: 30 } });
    assert.deepEqual(apeluri.map((a) => [a.metoda, cale(a)]), [["PUT", "/3.0/ecommerce/stores/edinio_b_AUD/products/p1"]]);
  });

  test("⚠ „actualizeaza” pe un produs STINS nu-l republica (hotaraste baza, nu apelantul)", async () => {
    raspunde = () => ({ status: 204 });
    await M.maybeSyncMailchimpProduct({ businessId: BIZ, action: "upsert", product: { id: "p3", name: "Geanta", price: 99 } });
    assert.deepEqual(apeluri.map((a) => a.metoda), ["DELETE"]);
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
    assert.equal(cale(apeluri[0]), "/v3/contacts/doubleOptinConfirmation");
    assert.equal((apeluri[0].corp as { redirectionUrl: string }).redirectionUrl, "https://magazin.ro");
  });

  test("fara ea, contactul se adauga direct", async () => {
    raspunde = () => ({ status: 201, corp: { id: 1 } });
    await B.maybeSyncBrevoSubscriber({ businessId: BIZ, source: "checkout", email: "om@x.ro" });
    assert.equal(cale(apeluri[0]), "/v3/contacts");
  });

  test("cine e in suprimari (dezabonat, respins, spam) nu mai pleaca deloc", async () => {
    TABELE.brevo_suppressions.push({ id: 1, business_id: BIZ, email: "om@x.ro", reason: "spam" });
    await B.maybeSyncBrevoSubscriber({ businessId: BIZ, source: "checkout", email: "Om@X.ro" });
    assert.equal(apeluri.length, 0);
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
describe("`saveBrevoSettings`, rulat el", () => {
  const furnizor = (doiTemplate: boolean, activare = 200, moneda = "EUR") => (a: Apel) => {
    const p = cale(a);
    if (p.startsWith("/v3/smtp/templates/")) return { status: 200, corp: { id: 12, name: "Confirmare", doiTemplate, isActive: true } };
    if (p === "/v3/contacts/attributes") return { status: 200, corp: { attributes: [{ name: "SOURCE" }, { name: "COUNTY" }, { name: "ORDER_VALUE" }, { name: "PHONE" }] } };
    if (p === "/v3/webhooks" && a.metoda === "GET") return { status: 200, corp: { webhooks: [] } };
    if (p === "/v3/ecommerce/activate") return { status: activare, corp: {} };
    if (p === "/v3/ecommerce/config/displayCurrency" && a.metoda === "GET") return { status: 200, corp: { code: moneda } };
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

  test("cu un sablon adevarat, se salveaza cu numele lui; webhookul pe gazda canonica", async () => {
    raspunde = furnizor(true);
    const r = await actiuniBrevo.saveBrevoSettings(BIZ, { double_optin: true, doi_template_id: 12 });
    assert.ok("config" in r, JSON.stringify(r));
    assert.equal(r.config.double_optin, true);
    assert.equal(r.config.doi_template_name, "Confirmare");
    const hook = apeluri.find((a) => cale(a) === "/v3/webhooks" && a.metoda === "POST");
    assert.equal((hook?.corp as { url: string }).url, "https://www.edinio.com/api/brevo/webhook?secret=secret-brevo");
  });

  test("⚠⚠ cu e-commerce pornit: comertul se activeaza si moneda devine RON", async () => {
    raspunde = furnizor(true, 200, "EUR");
    const r = await actiuniBrevo.saveBrevoSettings(BIZ, { ecommerce_sync: true });
    assert.ok("config" in r);
    assert.ok(apeluri.some((a) => cale(a) === "/v3/ecommerce/activate" && a.metoda === "POST"), "comertul nu s-a activat");
    const moneda = apeluri.find((a) => cale(a) === "/v3/ecommerce/config/displayCurrency" && a.metoda === "POST");
    assert.deepEqual(moneda?.corp, { code: "RON" });
  });

  test("moneda deja RON nu se rescrie", async () => {
    raspunde = furnizor(true, 200, "RON");
    await actiuniBrevo.saveBrevoSettings(BIZ, { ecommerce_sync: true });
    assert.equal(apeluri.filter((a) => cale(a) === "/v3/ecommerce/config/displayCurrency" && a.metoda === "POST").length, 0);
  });

  test("⚠ importul clientilor existenti e refuzat cat timp confirmarea dubla e pornita (ar ocoli-o)", async () => {
    (TABELE.store_settings[0].brevo_config as Rand).double_optin = true;
    (TABELE.store_settings[0].brevo_config as Rand).doi_template_id = 12;
    const r = await actiuniBrevo.syncExistingCustomers(BIZ);
    assert.ok("error" in r && /confirmarea dubla/.test(r.error));
    assert.equal(apeluri.length, 0);
  });
});
