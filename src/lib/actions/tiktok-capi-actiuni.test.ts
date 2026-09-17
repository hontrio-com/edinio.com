import assert from "node:assert/strict";
import { test, describe, before, beforeEach, after } from "node:test";
import { register } from "node:module";
import http from "node:http";
import type { AddressInfo } from "node:net";

/**
 * ═══ TIKTOK EVENTS API DIN PANOU, RULAT CHIAR EL (18.09.2026) ═══
 *
 * `saveTikTokCapi`, `getTikTokCapiStare`, `removeTikTokCapi` si pastrarea semnalului in `saveMarketingConfig`.
 *
 * ⚠ CE APARA:
 *  - un token pe care TikTok il numeste `40105` („Invalid or incorrect access token”) NU ajunge in baza;
 *  - un raspuns nesigur (`40001` pe `/user/info/`, obisnuit pentru tokenurile din Events Manager) NU opreste
 *    salvarea, dar se intoarce ca avertisment: altfel un token bun ar fi fost refuzat pe degeaba;
 *  - tokenul nu se intoarce niciodata in browser;
 *  - schimbarea Pixel ID-ului stinge trimiterea de pe server.
 */

const U1 = "u7000000-0000-4000-8000-000000000001";
const U2 = "u7000000-0000-4000-8000-000000000002";
const BIZ = "b7000000-0000-4000-8000-000000000001";
const PIXEL = "D69ESQRC77U0KGAU8B90";
const PIXEL_NOU = "DAANQT3C77UC8FLJE9H0";

type Rand = Record<string, unknown>;
let MAGAZINE: Rand[] = [];
let SETARI: Rand[] = [];
let scrieri: { tabel: string; corp: Rand }[] = [];
let laTikTok: { url: string; antete: Record<string, string> }[] = [];
let raspunsTikTok: () => { status: number; json: unknown } = () => ({ status: 200, json: { code: 0, data: {} } });

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
        scrieri.push({ tabel, corp });
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
     if (specifier === "next/cache" && String(context.parentURL ?? "").endsWith("/tiktok-capi.actions.ts")) {
       return { url: "data:text/javascript," + encodeURIComponent("export const revalidatePath = () => {}; export const revalidateTag = () => {};"), shortCircuit: true, format: "module" };
     }
     return next(specifier, context);
   }`,
)}`;

type Actiuni = typeof import("@/lib/actions/tiktok-capi.actions");
let saveTikTokCapi: Actiuni["saveTikTokCapi"];
let getTikTokCapiStare: Actiuni["getTikTokCapiStare"];
let removeTikTokCapi: Actiuni["removeTikTokCapi"];
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
    if (u.startsWith("https://business-api.tiktok.com/")) {
      laTikTok.push({ url: u, antete: (optiuni?.headers ?? {}) as Record<string, string> });
      const r = raspunsTikTok();
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
  ({ saveTikTokCapi, getTikTokCapiStare, removeTikTokCapi } = await import("@/lib/actions/tiktok-capi.actions"));
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
    marketing_config: { tiktok_pixel_id: PIXEL, facebook_pixel_id: "123456789012345" },
    tiktok_capi_config: null,
    updated_at: null,
  }];
  scrieri = [];
  laTikTok = [];
  utilizator = { id: U1 };
  raspunsTikTok = () => ({ status: 200, json: { code: 0, data: {} } });
});

const setari = () => SETARI[0] as { marketing_config: Rand; tiktok_capi_config: Rand | null };
const cuTokenActiv = () => {
  setari().marketing_config = { tiktok_pixel_id: PIXEL, tiktok_capi_activ: true };
  setari().tiktok_capi_config = { access_token: "TTvechi", pixel_id: PIXEL, ultima_eroare: "code 40105: token" };
};

