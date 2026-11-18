import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { register } from "node:module";
import { createHash } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { XMLParser, XMLValidator } from "fast-xml-parser";

/**
 * ═══ THEMARKETER, RULAT CHIAR EL (18.11.2026) ═══
 *
 * Baza e un PostgREST de proba (server HTTP local), theMarketer e un `fetch` de proba care inregistreaza
 * fiecare cerere. Se ruleaza RUTELE adevarate (feedurile, generatorul de coduri, webhookurile, cronul) si
 * functiile din `sync.ts` (coada de comenzi, abonarea).
 *
 * ⚠ CE APARA:
 *   - o cheie gresita, revocata sau fara forma da 404, iar una fara forma nici nu atinge baza;
 *   - feedul de produse e XML valid, fara produsele stinse sau demo;
 *   - feedul de comenzi e oprit pana il porneste omul, are 50 pe pagina, fara marketplace si fara
 *     plati online neincasate;
 *   - generatorul de coduri cere cheia REST in `key`, scrie un cod de o singura folosire, marcat;
 *   - webhookul de dezabonare scrie in `recovery_optout`, respingerea temporara nu;
 *   - comanda cu ramburs pleaca la creare (`save_order`, cu cheile in CORP), cea cu cardul neplatita nu;
 *   - cumparatorul de marketplace nu pleaca;
 *   - abonarea pleaca numai pe canalul email.
 */

type Rand = Record<string, unknown>;
const BIZ = "b9000000-0000-4000-8000-0000000000aa";
const CHEIE = "Kx8vQ2mN5pR7tW9yB3cE6fH1jL4nP0sU2wZ5aD8gJ1k";
const AMPRENTA = createHash("sha256").update(CHEIE, "utf8").digest("hex");
const REST = "rest-key-de-proba-123456";

let TABELE: Record<string, Rand[]> = {};
let scrieri: Array<{ tabel: string; metoda: string; corp: unknown }> = [];
let rpc: Array<{ nume: string; corp: Rand }> = [];
let cereriBaza = 0;

function valoare(r: Rand, cheie: string): unknown {
  if (cheie.includes("->>")) {
    const [col, camp] = cheie.split("->>");
    const obj = r[col] as Rand | null | undefined;
    const v = obj ? obj[camp] : undefined;
    return v === undefined || v === null ? v : String(v);
  }
  return r[cheie];
}

/** Desparte `a.eq.1,b.in.(x,y)` pe virgulele din afara parantezelor. */
function bucati(s: string): string[] {
  const iesire: string[] = [];
  let adancime = 0, curent = "";
  for (const ch of s) {
    if (ch === "(") adancime++;
    if (ch === ")") adancime--;
    if (ch === "," && adancime === 0) { iesire.push(curent); curent = ""; continue; }
    curent += ch;
  }
  if (curent) iesire.push(curent);
  return iesire;
}

function lista(v: string): string[] {
  return v.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, ""));
}

function potriveste(r: Rand, cheie: string, expr: string): boolean {
  const val = valoare(r, cheie);
  const s = val === undefined || val === null ? null : String(val);
  if (expr === "is.null") return s === null;
  if (expr === "not.is.null") return s !== null;
  if (expr.startsWith("eq.")) return s === expr.slice(3);
  if (expr.startsWith("neq.")) return s !== expr.slice(4);
  if (expr.startsWith("gte.")) return s !== null && s >= expr.slice(4);
  if (expr.startsWith("lte.")) return s !== null && s <= expr.slice(4);
  if (expr.startsWith("gt.")) return s !== null && Number(s) > Number(expr.slice(3));
  if (expr.startsWith("in.")) return s !== null && lista(expr.slice(3)).includes(s);
  if (expr.startsWith("not.in.")) return s === null || !lista(expr.slice(7)).includes(s);
  throw new Error(`operator neasteptat: ${cheie}=${expr}`);
}

function conditieOr(r: Rand, c: string): boolean {
  /* `cheie.operator.valoare`; cheia poate avea `->>`, dar nu puncte. */
  const i = c.indexOf(".");
  return potriveste(r, c.slice(0, i), c.slice(i + 1));
}

