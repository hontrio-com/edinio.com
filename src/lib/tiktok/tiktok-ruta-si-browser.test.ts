import assert from "node:assert/strict";
import { test, describe, before, after, beforeEach } from "node:test";
import http from "node:http";
import type { AddressInfo } from "node:net";

/**
 * CAPATUL `/api/tiktok/eveniment` SI RUNTIME-UL `ttqTrack`, RULATE CHIAR ELE (18.09.2026).
 *
 * ⚠ Ruta ruleaza cu o baza PostgREST de proba (magazinul si setarile lui) si cu un Events API de proba.
 * Runtime-ul din browser ruleaza cu un `window` minim si un `ttq` de proba: se verifica faptul ca pixelul si
 * serverul primesc ACELASI `event_id`, ca achizitia nu pleaca niciodata din browser spre server, si ca fara
 * Events API nu pleaca nimic.
 */

type Rand = Record<string, unknown>;
let magazine: Rand[] = [];
let setari: Rand[] = [];
let cereriBaza = 0;
const laTikTok: { url: string; antete: Record<string, string>; corp: Rand }[] = [];

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
    if (cale === "store_settings") return lista(setari.filter(eq));
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
    if (adresa.startsWith("https://business-api.tiktok.com/")) {
      laTikTok.push({ url: adresa, antete: (optiuni?.headers ?? {}) as Record<string, string>, corp: JSON.parse(String(optiuni?.body)) });
      return new Response(JSON.stringify({ code: 0, message: "OK" }), { headers: { "content-type": "application/json" } });
    }
    return fetchAdevarat(intrare as string, optiuni);
  }) as typeof fetch;
  ({ POST } = (await import("@/app/api/tiktok/eveniment/route")) as unknown as { POST: typeof POST });
  ({ NextRequest } = await import("next/server"));
});

after(async () => {
  globalThis.fetch = fetchAdevarat;
  await new Promise<void>((r) => baza.close(() => r()));
});

beforeEach(() => {
  laTikTok.length = 0;
  cereriBaza = 0;
});

const asteapta = () => new Promise((r) => setTimeout(r, 60));

function cerere(slug: string, corp: Rand, ip = "86.120.1.2", cookie = "_ttp=Xy1_2-3.4; ttclid=E.C.P.abcdefghij") {
  return new NextRequest("https://caian-textile.ro/api/tiktok/eveniment", {
    method: "POST",
    body: JSON.stringify({ magazin: slug, ...corp }),
    headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0 (iPhone)", "x-forwarded-for": ip, cookie },
  });
}

const eveniment = (extra: Rand = {}) => ({
  event: "AddToCart", event_id: "a1b2c3d4-e5f6", url: "https://caian-textile.ro/product/husa",
  properties: { value: 90, currency: "RON", content_type: "product", content_ids: ["p1-rosu"], contents: [{ content_id: "p1-rosu", quantity: 1, price: 90 }], email: "a@b.ro" },
  ...extra,
});