describe("saveTikTokCapi", () => {
  test("⚠ tokenul pe care TikTok il refuza cu 40105 nu ajunge in baza", async () => {
    raspunsTikTok = () => ({ status: 200, json: { code: 40105, message: "Invalid or incorrect access token" } });
    const r = await saveTikTokCapi(BIZ, { token: "TTgresit" });
    assert.ok("error" in r && /TikTok a refuzat tokenul/.test(r.error));
    assert.equal(laTikTok.length, 1);
    assert.match(laTikTok[0].url, /\/user\/info\/$/);
    assert.equal(laTikTok[0].antete["Access-Token"], "TTgresit");
    assert.equal(scrieri.length, 0, "un token refuzat a fost scris");
  });

  test("⚠ un raspuns NESIGUR salveaza, dar spune ca adevarul se vede la prima trimitere", async () => {
    raspunsTikTok = () => ({ status: 200, json: { code: 40001, message: "No permission" } });
    const r = await saveTikTokCapi(BIZ, { token: "TTbun" });
    assert.ok(!("error" in r) && !!r.avertisment, "un token bun din Events Manager a fost refuzat pe degeaba");
    assert.equal(setari().tiktok_capi_config!.access_token, "TTbun");
  });

  test("acceptat: tokenul, pixelul si semnalul se scriu; restul configurarii ramane", async () => {
    /* ⚠ Fara `pixel_id` in configurarea veche: asa se vede daca salvarea chiar il scrie. */
    setari().tiktok_capi_config = { access_token: "TTvechi", ultima_eroare: "veche", ultima_eroare_la: "2026-09-01" };
    const r = await saveTikTokCapi(BIZ, { token: "  TTnou  " });
    assert.deepEqual(r, { success: true });
    const cfg = setari().tiktok_capi_config!;
    assert.equal(cfg.access_token, "TTnou");
    assert.equal(cfg.pixel_id, PIXEL);
    assert.equal(cfg.ultima_eroare, undefined, "eroarea tokenului vechi a ramas pe cel nou");
    assert.deepEqual(setari().marketing_config, { tiktok_pixel_id: PIXEL, facebook_pixel_id: "123456789012345", tiktok_capi_activ: true });
  });

  test("refuzuri fara scriere: alt magazin, fara pixel, fara token, token cu spatii", async () => {
    utilizator = { id: U2 };
    assert.ok("error" in (await saveTikTokCapi(BIZ, { token: "TTx" })));
    utilizator = { id: U1 };
    setari().marketing_config = {};
    assert.ok("error" in (await saveTikTokCapi(BIZ, { token: "TTx" })));
    setari().marketing_config = { tiktok_pixel_id: PIXEL };
    assert.ok("error" in (await saveTikTokCapi(BIZ, {})));
    assert.ok("error" in (await saveTikTokCapi(BIZ, { token: "TT cu spatii" })));
    assert.equal(scrieri.length, 0);
  });
});

describe("Pixel ID-ul schimbat si starea", () => {
  test("⚠ alt pixel stinge trimiterea de pe server; acelasi pixel o pastreaza", async () => {
    cuTokenActiv();
    assert.deepEqual(await saveMarketingConfig(BIZ, { tiktok_pixel_id: PIXEL }), { success: true });
    assert.equal(setari().marketing_config.tiktok_capi_activ, true, "salvarea aceluiasi pixel a stins Events API");
    assert.deepEqual(await saveMarketingConfig(BIZ, { tiktok_pixel_id: PIXEL_NOU }), { success: true });
    assert.equal(setari().marketing_config.tiktok_capi_activ, undefined, "tokenul pixelului vechi ar fi trimis in cel nou");
    const stare = await getTikTokCapiStare(BIZ);
    assert.ok(!("error" in stare) && stare.tokenSalvat && !stare.activ);
  });

  test("⚠ starea spune DACA e salvat tokenul, niciodata tokenul", async () => {
    cuTokenActiv();
    const stare = await getTikTokCapiStare(BIZ);
    assert.ok(!("error" in stare));
    assert.equal(stare.tokenSalvat, true);
    assert.equal(stare.activ, true);
    assert.match(stare.ultimaEroare ?? "", /40105/);
    assert.doesNotMatch(JSON.stringify(stare), /TTvechi/);
    utilizator = { id: U2 };
    assert.ok("error" in (await getTikTokCapiStare(BIZ)));
  });

  test("oprirea sterge tokenul si semnalul, iar pixelul din browser ramane", async () => {
    cuTokenActiv();
    assert.deepEqual(await removeTikTokCapi(BIZ), { success: true });
    assert.equal(setari().tiktok_capi_config, null);
    assert.deepEqual(setari().marketing_config, { tiktok_pixel_id: PIXEL });
  });
});
