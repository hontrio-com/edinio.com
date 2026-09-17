import assert from "node:assert/strict";
import { test, describe, before, after, beforeEach } from "node:test";
import http from "node:http";
import type { AddressInfo } from "node:net";

/**
 * CAPATUL `/api/meta/eveniment` SI RUNTIME-UL `fbTrack`, RULATE CHIAR ELE (17.09.2026).
 *
 * ⚠ Ruta ruleaza cu o baza PostgREST de proba (magazinul si setarile lui) si cu un Graph API de proba. Runtime-ul
 * din browser ruleaza cu un `window` minim si un `fbq` de proba: ce se verifica e ca pixelul si serverul primesc
 * ACELASI `eventID`, ca achizitia nu pleaca niciodata din browser spre server, si ca fara Conversions API nu
 * pleaca nimic spre server.
 */

type Rand = Record<string, unknown>;
let magazine: Rand[] = [];
let setari: Rand[] = [];
let produse: Rand[] = [];
let cereriBaza = 0;
const laMeta: { url: string; corp: Rand }[] = [];

const baza = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://baza");
  const cale = url.pathname.replace("/rest/v1/", "");
  let corp = "";
  req.on("data", (c) => { corp += c; });
  req.on("end", () => {
    cereriBaza++;
    const unul = (req.headers.accept ?? "").includes("vnd.pgrst.object");
    const json = (cod: number, d: unknown) => { res.writeHead(cod, { "content-type": "application/json" }); res.end(JSON.stringify(d)); };
    const eq = (r: Rand) => [...url.searchParams].every(([k, v]) => ["select", "limit", "offset", "order"].includes(k) || String(r[k]) === v.replace(/^eq\./, ""));
    const lista = (rs: Rand[]) => (unul ? json(rs.length ? 200 : 406, rs[0] ?? {}) : json(200, rs));
    if (req.method !== "GET") { res.writeHead(201); res.end(); return; }
    if (cale === "businesses") return lista(magazine.filter(eq));
    /* Alias pe o cheie JSON, ca PostgREST: `harta:google_merchant_config->category_map`. */
    const alias = (url.searchParams.get("select") ?? "").match(/^(\w+):(\w+)->(\w+)$/);
    if (cale === "store_settings" && alias) {
      return lista(setari.filter(eq).map((r) => ({ [alias[1]]: (r[alias[2]] as Rand | null)?.[alias[3]] ?? null })));
    }
    if (cale === "store_settings") return lista(setari.filter(eq));
    if (cale === "products") return lista(produse.filter(eq));
    return json(200, []);
  });
});

const fetchAdevarat = globalThis.fetch;
let POST: (req: unknown) => Promise<Response>;
let NextRequest: (typeof import("next/server"))["NextRequest"];

before(async () => {
  await new Promise<void>((r) => baza.listen(0, "127.0.0.1", () => r()));
  const { port } = baza.address() as AddressInfo;
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "cheie-de-proba";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "cheie-anonima";
  globalThis.fetch = (async (intrare: unknown, optiuni?: RequestInit) => {
    const adresa = String(typeof intrare === "object" && intrare && "url" in intrare ? (intrare as { url: string }).url : intrare);
    if (adresa.startsWith("https://graph.facebook.com/")) {
      laMeta.push({ url: adresa, corp: JSON.parse(String(optiuni?.body)) });
      return new Response(JSON.stringify({ events_received: 1 }), { headers: { "content-type": "application/json" } });
    }
    return fetchAdevarat(intrare as string, optiuni);
  }) as typeof fetch;
  ({ POST } = (await import("@/app/api/meta/eveniment/route")) as unknown as { POST: typeof POST });
  ({ NextRequest } = await import("next/server"));
});

after(async () => {
  globalThis.fetch = fetchAdevarat;
  await new Promise<void>((r) => baza.close(() => r()));
});

beforeEach(() => {
  laMeta.length = 0;
  cereriBaza = 0;
});

const asteapta = () => new Promise((r) => setTimeout(r, 60));

