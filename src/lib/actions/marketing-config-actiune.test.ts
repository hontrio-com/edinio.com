import assert from "node:assert/strict";
import { test, describe, before, beforeEach, after } from "node:test";
import { register } from "node:module";
import http from "node:http";
import type { AddressInfo } from "node:net";

/**
 * ═══ `saveMarketingConfig`, RULAT CHIAR EL (18.09.2026) ═══
 *
 * ⚠ CE APARA: eticheta de conversie Google Ads nu se poate salva fara ID-ul `AW-…`. Pana la 18.09.2026 se
 * salva linistita langa un tag GA4, iar `send_to` iesea „G-…/eticheta”: Google Ads nu primea nimic, si nimic
 * nu spunea nimanui. Tot aici: ID-ul de conversie se curata, iar semnalele de Conversions API (Meta, TikTok)
 * raman aprinse cand pixelul nu s-a schimbat.
 */

const U1 = "u8000000-0000-4000-8000-000000000001";
const BIZ = "b8000000-0000-4000-8000-000000000001";

type Rand = Record<string, unknown>;
let MAGAZINE: Rand[] = [];
let SETARI: Rand[] = [];
let scrieri: Rand[] = [];

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

const baza = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://baza");
  const tabel = url.pathname.replace("/rest/v1/", "");
  let corpBrut = "";
  req.on("data", (b) => (corpBrut += b));
  req.on("end", () => {
    const json = (cod: number, corp: unknown) => { res.writeHead(cod, { "content-type": "application/json" }); res.end(JSON.stringify(corp)); };
    const randuri = tabel === "businesses" ? MAGAZINE : tabel === "store_settings" ? SETARI : null;
    if (!randuri) return json(404, { message: `tabel de proba necunoscut: ${tabel}` });
    if (req.method === "PATCH") {
      const corp = JSON.parse(corpBrut || "{}") as Rand;
      scrieri.push(corp);
      for (const r of filtreaza(randuri, url)) Object.assign(r, corp);
      res.writeHead(204);
      return res.end();
    }
    if (req.method !== "GET") return json(405, { message: `metoda neasteptata ${req.method}` });
    const gasite = filtreaza(randuri, url);
    if (!(req.headers.accept ?? "").includes("vnd.pgrst.object")) return json(200, gasite);
    if (gasite.length !== 1) return json(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
    return json(200, gasite[0]);
  });
});

const HOOK = `data:text/javascript,${encodeURIComponent(
  `export async function resolve(specifier, context, next) {
     if (specifier === "@/lib/supabase/server") {
       return { url: "data:text/javascript," + encodeURIComponent("export const createClient = async () => globalThis.__clientDeProba();"), shortCircuit: true, format: "module" };
     }
     return next(specifier, context);
   }`,
)}`;

let saveMarketingConfig: (typeof import("@/lib/actions/marketing.actions"))["saveMarketingConfig"];
const g = globalThis as unknown as { __clientDeProba: () => unknown };

before(async () => {
  await new Promise<void>((r) => baza.listen(0, "127.0.0.1", () => r()));
  const { port } = baza.address() as AddressInfo;
  const adresa = `http://127.0.0.1:${port}`;
  process.env.NEXT_PUBLIC_SUPABASE_URL = adresa;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "cheie-anonima-de-proba";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "cheie-de-serviciu-de-proba";
  register(HOOK);
  const { createClient } = await import("@supabase/supabase-js");
  const adevarat = createClient(adresa, "cheie-anonima-de-proba", { auth: { autoRefreshToken: false, persistSession: false } });
  g.__clientDeProba = () => ({
    auth: { getUser: async () => ({ data: { user: { id: U1 } }, error: null }) },
    from: (t: string) => adevarat.from(t),
  });
  ({ saveMarketingConfig } = await import("@/lib/actions/marketing.actions"));
});

after(async () => {
  await new Promise<void>((r) => baza.close(() => r()));
});

beforeEach(() => {
  MAGAZINE = [{ id: BIZ, user_id: U1 }];
  SETARI = [{ business_id: BIZ, marketing_config: {}, updated_at: null }];
  scrieri = [];
});

const config = () => (SETARI[0] as { marketing_config: Rand }).marketing_config;

describe("Google Ads in `saveMarketingConfig`", () => {
  test("⚠⚠ eticheta fara ID de conversie `AW-` e REFUZATA, si nu se scrie nimic", async () => {
    const r = await saveMarketingConfig(BIZ, { google_tag_id: "G-76XBCVV0P2", google_ads_conversion_label: "abc123XYZ" });
    assert.ok("error" in r && /ID-ul de conversie Google Ads/.test(r.error));
    assert.equal(scrieri.length, 0, "configurarea s-a scris desi conversia n-avea unde pleca");
  });

  test("un ID de conversie care nu e `AW-` e refuzat", async () => {
    const r = await saveMarketingConfig(BIZ, { google_ads_conversion_id: "G-76XBCVV0P2" });
    assert.ok("error" in r && /forma AW-/.test(r.error));
    assert.equal(scrieri.length, 0);
  });

  test("ID-ul si eticheta impreuna se salveaza curatate", async () => {
    const r = await saveMarketingConfig(BIZ, {
      google_tag_id: "g-76xbcvv0p2",
      google_ads_conversion_id: " aw-123456789 ",
      google_ads_conversion_label: "AW-123456789/abc123XYZ",
    });
    assert.deepEqual(r, { success: true });
    assert.equal(config().google_ads_conversion_id, "AW-123456789");
    assert.equal(config().google_ads_conversion_label, "abc123XYZ");
    assert.equal(config().google_tag_id, "G-76XBCVV0P2", "tagul Google ramane al lui, langa ID-ul de conversie");
  });

  test("ID-ul de conversie singur (fara eticheta) se salveaza: tagul si remarketingul merg fara ea", async () => {
    assert.deepEqual(await saveMarketingConfig(BIZ, { google_ads_conversion_id: "AW-123456789" }), { success: true });
    assert.equal(config().google_ads_conversion_id, "AW-123456789");
    assert.equal(config().google_ads_conversion_label, undefined);
  });

  test("semnalele de Conversions API raman aprinse cand pixelul nu s-a schimbat", async () => {
    (SETARI[0] as Rand).marketing_config = {
      facebook_pixel_id: "123456789012345", facebook_capi_activ: true,
      tiktok_pixel_id: "D69ESQRC77U0KGAU8B90", tiktok_capi_activ: true,
    };
    const r = await saveMarketingConfig(BIZ, {
      facebook_pixel_id: "123456789012345", tiktok_pixel_id: "D69ESQRC77U0KGAU8B90", google_ads_conversion_id: "AW-123456789",
    });
    assert.deepEqual(r, { success: true });
    assert.equal(config().facebook_capi_activ, true);
    assert.equal(config().tiktok_capi_activ, true);
    assert.equal(config().google_ads_conversion_id, "AW-123456789");
    /* ⚠ Si un ID prea scurt cade, nu se scrie „pe jumatate”. */
    assert.ok("error" in (await saveMarketingConfig(BIZ, { google_ads_conversion_id: "AW-1" })));
    assert.equal(config().google_ads_conversion_id, "AW-123456789", "un ID refuzat a sters ID-ul bun");
  });
});