function filtreaza(randuri: Rand[], url: URL): Rand[] {
  return randuri.filter((r) => {
    for (const [k, v] of url.searchParams) {
      if (["select", "limit", "order", "offset", "on_conflict", "columns"].includes(k)) continue;
      if (k === "or") {
        if (!bucati(v.replace(/^\(|\)$/g, "")).some((c) => conditieOr(r, c))) return false;
        continue;
      }
      if (!potriveste(r, k, v)) return false;
    }
    return true;
  });
}

function aseaza(randuri: Rand[], url: URL): Rand[] {
  const o = url.searchParams.get("order");
  let lista_ = [...randuri];
  if (o) {
    const chei = o.split(",").map((x) => x.split("."));
    lista_.sort((a, b) => {
      for (const [k, dir] of chei) {
        const x = String(a[k] ?? ""), y = String(b[k] ?? "");
        if (x !== y) return (x < y ? -1 : 1) * (dir === "desc" ? -1 : 1);
      }
      return 0;
    });
  }
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const limit = url.searchParams.get("limit");
  lista_ = lista_.slice(offset, limit ? offset + Number(limit) : undefined);
  return lista_;
}

const baza = http.createServer((req, res) => {
  cereriBaza++;
  const url = new URL(req.url ?? "/", "http://baza");
  const tabel = url.pathname.replace("/rest/v1/", "");
  let corpBrut = "";
  req.on("data", (b) => (corpBrut += b));
  req.on("end", () => {
    const json = (cod: number, corp: unknown) => { res.writeHead(cod, { "content-type": "application/json" }); res.end(JSON.stringify(corp)); };
    try {
      if (tabel.startsWith("rpc/")) {
        const nume = tabel.slice(4);
        const corp = corpBrut ? JSON.parse(corpBrut) as Rand : {};
        rpc.push({ nume, corp });
        if (nume === "themarketer_dezaboneaza") {
          const existente = new Set((TABELE.recovery_optout ?? []).map((r) => String(r.email)));
          let noi = 0;
          for (const e of corp.p_emailuri as string[]) {
            if (!existente.has(e)) { TABELE.recovery_optout.push({ business_id: corp.p_business, email: e, motiv: corp.p_motiv }); existente.add(e); noi++; }
          }
          return json(200, noi);
        }
        if (nume === "catalog_branduri") return json(200, [{ brand: "Nike", produse: 2, logo_url: null, descriere: null }]);
        return json(404, { message: `rpc de proba necunoscut: ${nume}` });
      }
      const randuri = TABELE[tabel];
      if (!randuri) return json(404, { message: `tabel de proba necunoscut: ${tabel}` });
      if (req.method === "POST" || req.method === "PATCH" || req.method === "DELETE") {
        const corp = corpBrut ? JSON.parse(corpBrut) : null;
        scrieri.push({ tabel, metoda: req.method, corp });
        if (req.method === "PATCH") for (const r of filtreaza(randuri, url)) Object.assign(r, corp as Rand);
        if (req.method === "POST") {
          const conflict = url.searchParams.get("on_conflict");
          for (const nou of (Array.isArray(corp) ? corp : [corp]) as Rand[]) {
            const chei = conflict ? conflict.split(",") : null;
            const existent = chei ? randuri.find((r) => chei.every((k) => r[k] === nou[k])) : undefined;
            if (existent) Object.assign(existent, nou);
            else randuri.push({ ...nou });
          }
        }
        res.writeHead(req.method === "POST" ? 201 : 204);
        return res.end();
      }
      let gasite = aseaza(filtreaza(randuri, url), url);
      const sel = url.searchParams.get("select") ?? "";
      if (tabel === "businesses" && sel.includes("store_settings(")) {
        gasite = gasite.map((b) => ({ ...b, store_settings: TABELE.store_settings.filter((s) => s.business_id === b.id) }));
      }
      if (!(req.headers.accept ?? "").includes("vnd.pgrst.object")) return json(200, gasite);
      if (gasite.length > 1) return json(406, { code: "PGRST116", message: "multiple rows" });
      if (gasite.length === 0) return json(406, { code: "PGRST116", message: "no rows", details: "The result contains 0 rows" });
      return json(200, gasite[0]);
    } catch (e) {
      return json(400, { message: (e as Error).message });
    }
  });
});

