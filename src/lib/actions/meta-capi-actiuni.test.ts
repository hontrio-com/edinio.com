import assert from "node:assert/strict";
import { test, describe, before, beforeEach, after } from "node:test";
import { register } from "node:module";
import http from "node:http";
import type { AddressInfo } from "node:net";

/**
 * ═══ CONVERSIONS API DIN PANOU, RULAT CHIAR EL (17.09.2026) ═══
 *
 * `saveMetaCapi`, `getMetaCapiStare`, `removeMetaCapi`, `trimiteEvenimentDeTestMeta` si pastrarea semnalului in
 * `saveMarketingConfig`. Fiecare export „use server” e un punct de intrare public.
 *
 * ⚠ INLOCUITE SUNT DOAR CAPETELE: identitatea (`@/lib/supabase/server` iese pe un client supabase-js adevarat,
 * spre baza de proba), `revalidatePath` si `headers()`, care in afara lui Next arunca. Graph API e un `fetch` de
 * proba. Interogarile si scrierile sunt cele adevarate, prin PostgREST de proba.
 *
 * ⚠ CE APARA:
 *  - tokenul se verifica la Meta pe pixelul magazinului INAINTE sa fie scris; unul refuzat nu ajunge in baza;
 *  - tokenul nu se intoarce niciodata in browser;
 *  - schimbarea Pixel ID-ului stinge trimiterea de pe server, iar reaprinderea verifica tokenul pe pixelul nou;
 *  - evenimentul de test pleaca doar cu codul de test (altfel ar intra in datele reale).
 */

const U1 = "u6000000-0000-4000-8000-000000000001";
const U2 = "u6000000-0000-4000-8000-000000000002";
const BIZ = "b6000000-0000-4000-8000-000000000001";
const PIXEL = "123456789012345";
const PIXEL_NOU = "999999999999999";

type Rand = Record<string, unknown>;
let MAGAZINE: Rand[] = [];
let SETARI: Rand[] = [];
let scrieri: { tabel: string; interogare: string; corp: Rand }[] = [];
let laMeta: { url: string; metoda: string; antete: Record<string, string>; corp: Rand | null }[] = [];
let raspunsMeta: (url: string) => { status: number; json: unknown } = () => ({ status: 200, json: {} });

function filtreaza(randuri: Rand[], url: URL): Rand[] {
  return randuri.filter((r) => {
    for (const [k, v] of url.searchParams) {
      if (["select", "limit"].includes(k)) continue;
      if (!v.startsWith("eq.")) throw new Error(`operator neasteptat: ${k}=${v}`);
      if (String(r[k]) !== v.slice(3)) return false;
    }
    return true;
  });
}

function proiecteaza(r: Rand, select: string | null): Rand {
  if (!select || select === "*") return { ...r };
  const out: Rand = {};
  for (const c of select.split(",").map((x) => x.trim())) if (c in r) out[c] = r[c];
  return out;
}

const baza = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://baza");
  const tabel = url.pathname.replace("/rest/v1/", "");
  let corpBrut = "";
  req.on("data", (b) => (corpBrut += b));
  req.on("end", () => {
    const json = (cod: number, corp: unknown) => { res.writeHead(cod, { "content-type": "application/json" }); res.end(JSON.stringify(corp)); };
    const randuri = tabel === "businesses" ? MAGAZINE : tabel === "store_settings" ? SETARI : null;
    if (!randuri) return json(404, { message: `tabel de proba necunoscut: ${tabel}` });
    try {
      if (req.method === "PATCH") {
        const corp = JSON.parse(corpBrut || "{}") as Rand;
        scrieri.push({ tabel, interogare: url.search, corp });
        for (const r of filtreaza(randuri, url)) Object.assign(r, corp);
        res.writeHead(204);
        return res.end();
      }
      if (req.method !== "GET") return json(405, { message: `metoda neasteptata ${req.method}` });
      const gasite = filtreaza(randuri, url).map((r) => proiecteaza(r, url.searchParams.get("select")));
      if (!(req.headers.accept ?? "").includes("vnd.pgrst.object")) return json(200, gasite);
      if (gasite.length !== 1) return json(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
      return json(200, gasite[0]);
    } catch (e) {
      return json(400, { message: (e as Error).message });
    }
  });
});