function cerere(slug: string, corp: Rand, ip = "86.120.1.2") {
  return new NextRequest("https://caian-textile.ro/api/meta/eveniment", {
    method: "POST",
    body: JSON.stringify({ magazin: slug, ...corp }),
    headers: {
      "content-type": "application/json",
      "user-agent": "Mozilla/5.0 (iPhone)",
      "x-forwarded-for": ip,
      cookie: "_fbp=fb.1.1596403881668.1116446470; _fbc=nu-e-bun",
    },
  });
}

const eveniment = (extra: Rand = {}) => ({
  event_name: "AddToCart", event_id: "a1b2c3d4-e5f6", event_source_url: "https://caian-textile.ro/product/husa",
  custom_data: { value: 90, currency: "RON", content_type: "product", content_ids: ["p1-rosu"], contents: [{ id: "p1-rosu", quantity: 1, item_price: 90 }], em: "a@b.ro" },
  ...extra,
});

describe("capatul /api/meta/eveniment", () => {
  before(() => {
    magazine = [
      { id: "b1", slug: "caian", custom_domain: "caian-textile.ro" },
      { id: "b2", slug: "fara-capi", custom_domain: "fara.ro" },
      { id: "b3", slug: "stins", custom_domain: "stins.ro" },
      { id: "b4", slug: "cu-test", custom_domain: "cu-test.ro" },
    ];
    setari = [
      { business_id: "b1", marketing_config: { facebook_pixel_id: "123456789012345", facebook_capi_activ: true }, meta_capi_config: { access_token: "EAAtoken" } },
      { business_id: "b2", marketing_config: { facebook_pixel_id: "123456789012345" }, meta_capi_config: null },
      /* Tokenul exista, dar semnalul e stins: nimic nu pleaca. */
      { business_id: "b3", marketing_config: { facebook_pixel_id: "123456789012345" }, meta_capi_config: { access_token: "EAAtoken" } },
      { business_id: "b4", marketing_config: { facebook_pixel_id: "123456789012345", facebook_capi_activ: true }, meta_capi_config: { access_token: "EAAtoken", test_event_code: "TEST321" } },
    ];
  });

  test("⚠ trimite la Meta cu ACELASI event_id, datele vizitatorului din cerere si doar campurile permise", async () => {
    const r = await POST(cerere("caian", eveniment()));
    assert.equal(r.status, 204);
    await asteapta();
    assert.equal(laMeta.length, 1);
    assert.match(laMeta[0].url, /\/123456789012345\/events$/);
    const [ev] = laMeta[0].corp.data as Rand[];
    assert.equal(ev.event_name, "AddToCart");
    assert.equal(ev.event_id, "a1b2c3d4-e5f6");
    assert.equal(ev.action_source, "website");
    assert.deepEqual(ev.user_data, { client_user_agent: "Mozilla/5.0 (iPhone)", client_ip_address: "86.120.1.2", fbp: "fb.1.1596403881668.1116446470" });
    assert.equal((ev.custom_data as Rand).em, undefined, "un camp strain a ajuns la Meta");
    assert.equal(laMeta[0].corp.access_token, "EAAtoken");
  });

  test("fara Conversions API (lipsa tokenului sau semnalul stins): 204 si nimic la Meta", async () => {
    assert.equal((await POST(cerere("fara-capi", eveniment({ event_source_url: "https://fara.ro/p" })))).status, 204);
    assert.equal((await POST(cerere("stins", eveniment({ event_source_url: "https://stins.ro/p" })))).status, 204);
    await asteapta();
    assert.equal(laMeta.length, 0);
  });

  test("⚠ refuzate: achizitia din browser, pagina altui site, magazin fara cerere buna", async () => {
    assert.equal((await POST(cerere("caian", eveniment({ event_name: "Purchase" })))).status, 400);
    assert.equal((await POST(cerere("caian", eveniment({ event_source_url: "https://alt-site.ro/p" })))).status, 400);
    assert.equal((await POST(cerere("caian/../x", eveniment()))).status, 400);
    await asteapta();
    assert.equal(laMeta.length, 0);
  });

  test("codul de test al magazinului insoteste evenimentul (Test events, nu datele reale)", async () => {
    assert.equal((await POST(cerere("cu-test", eveniment({ event_source_url: "https://cu-test.ro/p" })))).status, 204);
    await asteapta();
    assert.equal(laMeta.length, 1);
    assert.equal(laMeta[0].corp.test_event_code, "TEST321");
  });

  test("corpul peste 16 KB e refuzat; peste 240 de cereri pe minut de la acelasi IP, 429", async () => {
    const mare = await POST(cerere("caian", eveniment({ custom_data: { content_name: "x".repeat(17_000) } }), "86.120.9.9"));
    assert.equal(mare.status, 413);
    const coduri: number[] = [];
    for (let i = 0; i < 241; i++) {
      coduri.push((await POST(cerere("nu-exista-" + i, { event_name: "Purchase" }, "86.120.7.7"))).status);
    }
    assert.equal(coduri.filter((c) => c === 429).length, 1, "limita de rata nu s-a aplicat la a 241-a cerere");
    assert.equal(coduri[240], 429);
    await asteapta();
    assert.equal(laMeta.length, 0);
  });

  test("magazinul se citeste o data pe minut pe instanta, nu la fiecare vizualizare", async () => {
    await POST(cerere("caian", eveniment({ event_id: "b1b2c3d4-e5f6" })));
    const dupaPrima = cereriBaza;
    await POST(cerere("caian", eveniment({ event_id: "c1b2c3d4-e5f6" })));
    assert.equal(cereriBaza, dupaPrima, "a doua cerere a citit din nou baza");
    await asteapta();
  });
});