/* ── theMarketer ───────────────────────────────────────────────────────── */
type Apel = { metoda: string; url: URL; corp: URLSearchParams | null };
let apeluri: Apel[] = [];
let raspunde: (a: Apel) => { status: number; corp?: string } = () => ({ status: 200, corp: '{"result":true}' });
const fetchAdevarat = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith("http://127.0.0.1")) return fetchAdevarat(input, init);
  const a: Apel = { metoda: init?.method ?? "GET", url: new URL(url), corp: init?.body ? new URLSearchParams(String(init.body)) : null };
  apeluri.push(a);
  const r = raspunde(a);
  return new Response(r.corp ?? "", { status: r.status, headers: { "content-type": "application/json" } });
}) as typeof fetch;

const HOOK = `data:text/javascript,${encodeURIComponent(
  `export async function resolve(specifier, context, next) {
     if (specifier === "next/cache") {
       return { url: "data:text/javascript," + encodeURIComponent("export const revalidatePath = () => {}; export const revalidateTag = () => {};"), shortCircuit: true, format: "module" };
     }
     return next(specifier, context);
   }`,
)}`;

let S: typeof import("./sync");
let rutaProduse: typeof import("@/app/api/themarketer/[cheie]/produse.xml/route");
let rutaComenzi: typeof import("@/app/api/themarketer/[cheie]/comenzi.json/route");
let rutaCategorii: typeof import("@/app/api/themarketer/[cheie]/categorii.xml/route");
let rutaBranduri: typeof import("@/app/api/themarketer/[cheie]/branduri.xml/route");
let rutaCod: typeof import("@/app/api/themarketer/[cheie]/cod-reducere/route");
let rutaWebhook: typeof import("@/app/api/themarketer/[cheie]/webhook/[fel]/route");
let rutaCron: typeof import("@/app/api/cron/themarketer/route");
let NextRequestCls: typeof import("next/server").NextRequest;

before(async () => {
  await new Promise<void>((r) => baza.listen(0, "127.0.0.1", () => r()));
  const { port } = baza.address() as AddressInfo;
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "cheie-anonima-de-proba";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "cheie-de-serviciu-de-proba";
  process.env.NEXT_PUBLIC_SITE_URL = "https://edinio.com";
  process.env.CRON_SECRET = "secret-cron-de-proba";
  register(HOOK);
  S = await import("./sync");
  rutaProduse = await import("@/app/api/themarketer/[cheie]/produse.xml/route");
  rutaComenzi = await import("@/app/api/themarketer/[cheie]/comenzi.json/route");
  rutaCategorii = await import("@/app/api/themarketer/[cheie]/categorii.xml/route");
  rutaBranduri = await import("@/app/api/themarketer/[cheie]/branduri.xml/route");
  rutaCod = await import("@/app/api/themarketer/[cheie]/cod-reducere/route");
  rutaWebhook = await import("@/app/api/themarketer/[cheie]/webhook/[fel]/route");
  rutaCron = await import("@/app/api/cron/themarketer/route");
  NextRequestCls = (await import("next/server")).NextRequest;
});

after(async () => {
  globalThis.fetch = fetchAdevarat;
  await new Promise<void>((r) => baza.close(() => r()));
});

const CONFIG = (extra: Rand = {}): Rand => ({
  enabled: true, tracking_key: "TRK12345", customer_id: "CUST-1", rest_key: REST, cheie_feed: CHEIE, ...extra,
});

const comanda = (id: string, extra: Rand = {}): Rand => ({
  id, business_id: BIZ, order_number: id.toUpperCase(), customer_email: "om@x.ro", customer_name: "Ion Pop", customer_phone: "0722123456",
  total: 105, items: [{ product_id: "p1", name: "Tricou (M)", price: 45, quantity: 2 }, { product_id: "extra_1", name: "Ambalaj", price: 5, quantity: 1 }],
  shipping_cost: 15, discount_code: null, discount_amount: 0, card_discount_amount: 0, offer_discount_amount: 0,
  cod_discount_amount: 0, cod_fee_amount: 0, vat_amount: 16.76, status: "pending", payment_method: "cod", payment_status: "unpaid",
  created_at: "2026-11-01T10:00:00Z", order_source: null,
  shipping_address: { address: "Str. Lunga 1", city: "Brasov", county: "Brasov", country: "RO" },
  ...extra,
});

