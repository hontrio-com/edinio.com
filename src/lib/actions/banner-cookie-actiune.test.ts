import assert from "node:assert/strict";
import { test, describe, before, beforeEach, after } from "node:test";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { parseCookieBannerConfig } from "@/lib/cookie-consent";

/**
 * ═══ `updateCookieBannerConfig`, RULAT CHIAR EL (25.11.2026) ═══
 *
 * ⚠ CE APARA: optiunea comerciantului „Eticheta Google Ads porneste inainte de acord” ajunge in baza cum a
 * pus-o el. Comerciantul e operatorul datelor din magazinul lui: daca o opreste si apasa „Salveaza”, iar cheia
 * nu se scrie, vitrina cade pe valoarea din oficiu (pornita) si eticheta porneste mai departe inainte de acord,
 * desi panoul ii spune ca a salvat.
 *
 * Gasit la recenzie: pana aici drumul era pazit doar de bucati de text cautate in surse. Actiunea putea scrie
 * numai `enabled` si `position` si toate probele treceau.
 */

const U1 = "u8100000-0000-4000-8000-000000000001";
const U2 = "u8100000-0000-4000-8000-000000000002";
const BIZ = "b8100000-0000-4000-8000-000000000001";

type Rand = Record<string, unknown>;
let MAGAZINE: Rand[] = [];
let SETARI: Rand[] = [];
let scrieri: Rand[] = [];
let utilizator = U1;

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

/* Doar identitatea si `revalidatePath` sunt inlocuite; restul actiunii ruleaza cum e. */
const HOOK = `data:text/javascript,${encodeURIComponent(
  `export async function resolve(specifier, context, next) {
     if (specifier === "@/lib/supabase/server") {
       return { url: "data:text/javascript," + encodeURIComponent("export const createClient = async () => globalThis.__clientDeProba();"), shortCircuit: true, format: "module" };
     }
     if (specifier === "next/cache" && String(context.parentURL ?? "").endsWith("/store.actions.ts")) {
       return { url: "data:text/javascript," + encodeURIComponent("export const revalidatePath = (cale) => { globalThis.__revalidate.push(cale); }; export const revalidateTag = () => {};"), shortCircuit: true, format: "module" };
     }
     return next(specifier, context);
   }`,
)}`;

let updateCookieBannerConfig: (typeof import("@/lib/actions/store.actions"))["updateCookieBannerConfig"];
const g = globalThis as unknown as { __clientDeProba: () => unknown; __revalidate: string[] };

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
  g.__revalidate = [];
  g.__clientDeProba = () => ({
    auth: { getUser: async () => ({ data: { user: { id: utilizator } }, error: null }) },
    from: (t: string) => adevarat.from(t),
  });
  ({ updateCookieBannerConfig } = await import("@/lib/actions/store.actions"));
});

after(async () => {
  await new Promise<void>((r) => baza.close(() => r()));
});

beforeEach(() => {
  utilizator = U1;
  MAGAZINE = [{ id: BIZ, user_id: U1, slug: "casa-lumen" }];
  SETARI = [{ business_id: BIZ, cookie_banner_config: null }];
  scrieri = [];
  g.__revalidate = [];
});

/* Ce citeste vitrina dupa salvare: randul din baza, trecut prin acelasi curatator ca in layoutul ei. */
const laVitrina = () => parseCookieBannerConfig((SETARI[0] as { cookie_banner_config: unknown }).cookie_banner_config);

describe("optiunea comerciantului ajunge in baza cum a pus-o el", () => {
  test("⚠⚠ oprita din panou, se scrie oprita, iar vitrina o citeste oprita", async () => {
    const r = await updateCookieBannerConfig(BIZ, { enabled: true, position: "bottom-bar", google_ads_inainte_de_acord: false });
    assert.deepEqual(r, { success: true });
    assert.deepEqual(scrieri, [{ cookie_banner_config: { enabled: true, position: "bottom-bar", google_ads_inainte_de_acord: false } }]);
    assert.equal(laVitrina().google_ads_inainte_de_acord, false, "comerciantul a oprit optiunea, iar vitrina o vede pornita");
    /* Vitrina se redeseneaza: altfel pagina tinuta in memorie ar purta scriptul vechi. */
    assert.ok(g.__revalidate.includes("/casa-lumen"), "vitrina magazinului nu a fost redesenata dupa salvare");
  });

  test("pornita la loc, se scrie pornita; pozitia si starea bannerului raman ale lui", async () => {
    await updateCookieBannerConfig(BIZ, { enabled: true, position: "center", google_ads_inainte_de_acord: false });
    await updateCookieBannerConfig(BIZ, { enabled: false, position: "bottom-left", google_ads_inainte_de_acord: true });
    assert.deepEqual(laVitrina(), { enabled: false, position: "bottom-left", google_ads_inainte_de_acord: true });
    assert.equal(scrieri.length, 2);
  });

  test("⚠ o valoare care nu e `true` sau `false` nu ajunge in baza: se scrie valoarea din oficiu", async () => {
    /* O actiune de server primeste ce i se trimite, nu ce promite tipul. */
    const r = await updateCookieBannerConfig(BIZ, { enabled: true, position: "nicaieri", google_ads_inainte_de_acord: "nu" } as never);
    assert.deepEqual(r, { success: true });
    assert.deepEqual(scrieri, [{ cookie_banner_config: { enabled: true, position: "bottom-bar", google_ads_inainte_de_acord: true } }]);
  });

  test("⚠ magazinul altcuiva nu se atinge", async () => {
    utilizator = U2;
    const r = await updateCookieBannerConfig(BIZ, { enabled: true, position: "bottom-bar", google_ads_inainte_de_acord: false });
    assert.deepEqual(r, { error: "Magazin negasit" });
    assert.equal(scrieri.length, 0);
    assert.equal(laVitrina().google_ads_inainte_de_acord, true);
  });
});

describe("drumul din ecranul de Setari pana la actiune", () => {
  const setari = readFileSync("src/components/dashboard/SettingsClient.tsx", "utf8");
  const pagina = readFileSync("src/app/(dashboard)/dashboard/settings/page.tsx", "utf8");

  test("ecranul porneste de la ce e in baza si trimite toata configuratia, nu doar starea si pozitia", () => {
    assert.ok(pagina.includes("cookieBanner={parseCookieBannerConfig(storeSettings?.cookie_banner_config)}"), "ecranul nu mai porneste de la randul din baza");
    assert.ok(setari.includes("const [cookieCfg, setCookieCfg] = useState<CookieBannerConfig>(cookieBanner);"));
    assert.ok(setari.includes("result = await updateCookieBannerConfig(businessId, cookieCfg);"), "salvarea nu mai trimite configuratia intreaga");
    assert.ok(setari.includes("onCheckedChange={(v) => setCookieCfg(c => ({ ...c, google_ads_inainte_de_acord: v }))}"));
  });
});