describe("feedul Facebook Catalog, rulat pe ruta", () => {
  const PID = "7d0e3a40-1111-4222-8333-944455556666";
  before(() => {
    magazine.push({ id: "b9", slug: "cu-feed", custom_domain: null, store_name: "Magazinul", business_name: "Firma SRL", is_published: true });
    setari.push({
      business_id: "b9", marketing_config: {}, meta_capi_config: null,
      google_merchant_config: { refresh_token: "secret", category_map: { Parfumuri: "Health & Beauty > Personal Care > Fragrances" } },
    });
    produse = [{
      id: PID, business_id: "b9", is_active: true, name: "Parfum", slug: "parfum", description: "<p>Floral</p>", price: 120,
      compare_at_price: null, images: ["https://pub-exemplu.r2.dev/products/p/parfum.webp"], category: "Parfumuri", is_bundle: false,
      track_inventory: false, stock_quantity: null,
      page_sections: { variants: { enabled: true, options: [{ id: "o", name: "Volum", values: ["50 ml"] }], combinations: [{ id: "v50", title: "50 ml", enabled: true }] } },
    }];
  });

  test("⚠ categoria din harta Merchant, ID-ul variantei, linkul pe varianta, imaginea prin JPEG", async () => {
    const { GET } = (await import("@/app/(public)/[slug]/facebook-catalog.xml/route")) as unknown as {
      GET: (r: Request, c: { params: Promise<{ slug: string }> }) => Promise<Response>;
    };
    const r = await GET(new Request("https://www.edinio.com/cu-feed/facebook-catalog.xml"), { params: Promise.resolve({ slug: "cu-feed" }) });
    assert.equal(r.status, 200);
    const xml = await r.text();
    assert.match(xml, new RegExp(`<g:id>${PID}-v50</g:id>`));
    assert.match(xml, new RegExp(`<g:item_group_id>${PID}</g:item_group_id>`));
    assert.match(xml, /<g:google_product_category>479<\/g:google_product_category>/, "harta de categorii din Merchant nu a ajuns in feed");
    assert.match(xml, /<title>Parfum<\/title>/);
    assert.match(xml, /<link>[^<]*\/product\/parfum\?varianta=[^<]+<\/link>/);
    assert.match(xml, /<g:image_link>https:\/\/www\.edinio\.com\/api\/img\?p=products%2Fp%2Fparfum\.webp&amp;w=1024&amp;f=jpg<\/g:image_link>/);
    assert.doesNotMatch(xml, /secret/);
  });
});