beforeEach(() => {
  apeluri = [];
  scrieri = [];
  rpc = [];
  raspunde = () => ({ status: 200, corp: '{"result":true}' });
  TABELE = {
    businesses: [{ id: BIZ, slug: "magazin", custom_domain: "magazin.ro", is_published: true }],
    store_settings: [{ business_id: BIZ, themarketer_config: CONFIG(), page_content: {}, storefront_design: null }],
    themarketer_chei: [{ amprenta: AMPRENTA, business_id: BIZ, revocat_la: null }],
    themarketer_stare: [],
    categories: [{ id: "c1", business_id: BIZ, name: "Haine", parent_id: null, image_url: null, is_active: true, sort_order: 0 }],
    products: [
      { id: "p1", business_id: BIZ, name: "Tricou", slug: "tricou", description: "Bumbac", price: 45, compare_at_price: null, sku: "T-1",
        images: ["https://cdn.example.com/t.jpg"], category: "Haine", is_bundle: false, track_inventory: true, stock_quantity: 4,
        page_sections: { variants: { enabled: true, options: [{ id: "o", name: "Marime", values: ["M"] }],
          combinations: [{ id: "m", title: "M", price: "", compare_at_price: "", sku: "T-1-M", stock_quantity: "4", image: "", enabled: true }] } },
        created_at: "2026-01-01T10:00:00Z", is_active: true, source: null },
      { id: "p2", business_id: BIZ, name: "Stins", slug: "stins", description: null, price: 10, compare_at_price: null, sku: null,
        images: ["https://cdn.example.com/s.jpg"], category: null, is_bundle: false, track_inventory: false, stock_quantity: null,
        page_sections: {}, created_at: "2026-01-01T10:00:00Z", is_active: false, source: null },
      { id: "p3", business_id: BIZ, name: "Demo", slug: "demo", description: null, price: 10, compare_at_price: null, sku: null,
        images: ["https://cdn.example.com/d.jpg"], category: null, is_bundle: false, track_inventory: false, stock_quantity: null,
        page_sections: {}, created_at: "2026-01-01T10:00:00Z", is_active: true, source: "tema-demo" },
    ],
    orders: [
      comanda("c-ramburs"),
      comanda("c-card-neplatit", { payment_method: "stripe", payment_status: "unpaid" }),
      comanda("c-card-platit", { payment_method: "stripe", payment_status: "paid" }),
      comanda("c-marketplace", { order_source: { marketplace: "emag" } }),
      comanda("c-fara-email", { customer_email: null }),
    ],
    discounts: [],
    recovery_optout: [],
    recenzii_produse: [],
    error_logs: [],
  };
});

const cere = (cale: string) => new Request(`https://www.edinio.com${cale}`);
const ctx = (cheie: string) => ({ params: Promise.resolve({ cheie }) });

/* ═════════════════════════════════════════════════════════════════ */
describe("poarta adreselor", () => {
  test("cheia fara forma: 404 FARA nicio cerere in baza", async () => {
    const inainte = cereriBaza;
    const r = await rutaProduse.GET(cere("/api/themarketer/scurta/produse.xml"), ctx("scurta"));
    assert.equal(r.status, 404);
    assert.equal(cereriBaza, inainte);
  });

  test("cheia necunoscuta si cea revocata: acelasi 404", async () => {
    const alta = "Zx8vQ2mN5pR7tW9yB3cE6fH1jL4nP0sU2wZ5aD8gJ1k";
    assert.equal((await rutaProduse.GET(cere("/x"), ctx(alta))).status, 404);
    TABELE.themarketer_chei[0].revocat_la = "2026-11-18T10:00:00Z";
    assert.equal((await rutaProduse.GET(cere("/x"), ctx(CHEIE))).status, 404);
  });

  test("integrarea oprita: 404, ca o cheie gresita", async () => {
    TABELE.store_settings[0].themarketer_config = CONFIG({ enabled: false });
    assert.equal((await rutaProduse.GET(cere("/x"), ctx(CHEIE))).status, 404);
  });
});