const HOOK = `data:text/javascript,${encodeURIComponent(
  `export async function resolve(specifier, context, next) {
     if (specifier === "@/lib/supabase/server") {
       return { url: "data:text/javascript," + encodeURIComponent("export const createClient = async () => globalThis.__clientDeProba();"), shortCircuit: true, format: "module" };
     }
     if (specifier === "next/cache" && String(context.parentURL ?? "").endsWith("/meta-capi.actions.ts")) {
       return { url: "data:text/javascript," + encodeURIComponent("export const revalidatePath = () => {}; export const revalidateTag = () => {};"), shortCircuit: true, format: "module" };
     }
     if (specifier === "next/headers" && String(context.parentURL ?? "").endsWith("/meta-capi.actions.ts")) {
       return { url: "data:text/javascript," + encodeURIComponent("export const headers = async () => new Headers({ 'user-agent': 'Mozilla/5.0 (panou)', 'x-forwarded-for': '86.120.1.2' });"), shortCircuit: true, format: "module" };
     }
     return next(specifier, context);
   }`,
)}`;

type Actiuni = typeof import("@/lib/actions/meta-capi.actions");
let saveMetaCapi: Actiuni["saveMetaCapi"];
let getMetaCapiStare: Actiuni["getMetaCapiStare"];
let removeMetaCapi: Actiuni["removeMetaCapi"];
let trimiteEvenimentDeTestMeta: Actiuni["trimiteEvenimentDeTestMeta"];
let saveMarketingConfig: (typeof import("@/lib/actions/marketing.actions"))["saveMarketingConfig"];

let utilizator: { id: string } | null = { id: U1 };
const g = globalThis as unknown as { __clientDeProba: () => unknown };
const fetchAdevarat = globalThis.fetch;

before(async () => {
  await new Promise<void>((r) => baza.listen(0, "127.0.0.1", () => r()));
  const { port } = baza.address() as AddressInfo;
  const adresa = `http://127.0.0.1:${port}`;
  process.env.NEXT_PUBLIC_SUPABASE_URL = adresa;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "cheie-anonima-de-proba";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "cheie-de-serviciu-de-proba";

  globalThis.fetch = (async (intrare: unknown, optiuni?: RequestInit) => {
    const u = String(typeof intrare === "object" && intrare && "url" in intrare ? (intrare as { url: string }).url : intrare);
    if (u.startsWith("https://graph.facebook.com/")) {
      laMeta.push({
        url: u, metoda: optiuni?.method ?? "GET", antete: (optiuni?.headers ?? {}) as Record<string, string>,
        corp: typeof optiuni?.body === "string" ? JSON.parse(optiuni.body) : null,
      });
      const r = raspunsMeta(u);
      return new Response(JSON.stringify(r.json), { status: r.status, headers: { "content-type": "application/json" } });
    }
    return fetchAdevarat(intrare as string, optiuni);
  }) as typeof fetch;

  register(HOOK);
  const { createClient } = await import("@supabase/supabase-js");
  const adevarat = createClient(adresa, "cheie-anonima-de-proba", { auth: { autoRefreshToken: false, persistSession: false } });
  g.__clientDeProba = () => ({
    auth: { getUser: async () => ({ data: { user: utilizator }, error: null }) },
    from: (t: string) => adevarat.from(t),
  });
  ({ saveMetaCapi, getMetaCapiStare, removeMetaCapi, trimiteEvenimentDeTestMeta } = await import("@/lib/actions/meta-capi.actions"));
  ({ saveMarketingConfig } = await import("@/lib/actions/marketing.actions"));
});

after(async () => {
  globalThis.fetch = fetchAdevarat;
  await new Promise<void>((r) => baza.close(() => r()));
});