describe("capatul /api/tiktok/eveniment", () => {
  before(() => {
    magazine = [
      { id: "b1", slug: "caian", custom_domain: "caian-textile.ro" },
      { id: "b2", slug: "fara-capi", custom_domain: "fara.ro" },
      { id: "b3", slug: "stins", custom_domain: "stins.ro" },
    ];
    setari = [
      { business_id: "b1", marketing_config: { tiktok_pixel_id: "D69ESQRC77U0KGAU8B90", tiktok_capi_activ: true }, tiktok_capi_config: { access_token: "TTtoken" } },
      { business_id: "b2", marketing_config: { tiktok_pixel_id: "D69ESQRC77U0KGAU8B90" }, tiktok_capi_config: null },
      /* Tokenul exista, dar semnalul e stins: nimic nu pleaca. */
      { business_id: "b3", marketing_config: { tiktok_pixel_id: "D69ESQRC77U0KGAU8B90" }, tiktok_capi_config: { access_token: "TTtoken" } },
    ];
  });

  test("⚠ trimite cu ACELASI event_id, tokenul in antet, cookie-urile din cerere si doar campurile permise", async () => {
    const r = await POST(cerere("caian", eveniment()));
    assert.equal(r.status, 204);
    await asteapta();
    assert.equal(laTikTok.length, 1);
    assert.match(laTikTok[0].url, /\/event\/track\/$/);
    assert.equal(laTikTok[0].antete["Access-Token"], "TTtoken");
    assert.equal(laTikTok[0].corp.event_source, "web");
    assert.equal(laTikTok[0].corp.event_source_id, "D69ESQRC77U0KGAU8B90");
    const [ev] = laTikTok[0].corp.data as Rand[];
    assert.equal(ev.event, "AddToCart");
    assert.equal(ev.event_id, "a1b2c3d4-e5f6");
    assert.deepEqual(ev.user, {
      user_agent: "Mozilla/5.0 (iPhone)", ip: "86.120.1.2", ttclid: "E.C.P.abcdefghij", ttp: "Xy1_2-3.4",
    });
    assert.deepEqual(ev.page, { url: "https://caian-textile.ro/product/husa" });
    assert.equal((ev.properties as Rand).email, undefined, "un camp strain a ajuns la TikTok");
    assert.equal((ev.properties as Rand).content_type, "product");
  });

  test("fara Events API (lipsa tokenului sau semnalul stins): 204 si nimic la TikTok", async () => {
    assert.equal((await POST(cerere("fara-capi", eveniment({ url: "https://fara.ro/p" })))).status, 204);
    assert.equal((await POST(cerere("stins", eveniment({ url: "https://stins.ro/p" })))).status, 204);
    await asteapta();
    assert.equal(laTikTok.length, 0);
  });

  test("⚠ refuzate: achizitia din browser, numele vechi, pagina altui site, magazin fara cerere buna", async () => {
    assert.equal((await POST(cerere("caian", eveniment({ event: "Purchase" })))).status, 400);
    assert.equal((await POST(cerere("caian", eveniment({ event: "CompletePayment" })))).status, 400);
    assert.equal((await POST(cerere("caian", eveniment({ url: "https://alt-site.ro/p" })))).status, 400);
    assert.equal((await POST(cerere("caian/../x", eveniment()))).status, 400);
    await asteapta();
    assert.equal(laTikTok.length, 0);
  });

  test("⚠ fara niciun semn despre om (fara cookie-uri si fara IP): 204, si nimic trimis", async () => {
    const fara = new NextRequest("https://caian-textile.ro/api/tiktok/eveniment", {
      method: "POST",
      body: JSON.stringify({ magazin: "caian", ...eveniment({ event_id: "d1b2c3d4-e5f6" }) }),
      headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" },
    });
    assert.equal((await POST(fara)).status, 204);
    await asteapta();
    assert.equal(laTikTok.length, 0);
  });

  test("corpul peste 16 KB e refuzat; peste 240 de cereri pe minut de la acelasi IP, 429", async () => {
    const mare = await POST(cerere("caian", eveniment({ properties: { description: "x".repeat(17_000) } }), "86.120.9.9"));
    assert.equal(mare.status, 413);
    const coduri: number[] = [];
    for (let i = 0; i < 241; i++) coduri.push((await POST(cerere("nu-exista-" + i, { event: "Purchase" }, "86.120.7.7"))).status);
    assert.equal(coduri.filter((c) => c === 429).length, 1);
    assert.equal(coduri[240], 429);
    await asteapta();
    assert.equal(laTikTok.length, 0);
  });

  test("magazinul se citeste o data pe minut pe instanta, nu la fiecare vizualizare", async () => {
    await POST(cerere("caian", eveniment({ event_id: "b1b2c3d4-e5f6" })));
    const dupaPrima = cereriBaza;
    await POST(cerere("caian", eveniment({ event_id: "c1b2c3d4-e5f6" })));
    assert.equal(cereriBaza, dupaPrima, "a doua cerere a citit din nou baza");
    await asteapta();
  });
});