describe("feedurile", () => {
  test("produsele: XML valid, numai cele active si reale, cu varianta in forma cosului", async () => {
    const r = await rutaProduse.GET(cere(`/api/themarketer/${CHEIE}/produse.xml`), ctx(CHEIE));
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type") ?? "", /application\/xml/);
    assert.match(r.headers.get("cache-control") ?? "", /no-store/);
    const xml = await r.text();
    assert.equal(XMLValidator.validate(xml), true);
    const doc = new XMLParser().parse(xml);
    const p = doc.products.product;
    assert.equal(p.id, "p1", "fara cel stins si fara cel demo");
    assert.equal(p.url, "https://magazin.ro/product/tricou");
    assert.equal(p.variations.variation.sku, "T-1-M");
    /* Citirea se insemneaza, ca panoul sa poata spune „citit de theMarketer”. */
    assert.ok(TABELE.themarketer_stare.some((s) => s.business_id === BIZ && s.citit_produse_la));
  });

  test("magazinul nepublicat nu-si da catalogul (linkurile din emailuri n-ar merge)", async () => {
    TABELE.businesses[0].is_published = false;
    assert.equal((await rutaProduse.GET(cere("/x"), ctx(CHEIE))).status, 404);
  });

  test("HEAD nu construieste feedul", async () => {
    const r = await rutaProduse.HEAD(new Request("https://www.edinio.com/x", { method: "HEAD" }), ctx(CHEIE));
    assert.equal(r.status, 200);
    assert.equal(r.body, null);
  });

  test("categoriile si brandurile: XML valid", async () => {
    const c = await (await rutaCategorii.GET(cere("/x"), ctx(CHEIE))).text();
    assert.equal(XMLValidator.validate(c), true);
    assert.match(c, /<hierarchy>Haine<\/hierarchy>/);
    const b = await (await rutaBranduri.GET(cere("/x"), ctx(CHEIE))).text();
    assert.equal(XMLValidator.validate(b), true);
    assert.match(b, /<name>Nike<\/name>/);
  });

  test("⚠ comenzile: OPRITE pana le porneste omul (date personale)", async () => {
    assert.equal((await rutaComenzi.GET(cere(`/x?page=1`), ctx(CHEIE))).status, 404);
  });

  test("comenzile: fara marketplace, fara card neplatit, fara comenzi fara email; pagina urmatoare goala", async () => {
    TABELE.store_settings[0].themarketer_config = CONFIG({ export_comenzi: true });
    const r = await rutaComenzi.GET(cere(`/x?page=1&start_date=2026-01-01`), ctx(CHEIE));
    assert.equal(r.status, 200);
    const corp = await r.json() as { orders: { order: Rand[] } };
    const numere = corp.orders.order.map((o) => o.order_no).sort();
    assert.deepEqual(numere, ["C-CARD-PLATIT", "C-RAMBURS"]);
    const linie = (corp.orders.order[0].products as Rand[])[0];
    assert.equal(linie.variation_sku, "T-1-M");
    assert.equal((corp.orders.order[0].products as Rand[]).length, 1, "fara extraoptiuni");
    const r2 = await rutaComenzi.GET(cere(`/x?page=2&start_date=2026-01-01`), ctx(CHEIE));
    assert.deepEqual(await r2.json(), { orders: { order: [] } });
    assert.equal((await rutaComenzi.GET(cere(`/x?page=abc`), ctx(CHEIE))).status, 400);
  });
});

describe("generatorul de coduri", () => {
  const cod = (q: string) => rutaCod.GET(cere(`/api/themarketer/${CHEIE}/cod-reducere?${q}`), ctx(CHEIE));

  test("fara cheia REST in `key` nu se genereaza nimic", async () => {
    assert.equal((await cod("value=10&type=1")).status, 403);
    assert.equal((await cod("key=gresit&value=10&type=1")).status, 403);
    assert.equal(TABELE.discounts.length, 0);
  });

  test("cu cheia: un cod de o singura folosire, marcat, cu expirarea la sfarsitul zilei romanesti", async () => {
    const r = await cod(`key=${encodeURIComponent(REST)}&value=15&type=1&expiration_date=2026-12-31`);
    assert.equal(r.status, 200);
    const { code } = await r.json() as { code: string };
    assert.match(code, /^MKTR-[A-Z0-9]{10}$/);
    const d = TABELE.discounts[0];
    assert.equal(d.code, code);
    assert.equal(d.type, "percent");
    assert.equal(d.value, 15);
    assert.equal(d.max_uses, 1);
    assert.equal(d.generat_de, "themarketer");
    assert.equal(d.expires_at, "2026-12-31T21:59:59.999Z");
  });

  test("parametrii stricati: 400, fara cod", async () => {
    assert.equal((await cod(`key=${REST}&value=150&type=1`)).status, 400);
    assert.equal((await cod(`key=${REST}&value=10&type=9`)).status, 400);
    assert.equal(TABELE.discounts.length, 0);
  });

  test("modulul oprit: 404", async () => {
    TABELE.store_settings[0].themarketer_config = CONFIG({ coduri: false });
    assert.equal((await cod(`key=${REST}&value=10&type=1`)).status, 404);
  });
});