beforeEach(() => {
  MAGAZINE = [{ id: BIZ, user_id: U1, slug: "caian", custom_domain: "caian-textile.ro" }];
  SETARI = [{
    business_id: BIZ,
    marketing_config: { facebook_pixel_id: PIXEL, tiktok_pixel_id: "C4ABCDEFGHIJKLMNOPQR" },
    meta_capi_config: null,
    updated_at: null,
  }];
  scrieri = [];
  laMeta = [];
  utilizator = { id: U1 };
  raspunsMeta = (u) => (u.includes("/events")
    ? { status: 200, json: { events_received: 1 } }
    : { status: 200, json: { id: u.includes(PIXEL_NOU) ? PIXEL_NOU : PIXEL, name: "Pixelul magazinului" } });
});

const setari = () => SETARI[0] as { marketing_config: Rand; meta_capi_config: Rand | null };
const cuTokenActiv = () => {
  setari().marketing_config = { facebook_pixel_id: PIXEL, facebook_capi_activ: true };
  setari().meta_capi_config = { access_token: "EAAvechi", pixel_id: PIXEL, ultima_eroare: "token expirat" };
};

describe("saveMetaCapi", () => {
  test("⚠ tokenul nou se verifica pe pixelul magazinului INAINTE de scriere; refuzat, nu ajunge in baza", async () => {
    raspunsMeta = () => ({ status: 400, json: { error: { message: "Invalid OAuth access token", code: 190 } } });
    const r = await saveMetaCapi(BIZ, { token: "EAAgresit" });
    assert.ok("error" in r && /Meta a refuzat tokenul/.test(r.error));
    assert.equal(laMeta.length, 1);
    assert.match(laMeta[0].url, new RegExp(`/${PIXEL}\\?fields=id,name$`));
    assert.equal(laMeta[0].antete.Authorization, "Bearer EAAgresit");
    assert.equal(scrieri.length, 0, "un token refuzat de Meta a fost scris");
  });

  test("acceptat: tokenul, pixelul verificat si semnalul se scriu; restul configurarii ramane", async () => {
    setari().meta_capi_config = { access_token: "EAAvechi", pixel_id: PIXEL, ultima_eroare: "token expirat", ultima_eroare_la: "2026-09-01" };
    const r = await saveMetaCapi(BIZ, { token: "  EAAbun  ", testEventCode: "TEST4821" });
    assert.deepEqual(r, { success: true });
    assert.equal(laMeta.length, 1);
    assert.equal(laMeta[0].antete.Authorization, "Bearer EAAbun", "s-a verificat tokenul vechi in locul celui lipit");
    const cfg = setari().meta_capi_config!;
    assert.equal(cfg.access_token, "EAAbun");
    assert.equal(cfg.pixel_id, PIXEL);
    assert.equal(cfg.test_event_code, "TEST4821");
    assert.equal(cfg.ultima_eroare, undefined, "eroarea tokenului vechi a ramas pe cel nou");
    assert.deepEqual(setari().marketing_config, { facebook_pixel_id: PIXEL, tiktok_pixel_id: "C4ABCDEFGHIJKLMNOPQR", facebook_capi_activ: true });
  });

  test("fara token nou, pe acelasi pixel verificat, nu mai intreaba Meta (doar codul de test se schimba)", async () => {
    cuTokenActiv();
    assert.deepEqual(await saveMetaCapi(BIZ, { testEventCode: "TEST99" }), { success: true });
    assert.equal(laMeta.length, 0);
    assert.equal(setari().meta_capi_config!.access_token, "EAAvechi");
    assert.equal(setari().meta_capi_config!.test_event_code, "TEST99");
  });

  test("refuzuri fara scriere: alt magazin, fara pixel, fara token, cod de test fara forma", async () => {
    utilizator = { id: U2 };
    assert.ok("error" in (await saveMetaCapi(BIZ, { token: "EAAx" })));
    utilizator = { id: U1 };
    setari().marketing_config = {};
    assert.ok("error" in (await saveMetaCapi(BIZ, { token: "EAAx" })));
    setari().marketing_config = { facebook_pixel_id: PIXEL };
    assert.ok("error" in (await saveMetaCapi(BIZ, {})));
    assert.ok("error" in (await saveMetaCapi(BIZ, { token: "EAA cu spatii" })));
    assert.ok("error" in (await saveMetaCapi(BIZ, { token: "EAAx", testEventCode: "<script>" })));
    assert.equal(scrieri.length, 0);
  });
});