describe("runtime-ul din browser (`fbTrack`)", () => {
  type Fereastra = {
    window?: unknown; location?: { href: string }; fbq?: (...a: unknown[]) => void;
    __edinioMeta?: { magazin: string; capi: boolean };
  };
  const g = globalThis as unknown as Fereastra;
  let fbTrack: (e: string, d?: Record<string, unknown>, o?: { eventID?: string }) => void;
  const laPixel: unknown[][] = [];
  const laServer: Rand[] = [];

  before(async () => {
    g.window = globalThis;
    g.location = { href: "https://caian-textile.ro/product/husa" };
    ({ fbTrack } = await import("@/lib/marketing"));
  });

  beforeEach(() => {
    laPixel.length = 0;
    laServer.length = 0;
    g.fbq = (...a: unknown[]) => { laPixel.push(a); };
    globalThis.fetch = (async (u: unknown, o?: RequestInit) => {
      if (String(u) === "/api/meta/eveniment") laServer.push(JSON.parse(String(o?.body)));
      return new Response(null, { status: 204 });
    }) as typeof fetch;
  });

  test("⚠ cu Conversions API: pixelul si serverul primesc ACELASI eventID", () => {
    g.__edinioMeta = { magazin: "caian", capi: true };
    fbTrack("AddToCart", { value: 5, currency: "RON" });
    assert.equal(laPixel.length, 1);
    const [, nume, , opt] = laPixel[0] as [string, string, unknown, { eventID: string }];
    assert.equal(nume, "AddToCart");
    assert.match(opt.eventID, /^[\w-]{8,}$/);
    assert.equal(laServer.length, 1);
    assert.equal(laServer[0].event_id, opt.eventID);
    assert.equal(laServer[0].magazin, "caian");
    assert.equal(laServer[0].event_source_url, "https://caian-textile.ro/product/husa");
  });

  test("⚠ achizitia nu pleaca spre server din browser; fara Conversions API nu pleaca nimic", () => {
    g.__edinioMeta = { magazin: "caian", capi: true };
    fbTrack("Purchase", { value: 5, currency: "RON" }, { eventID: "comanda-123" });
    assert.equal((laPixel[0] as unknown[])[3] && ((laPixel[0] as unknown[])[3] as { eventID: string }).eventID, "comanda-123");
    assert.equal(laServer.length, 0);

    g.__edinioMeta = { magazin: "caian", capi: false };
    fbTrack("ViewContent", { value: 5 });
    assert.equal(laPixel.length, 2);
    assert.equal(laServer.length, 0);
  });

  test("⚠ AddToCart pleaca cu `contents` si ID-ul VARIANTEI din catalog", async () => {
    g.__edinioMeta = { magazin: "caian", capi: true };
    const { trackAddToCart } = await import("@/lib/storefront/cart/track-add");
    trackAddToCart({ productId: "p1", name: "Husa", price: 45, cantitate: 2, comboId: "rosu-vechi", areVariante: true });
    const apel = laPixel.find((a) => a[1] === "AddToCart") as [string, string, Record<string, unknown>, unknown];
    assert.ok(apel, "AddToCart n-a plecat");
    assert.deepEqual(apel[2].content_ids, ["p1-rosu-vechi"]);
    assert.deepEqual(apel[2].contents, [{ id: "p1-rosu-vechi", quantity: 2, item_price: 45 }]);
    assert.equal(apel[2].content_type, "product");
    assert.equal(apel[2].value, 90);
  });

  test("fara pixel incarcat (fara acord) nu pleaca nimic, nici spre server; dupa incarcare, amandoua", async () => {
    g.__edinioMeta = { magazin: "caian", capi: true };
    delete g.fbq;
    fbTrack("InitiateCheckout", { value: 9 });
    assert.equal(laServer.length, 0, "serverul a primit un eveniment inainte ca pixelul (acordul) sa existe");
    g.fbq = (...a: unknown[]) => { laPixel.push(a); };
    const { flushQueue } = await import("@/lib/marketing");
    flushQueue("fb");
    assert.equal(laPixel.length, 1);
    assert.equal(laServer.length, 1);
    assert.equal(laServer[0].event_id, ((laPixel[0] as unknown[])[3] as { eventID: string }).eventID);
  });
});