describe("runtime-ul din browser (`ttqTrack`)", () => {
  type Fereastra = {
    window?: unknown; location?: { href: string }; document?: { referrer: string };
    ttq?: { track: (...a: unknown[]) => void }; __edinioTikTok?: { magazin: string; capi: boolean };
  };
  const g = globalThis as unknown as Fereastra;
  let ttqTrack: (e: string, d?: Record<string, unknown>, o?: { eventID?: string }) => void;
  const laPixel: unknown[][] = [];
  const laServer: Rand[] = [];

  before(async () => {
    g.window = globalThis;
    g.location = { href: "https://caian-textile.ro/product/husa" };
    g.document = { referrer: "https://www.tiktok.com/" };
    ({ ttqTrack } = await import("@/lib/marketing"));
  });

  beforeEach(() => {
    laPixel.length = 0;
    laServer.length = 0;
    g.ttq = { track: (...a: unknown[]) => { laPixel.push(a); } };
    globalThis.fetch = (async (u: unknown, o?: RequestInit) => {
      if (String(u) === "/api/tiktok/eveniment") laServer.push(JSON.parse(String(o?.body)));
      return new Response(null, { status: 204 });
    }) as typeof fetch;
  });

  test("⚠ cu Events API: pixelul si serverul primesc ACELASI event_id, plus adresa si referrerul", () => {
    g.__edinioTikTok = { magazin: "caian", capi: true };
    ttqTrack("AddToCart", { value: 5, currency: "RON" });
    assert.equal(laPixel.length, 1);
    const [nume, , opt] = laPixel[0] as [string, unknown, { event_id: string }];
    assert.equal(nume, "AddToCart");
    assert.match(opt.event_id, /^[\w-]{8,}$/);
    assert.equal(laServer.length, 1);
    assert.equal(laServer[0].event_id, opt.event_id);
    assert.equal(laServer[0].event, "AddToCart");
    assert.equal(laServer[0].magazin, "caian");
    assert.equal(laServer[0].url, "https://caian-textile.ro/product/husa");
    assert.equal(laServer[0].referrer, "https://www.tiktok.com/");
  });

  test("⚠ achizitia nu pleaca spre server din browser; fara Events API nu pleaca nimic", () => {
    g.__edinioTikTok = { magazin: "caian", capi: true };
    ttqTrack("Purchase", { value: 5, currency: "RON" }, { eventID: "comanda-123" });
    assert.equal((laPixel[0] as unknown[])[2] && ((laPixel[0] as unknown[])[2] as { event_id: string }).event_id, "comanda-123");
    assert.equal(laServer.length, 0);

    g.__edinioTikTok = { magazin: "caian", capi: false };
    ttqTrack("ViewContent", { value: 5 });
    assert.equal(laPixel.length, 2);
    assert.equal(laServer.length, 0);
  });

  test("⚠ AddToCart pleaca cu `content_type` langa eveniment si cu ID-ul VARIANTEI", async () => {
    g.__edinioTikTok = { magazin: "caian", capi: true };
    const { trackAddToCart } = await import("@/lib/storefront/cart/track-add");
    trackAddToCart({ productId: "p1", name: "Husa", price: 45, cantitate: 2, comboId: "rosu-vechi", areVariante: true });
    const apel = laPixel.find((a) => a[0] === "AddToCart") as [string, Record<string, unknown>, unknown];
    assert.ok(apel, "AddToCart n-a plecat");
    assert.deepEqual(apel[1].content_ids, ["p1-rosu-vechi"]);
    assert.deepEqual(apel[1].contents, [{ content_id: "p1-rosu-vechi", content_name: "Husa", price: 45, quantity: 2 }]);
    assert.equal(apel[1].content_type, "product");
    assert.equal(apel[1].value, 90);
  });

  test("fara pixel incarcat (fara acord) nu pleaca nimic, nici spre server; dupa incarcare, amandoua", async () => {
    g.__edinioTikTok = { magazin: "caian", capi: true };
    delete g.ttq;
    ttqTrack("InitiateCheckout", { value: 9 });
    assert.equal(laServer.length, 0, "serverul a primit un eveniment inainte ca pixelul (acordul) sa existe");
    g.ttq = { track: (...a: unknown[]) => { laPixel.push(a); } };
    const { flushQueue } = await import("@/lib/marketing");
    flushQueue("tt");
    assert.equal(laPixel.length, 1);
    assert.equal(laServer.length, 1);
    assert.equal(laServer[0].event_id, ((laPixel[0] as unknown[])[2] as { event_id: string }).event_id);
  });
});