describe("Pixel ID-ul schimbat", () => {
  test("⚠ alt pixel stinge trimiterea de pe server; acelasi pixel o pastreaza", async () => {
    cuTokenActiv();
    assert.deepEqual(await saveMarketingConfig(BIZ, { facebook_pixel_id: PIXEL }), { success: true });
    assert.equal(setari().marketing_config.facebook_capi_activ, true, "salvarea aceluiasi pixel a stins Conversions API");
    assert.deepEqual(await saveMarketingConfig(BIZ, { facebook_pixel_id: PIXEL_NOU }), { success: true });
    assert.equal(setari().marketing_config.facebook_capi_activ, undefined, "tokenul pixelului vechi ar fi trimis in cel nou");
    const stare = await getMetaCapiStare(BIZ);
    assert.ok(!("error" in stare) && stare.tokenSalvat && !stare.activ);
  });

  test("⚠ reaprinderea verifica tokenul VECHI pe pixelul NOU, chiar fara token lipit", async () => {
    cuTokenActiv();
    await saveMarketingConfig(BIZ, { facebook_pixel_id: PIXEL_NOU });
    raspunsMeta = () => ({ status: 400, json: { error: { message: "Missing permission", code: 200 } } });
    assert.ok("error" in (await saveMetaCapi(BIZ, {})));
    assert.equal(laMeta.length, 1);
    assert.match(laMeta[0].url, new RegExp(`/${PIXEL_NOU}\\?`));
    assert.equal(laMeta[0].antete.Authorization, "Bearer EAAvechi");
    assert.equal(setari().marketing_config.facebook_capi_activ, undefined);

    raspunsMeta = () => ({ status: 200, json: { id: PIXEL_NOU } });
    assert.deepEqual(await saveMetaCapi(BIZ, {}), { success: true });
    assert.equal(setari().marketing_config.facebook_capi_activ, true);
    assert.equal(setari().meta_capi_config!.pixel_id, PIXEL_NOU);
  });
});

describe("starea, oprirea, evenimentul de test", () => {
  test("⚠ starea spune DACA e salvat tokenul, niciodata tokenul", async () => {
    cuTokenActiv();
    const stare = await getMetaCapiStare(BIZ);
    assert.ok(!("error" in stare));
    assert.equal(stare.tokenSalvat, true);
    assert.equal(stare.activ, true);
    assert.doesNotMatch(JSON.stringify(stare), /EAAvechi/);
    utilizator = { id: U2 };
    assert.ok("error" in (await getMetaCapiStare(BIZ)));
  });

  test("oprirea sterge tokenul si semnalul, iar pixelul din browser ramane", async () => {
    cuTokenActiv();
    assert.deepEqual(await removeMetaCapi(BIZ), { success: true });
    assert.equal(setari().meta_capi_config, null);
    assert.deepEqual(setari().marketing_config, { facebook_pixel_id: PIXEL });
  });

  test("⚠ evenimentul de test pleaca DOAR cu codul de test, si ajunge in Test events", async () => {
    cuTokenActiv();
    assert.ok("error" in (await trimiteEvenimentDeTestMeta(BIZ)));
    assert.equal(laMeta.length, 0, "un eveniment fara cod de test ar fi intrat in datele reale");

    setari().meta_capi_config = { ...setari().meta_capi_config, test_event_code: "TEST77" };
    assert.deepEqual(await trimiteEvenimentDeTestMeta(BIZ), { success: true, primite: 1 });
    assert.equal(laMeta.length, 1);
    assert.match(laMeta[0].url, new RegExp(`/${PIXEL}/events$`));
    assert.equal(laMeta[0].corp?.test_event_code, "TEST77");
    const [ev] = laMeta[0].corp?.data as Rand[];
    assert.equal(ev.event_name, "PageView");
    assert.equal(ev.event_source_url, "https://caian-textile.ro");
    assert.deepEqual(ev.user_data, { client_user_agent: "Mozilla/5.0 (panou)", client_ip_address: "86.120.1.2" });
  });
});