describe("webhookurile", () => {
  const trimite = (fel: string, corp: unknown) => rutaWebhook.POST(
    new Request(`https://www.edinio.com/api/themarketer/${CHEIE}/webhook/${fel}`, { method: "POST", body: JSON.stringify(corp) }),
    { params: Promise.resolve({ cheie: CHEIE, fel }) },
  );

  test("dezabonarea ajunge in lista de „nu trimite”, cu motivul pe care il stie panoul", async () => {
    const r = await trimite("dezabonat", { email: "Om@X.ro", firstname: "Ion" });
    assert.equal(r.status, 200);
    assert.deepEqual(rpc.find((x) => x.nume === "themarketer_dezaboneaza")?.corp, { p_business: BIZ, p_emailuri: ["om@x.ro"], p_motiv: "dezabonare" });
    assert.equal(TABELE.recovery_optout[0].email, "om@x.ro");
  });

  test("respingerea temporara nu opreste nimic; cea definitiva, da", async () => {
    await trimite("respins", { email: "a@b.ro", bounce_type: "bounce_soft" });
    assert.equal(TABELE.recovery_optout.length, 0);
    await trimite("respins", { email: "a@b.ro", bounce_type: "bounce_hard" });
    assert.equal(TABELE.recovery_optout[0].motiv, "email_respins");
  });

  test("felul necunoscut: 404; JSON stricat: 400; modulul oprit: 200 ignorat", async () => {
    assert.equal((await trimite("altceva", { email: "a@b.ro" })).status, 404);
    const stricat = await rutaWebhook.POST(new Request("https://www.edinio.com/x", { method: "POST", body: "{nu" }), { params: Promise.resolve({ cheie: CHEIE, fel: "spam" }) });
    assert.equal(stricat.status, 400);
    TABELE.store_settings[0].themarketer_config = CONFIG({ dezabonari: false });
    const r = await trimite("spam", { email: "a@b.ro" });
    assert.equal(r.status, 200);
    assert.equal(TABELE.recovery_optout.length, 0);
  });
});

describe("comenzile din coada", () => {
  test("ramburs la creare: `save_order` cu cheile in CORP, apoi statusul", async () => {
    const v = await S.evenimentTheMarketer("c-ramburs", "creata");
    assert.deepEqual(v, { fel: "trimis" });
    assert.equal(apeluri[0].metoda, "POST");
    assert.equal(apeluri[0].url.pathname, "/api/v1/save_order");
    assert.equal(apeluri[0].url.search, "", "nimic in adresa");
    const c = apeluri[0].corp!;
    assert.equal(c.get("k"), REST);
    assert.equal(c.get("u"), "CUST-1");
    assert.equal(c.get("number"), "C-RAMBURS");
    assert.equal(c.get("email_address"), "om@x.ro");
    assert.equal(c.get("products[0][variation_sku]"), "T-1-M");
    assert.equal(c.get("products[1][product_id]"), null, "extraoptiunea nu pleaca");
    assert.equal(apeluri[1].metoda, "GET");
    assert.equal(apeluri[1].url.pathname, "/api/v1/update_order_status");
    assert.equal(apeluri[1].url.searchParams.get("order_status"), "Pending");
  });

  test("⚠ cardul neplatit: nimic; platit: la plata", async () => {
    assert.equal((await S.evenimentTheMarketer("c-card-neplatit", "creata")).fel, "sarit");
    assert.equal(apeluri.length, 0);
    assert.equal((await S.evenimentTheMarketer("c-card-platit", "platita")).fel, "trimis");
    assert.equal(apeluri[0].url.pathname, "/api/v1/save_order");
  });

  test("marketplace-ul si comanda fara email nu pleaca", async () => {
    assert.deepEqual(await S.evenimentTheMarketer("c-marketplace", "creata"), { fel: "sarit", motiv: "comanda de marketplace" });
    assert.equal((await S.evenimentTheMarketer("c-fara-email", "creata")).fel, "sarit");
    assert.equal(apeluri.length, 0);
  });

  test("livrarea: numai statusul", async () => {
    assert.equal((await S.evenimentTheMarketer("c-ramburs", "livrata")).fel, "trimis");
    assert.equal(apeluri.length, 1);
    assert.equal(apeluri[0].url.searchParams.get("order_status"), "Delivered");
  });

  test("verdictul: contul negasit e refuz (nu se reia), 5xx se reia", async () => {
    raspunde = () => ({ status: 404, corp: '{"message":"Customer not found."}' });
    assert.equal((await S.evenimentTheMarketer("c-ramburs", "creata")).fel, "refuzat");
    raspunde = () => ({ status: 503, corp: "" });
    assert.equal((await S.evenimentTheMarketer("c-ramburs", "creata")).fel, "esuat");
  });

  test("modulul comenzilor oprit: sarit", async () => {
    TABELE.store_settings[0].themarketer_config = CONFIG({ comenzi: false });
    assert.equal((await S.evenimentTheMarketer("c-ramburs", "creata")).fel, "sarit");
  });
});

describe("abonarea", () => {
  test("numai pe canalul email, cu sursa ca eticheta", async () => {
    await S.maybeSyncTheMarketerSubscriber({ businessId: BIZ, source: "checkout", email: " Om@X.ro ", name: "Ion Pop", phone: "0722123456" });
    assert.equal(apeluri.length, 1);
    const c = apeluri[0].corp!;
    assert.equal(apeluri[0].url.pathname, "/api/v1/add_subscriber");
    assert.equal(c.get("email"), "om@x.ro");
    assert.equal(c.get("channels"), "email");
    assert.equal(c.get("add_tags"), "Edinio,Checkout");
    assert.equal(c.get("phone"), "+40722123456");
  });

  test("sursa oprita: nimic", async () => {
    TABELE.store_settings[0].themarketer_config = CONFIG({ abonati: { checkout: false } });
    await S.maybeSyncTheMarketerSubscriber({ businessId: BIZ, source: "checkout", email: "om@x.ro" });
    assert.equal(apeluri.length, 0);
  });
});

describe("cronul", () => {
  const ruleaza = (secret = "secret-cron-de-proba") => rutaCron.GET(new NextRequestCls("https://www.edinio.com/api/cron/themarketer", { headers: { authorization: `Bearer ${secret}` } }));

  test("fara secret: 401", async () => {
    assert.equal((await ruleaza("gresit")).status, 401);
  });

  test("dezabonatii si recenziile noi ajung in Edinio; recenzia unui produs strain, nu", async () => {
    TABELE.store_settings[0].themarketer_config = CONFIG({ recenzii: true });
    TABELE.products.push({ id: "22222222-2222-4222-8222-222222222222", business_id: BIZ, name: "Geaca", is_active: true });
    raspunde = (a) => {
      if (a.url.pathname === "/api/v1/unsubscribed_emails") return { status: 200, corp: '["plecat@x.ro"]' };
      if (a.url.pathname === "/api/v1/product_reviews") {
        return { status: 200, corp: `<reviews><review><review_id>r1</review_id><review_date>2026-11-17 10:00:00</review_date><review_author>Ana Pop</review_author><product_id>22222222-2222-4222-8222-222222222222</product_id><rating>10</rating><review_text><![CDATA[Super]]></review_text></review><review><review_id>r2</review_id><product_id>11111111-1111-4111-8111-111111111111</product_id><rating>8</rating></review></reviews>` };
      }
      return { status: 404, corp: "" };
    };
    const r = await ruleaza();
    assert.equal(r.status, 200);
    assert.equal(TABELE.recovery_optout[0].email, "plecat@x.ro");
    /* Numai recenzia produsului magazinului; cea a unui produs strain se sare. */
    assert.equal(TABELE.recenzii_produse.length, 1);
    const rec = TABELE.recenzii_produse[0];
    assert.equal(rec.product_id, "22222222-2222-4222-8222-222222222222");
    assert.equal(rec.nota, 10);
    assert.equal(rec.text, "Super");
    assert.ok(!("ascunsa" in rec), "ce a ascuns comerciantul ramane ascuns: `ascunsa` nu se scrie");
    const stare = TABELE.themarketer_stare.find((s) => s.business_id === BIZ)!;
    assert.ok(stare.dezabonari_sincronizat_la);
    assert.ok(stare.recenzii_sincronizat_la);
  });
});
