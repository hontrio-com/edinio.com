"use server";

// Dashboard server actions for the About You Marketplace integration (Faza 0:
// connect / test / disconnect / status / settings). Mirrors the OLX action
// pattern: an owner `guard`, config load/save on store_settings.aboutyou_config,
// and count-only status queries (safe past the 1000-row PostgREST cap).
//
// SECURITY: the API key lives in aboutyou_config (owner-only via RLS, like every
// other *_config secret). These actions NEVER return the raw key to the client —
// only a masked preview and booleans.

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { aboutyouGloballyEnabled, aboutyouWebhookUrl, maskApiKey } from "@/lib/aboutyou/auth";
import {
  createWebhookSubscription, deleteWebhookSubscription, isAboutYouError, mesajEroare, testConnection,
  type AboutYouAuth,
} from "@/lib/aboutyou/client";
import { ABOUTYOU_WEBHOOK_EVENTS } from "@/lib/aboutyou/webhooks";
import {
  getAllCategoriesCached, getAttributeGroupsCached, getBrandsCached, getCarriersCached,
  getCategoryChildrenCached, getCountriesCached, searchCategories,
} from "@/lib/aboutyou/taxonomy";
import {
  potrivesteCategorie, potrivireSigura, type PublicTinta, type SugestieCategorie,
} from "@/lib/aboutyou/ro-taxonomy";
import {
  loadAboutYouContext, publishProductNow, removeProductNow, syncProductNow, unpublishProductNow,
} from "@/lib/aboutyou/sync";
import {
  atasezaPreturileRon, deriveVariantSlots, validateListing,
  type AboutYouStoredMaterial, type MappableProduct,
} from "@/lib/aboutyou/mapping";
import type {
  AboutYouAttributeGroup, AboutYouBrand, AboutYouCarrier, AboutYouCategory, AboutYouCategoryMapEntry,
  AboutYouConfig, AboutYouCountriesResponse, AboutYouEnvironment, AboutYouFulfillmentType,
} from "@/lib/aboutyou/types";
import { DEFAULT_COUNTRY_OF_ORIGIN } from "@/lib/aboutyou/types";

type ServerClient = Awaited<ReturnType<typeof createClient>>;
const FEATURE_PATH = "/dashboard/features/aboutyou";

interface OwnBiz {
  id: string; slug: string; store_name: string | null; business_name: string;
}

async function ownedBusiness(supabase: ServerClient, businessId: string, userId: string): Promise<OwnBiz | null> {
  const { data } = await supabase
    .from("businesses")
    .select("id, slug, store_name, business_name")
    .eq("id", businessId).eq("user_id", userId).single();
  return (data as OwnBiz) ?? null;
}

async function guard(businessId: string): Promise<{ supabase: ServerClient; userId: string; biz: OwnBiz } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  const biz = await ownedBusiness(supabase, businessId, user.id);
  if (!biz) return { error: "Magazin negasit" };
  return { supabase, userId: user.id, biz };
}

/*
 * Configurarea se citeste si se scrie MEREU cu clientul de serviciu, niciodata
 * cu cel al utilizatorului.
 *
 * `public.store_settings` e o vedere care decripteaza campurile sensibile prin
 * `privat.decripteaza_config`, iar aceea returneaza configul NEDECRIPTAT cand
 * rolul apelantului e `anon` sau `authenticated` — adica exact rolul cu care
 * ruleaza actiunile de aici. Citita asa, `api_key` iesea `enc.v1.…`, era trimisa
 * ca `X-API-Key` si About You raspundea 401 la fiecare cerere. Conectarea parea
 * sa reuseasca, pentru ca acolo cheia venea din formular, nu din baza.
 *
 * Ocolirea RLS e sigura: fiecare apelant trece intai prin `guard()`, care
 * verifica proprietatea magazinului. E acelasi tipar folosit deja in fisier
 * pentru tabelele `aboutyou_*`.
 */
async function loadConfig(businessId: string): Promise<AboutYouConfig> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("store_settings").select("aboutyou_config").eq("business_id", businessId).single();
  return ((data?.aboutyou_config as AboutYouConfig) ?? {}) || {};
}

async function saveConfig(businessId: string, config: AboutYouConfig): Promise<boolean> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("store_settings").select("id").eq("business_id", businessId).single();
  if (existing) {
    const { error } = await admin.from("store_settings")
      .update({ aboutyou_config: config as never, updated_at: new Date().toISOString() })
      .eq("business_id", businessId);
    return !error;
  }
  const { error } = await admin.from("store_settings")
    .insert({ business_id: businessId, aboutyou_config: config as never });
  return !error;
}

// Human-readable readiness: what still blocks publishing to About You.
// Local (not exported): a "use server" module may only export async functions.
function aboutyouReadinessError(config: AboutYouConfig): string | null {
  if (!config.connected || !config.api_key) return "Conectează mai întâi contul About You (cheia API).";
  if (config.needs_reconnect) return "Sesiunea About You a expirat. Reconectează contul.";
  if (!config.brand_id) return "Alege brandul About You în setări.";
  if (!config.ship_countries || config.ship_countries.length === 0) return "Alege cel puțin o țară de listare.";
  if (config.price_mode !== "manual_eur" && !(config.fx?.rate && config.fx.rate > 0)) {
    return "Setează cursul valutar RON -> EUR în setări.";
  }
  return null;
}

// ── Status ────────────────────────────────────────────────────────────────────
export interface AboutYouStatus {
  globallyEnabled: boolean;
  connected: boolean;
  needsReconnect: boolean;
  environment: AboutYouEnvironment;
  apiKeyMasked: string | null;
  apiKeyAddedAt?: string;
  sellerName?: string;
  fulfillmentType: AboutYouFulfillmentType;
  priceMode: "fx_from_ron" | "manual_eur";
  fxRate?: number;
  fxMarginPct?: number;
  fxUpdatedAt?: string;
  brandId?: number;
  brandName?: string;
  shipCountries: string[];
  targetAudience: PublicTinta | null;
  defaultCountryOfOrigin: string;
  defaultCarrierKey?: string;
  carrierMap: Record<string, string>;
  autoSync: boolean;
  lastSyncAt?: string;
  webhookActive: boolean;
  ready: boolean;
  readinessError: string | null;
  categoryMap: Record<string, AboutYouCategoryMapEntry>;
  counts: { listings: number; published: number; rejected: number; variants: number; queued: number };
}

export async function getAboutYouStatus(businessId: string): Promise<AboutYouStatus | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const { supabase } = g;
  const config = await loadConfig(businessId);

  const [{ count: listings }, { count: published }, { count: rejected }, { count: variants }, { count: queued }] = await Promise.all([
    supabase.from("aboutyou_listings").select("id", { count: "exact", head: true }).eq("business_id", businessId),
    // About You raporteaza produsele publicate cu statusul `active`, nu
    // `published` — acela e doar valoarea pe care o TRIMITEM la publicare. Numarat
    // doar pe „published", contorul arata mereu zero.
    supabase.from("aboutyou_listings").select("id", { count: "exact", head: true }).eq("business_id", businessId).in("status", ["published", "active"]),
    supabase.from("aboutyou_listings").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("status", "rejected"),
    supabase.from("aboutyou_variants").select("id", { count: "exact", head: true }).eq("business_id", businessId),
    supabase.from("aboutyou_sync_queue").select("id", { count: "exact", head: true }).eq("business_id", businessId),
  ]);

  return {
    globallyEnabled: aboutyouGloballyEnabled(),
    connected: !!config.connected && !!config.api_key,
    needsReconnect: config.needs_reconnect === true,
    environment: config.environment ?? "production",
    apiKeyMasked: config.api_key ? maskApiKey(config.api_key) : null,
    apiKeyAddedAt: config.api_key_added_at,
    sellerName: config.seller_name,
    fulfillmentType: config.fulfillment_type ?? "dropshipping",
    priceMode: config.price_mode ?? "fx_from_ron",
    fxRate: config.fx?.rate,
    fxMarginPct: config.fx?.margin_pct,
    fxUpdatedAt: config.fx?.updated_at,
    brandId: config.brand_id,
    brandName: config.brand_name,
    shipCountries: config.ship_countries ?? [],
    targetAudience: config.target_audience ?? null,
    defaultCountryOfOrigin: config.default_country_of_origin ?? DEFAULT_COUNTRY_OF_ORIGIN,
    defaultCarrierKey: config.default_carrier_key,
    carrierMap: config.carrier_map ?? {},
    autoSync: config.auto_sync !== false,
    lastSyncAt: config.last_sync_at,
    webhookActive: !!config.webhook_subscription_id,
    ready: aboutyouReadinessError(config) === null,
    readinessError: aboutyouReadinessError(config),
    categoryMap: config.category_map ?? {},
    counts: {
      listings: listings ?? 0, published: published ?? 0, rejected: rejected ?? 0,
      variants: variants ?? 0, queued: queued ?? 0,
    },
  };
}

// ── Connect / disconnect ────────────────────────────────────────────────────────
export async function connectAboutYou(
  businessId: string, apiKeyRaw: string, environment: AboutYouEnvironment, label?: string,
): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  if (!aboutyouGloballyEnabled()) return { error: "Integrarea About You nu este disponibilă momentan." };

  const apiKey = (apiKeyRaw ?? "").trim();
  if (apiKey.length < 8) return { error: "Cheia API pare invalidă. Copiaz-o din Seller Center > Settings > API Keys." };
  const env: AboutYouEnvironment = environment === "sandbox" ? "sandbox" : "production";

  const test = await testConnection({ apiKey, environment: env });
  if (!test.ok) return { error: test.error };

  const prev = await loadConfig(businessId);
  const next: AboutYouConfig = {
    ...prev,
    connected: true,
    api_key: apiKey,
    api_key_label: (label ?? "").trim() || prev.api_key_label,
    api_key_added_at: new Date().toISOString(),
    environment: env,
    needs_reconnect: false,
    // Sensible defaults from the locked decisions (kept if already set).
    fulfillment_type: prev.fulfillment_type ?? "dropshipping",
    price_mode: prev.price_mode ?? "fx_from_ron",
    default_country_of_origin: prev.default_country_of_origin ?? DEFAULT_COUNTRY_OF_ORIGIN,
    auto_sync: prev.auto_sync ?? true,
  };
  const ok = await saveConfig(businessId, next);
  if (!ok) {
    logError({ action: "aboutyou.connect", message: "saveConfig failed", details: { businessId }, businessId, userId: g.userId });
    return { error: "Eroare la salvarea conexiunii. Încearcă din nou." };
  }
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

export async function disconnectAboutYou(businessId: string): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;

  /*
   * Abonamentul de webhook se sterge INAINTE de a arunca configul.
   *
   * Odata sters `webhook_subscription_id`, nu mai avem cum sa-l dezabonam: About
   * You continua sa trimita evenimente catre o ruta care nu mai are secretul de
   * verificat, ora de ora, iar comerciantul nu are de unde sa-l opreasca decat
   * din Seller Center. Esecul stergerii nu blocheaza deconectarea — omul a cerut
   * sa se deconecteze.
   */
  const prev = await loadConfig(businessId);
  if (prev.api_key && prev.webhook_subscription_id) {
    await deleteWebhookSubscription(
      { apiKey: prev.api_key, environment: prev.environment },
      prev.webhook_subscription_id,
    );
  }

  await saveConfig(businessId, {});
  const admin = createAdminClient();
  await admin.from("aboutyou_sync_queue").delete().eq("business_id", businessId);
  await admin.from("aboutyou_variants").delete().eq("business_id", businessId);
  await admin.from("aboutyou_batches").delete().eq("business_id", businessId);
  await admin.from("aboutyou_listings").delete().eq("business_id", businessId);
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

// ── Settings ────────────────────────────────────────────────────────────────────
export interface AboutYouSettingsInput {
  fulfillment_type?: AboutYouFulfillmentType;
  price_mode?: "fx_from_ron" | "manual_eur";
  fx_rate?: number | null;
  fx_margin_pct?: number | null;
  brand_id?: number | null;
  brand_name?: string | null;
  ship_countries?: string[];
  default_country_of_origin?: string;
  default_carrier_key?: string | null;
  auto_sync?: boolean;
  target_audience?: PublicTinta;
}

/*
 * Tarile de listare se valideaza pe moneda, nu doar pe cod.
 *
 * `PriceSchema` nu are camp de moneda: About You citeste pretul in moneda TARII.
 * Noi convertim RON in EUR o singura data si trimitem acelasi numar pentru toate
 * tarile — corect doar acolo unde moneda chiar e euro. Un produs de 100 lei
 * (≈20 EUR) trimis catre Polonia se citeste 20 PLN, adica sub un sfert din pret,
 * si se vinde asa la fiecare comanda.
 *
 * Pana cand conversia se face per moneda, blocam aici tarile non-euro. Blocajul
 * sta pe server, nu doar in interfata: alegerea tarii e o decizie despre bani.
 */
async function tariNeEuro(auth: AboutYouAuth, coduri: string[]): Promise<string[]> {
  if (coduri.length === 0) return [];
  const r = await getCountriesCached(auth);
  if (!r.ok) return [];   // fara nomenclator nu inventam un blocaj
  const moneda = new Map((r.data.currencies ?? []).map((c) => [c.country_code, c.code]));
  return coduri.filter((c) => {
    const m = moneda.get(c);
    return m != null && m !== "EUR";
  });
}

export async function saveAboutYouSettings(
  businessId: string, input: AboutYouSettingsInput,
): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const config = await loadConfig(businessId);

  if (input.ship_countries && input.ship_countries.length > 0) {
    const auth = authFromConfig(config);
    if (auth) {
      const neEuro = await tariNeEuro(auth, input.ship_countries);
      if (neEuro.length > 0) {
        return {
          error: `Momentan putem lista doar în țări cu moneda euro. Scoate din selecție: ${neEuro.join(", ")}.`,
        };
      }
    }
  }

  const fxRate = input.fx_rate == null ? config.fx?.rate : (input.fx_rate > 0 ? input.fx_rate : undefined);
  const fxMargin = input.fx_margin_pct == null ? config.fx?.margin_pct : Math.max(0, input.fx_margin_pct);
  const fxChanged = input.fx_rate != null || input.fx_margin_pct != null;

  const next: AboutYouConfig = {
    ...config,
    fulfillment_type: input.fulfillment_type ?? config.fulfillment_type ?? "dropshipping",
    price_mode: input.price_mode ?? config.price_mode ?? "fx_from_ron",
    fx: {
      rate: fxRate,
      margin_pct: fxMargin,
      updated_at: fxChanged ? new Date().toISOString() : config.fx?.updated_at,
    },
    brand_id: input.brand_id === null ? undefined : (input.brand_id ?? config.brand_id),
    brand_name: input.brand_name === null ? undefined : (input.brand_name ?? config.brand_name),
    ship_countries: input.ship_countries ?? config.ship_countries,
    default_country_of_origin: input.default_country_of_origin?.trim() || config.default_country_of_origin || DEFAULT_COUNTRY_OF_ORIGIN,
    default_carrier_key: input.default_carrier_key === null ? undefined : (input.default_carrier_key ?? config.default_carrier_key),
    auto_sync: input.auto_sync ?? config.auto_sync,
    target_audience: input.target_audience ?? config.target_audience,
  };
  const ok = await saveConfig(businessId, next);
  if (!ok) return { error: "Eroare la salvare." };
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

// ── Nomenclature (live from About You, using the merchant's key) ────────────────
function authFromConfig(config: AboutYouConfig): AboutYouAuth | null {
  return config.api_key ? { apiKey: config.api_key, environment: config.environment } : null;
}

async function guardedAuth(
  businessId: string,
): Promise<{ supabase: ServerClient; userId: string; config: AboutYouConfig; auth: AboutYouAuth } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const config = await loadConfig(businessId);
  const auth = authFromConfig(config);
  if (!auth) return { error: "Conectează mai întâi contul About You." };
  return { supabase: g.supabase, userId: g.userId, config, auth };
}

/*
 * Un esec de nomenclator ajunge la comerciant cu motivul real, si e si scris in
 * jurnal. Inainte, toate cadeau pe acelasi „Nu am putut …", indiferent daca era
 * cheie invalida, limita de rata sau retea — asa a putut sta ascuns un 401 care
 * lovea absolut fiecare cerere.
 *
 * Cand About You raspunde 401/403, marcam si `needs_reconnect`: bannerul din
 * pagina spune atunci ce e de facut, in loc sa lase omul sa reincerce la infinit.
 */
async function esecNomenclator(
  businessId: string, userId: string, ce: string, actiune: string, r: { error: string; status: number },
): Promise<{ error: string }> {
  logError({
    action: `aboutyou.${actiune}`,
    message: r.error,
    details: { businessId, status: r.status },
    businessId,
    userId,
  });
  if (r.status === 401 || r.status === 403) {
    const config = await loadConfig(businessId);
    if (config.api_key && !config.needs_reconnect) {
      await saveConfig(businessId, { ...config, needs_reconnect: true });
      revalidatePath(FEATURE_PATH);
    }
  }
  return { error: mesajEroare(ce, r.error, r.status) };
}

export async function getAboutYouBrands(businessId: string): Promise<{ brands: AboutYouBrand[] } | { error: string }> {
  const g = await guardedAuth(businessId);
  if ("error" in g) return g;
  const r = await getBrandsCached(g.auth);
  if (!r.ok) return esecNomenclator(businessId, g.userId, "Nu am putut încărca brandurile About You.", "brands", r);
  return { brands: r.data };
}

export async function getAboutYouCountries(businessId: string): Promise<{ data: AboutYouCountriesResponse } | { error: string }> {
  const g = await guardedAuth(businessId);
  if ("error" in g) return g;
  const r = await getCountriesCached(g.auth);
  if (!r.ok) return esecNomenclator(businessId, g.userId, "Nu am putut încărca țările About You.", "countries", r);
  return { data: r.data };
}

export async function getAboutYouCategoryChildren(businessId: string, parentId?: number): Promise<{ categories: AboutYouCategory[] } | { error: string }> {
  const g = await guardedAuth(businessId);
  if ("error" in g) return g;
  const r = await getCategoryChildrenCached(g.auth, parentId);
  if (!r.ok) return esecNomenclator(businessId, g.userId, "Nu am putut încărca categoriile About You.", "categories", r);
  return { categories: r.data };
}

export async function searchAboutYouCategories(businessId: string, query: string): Promise<{ categories: AboutYouCategory[] } | { error: string }> {
  const g = await guardedAuth(businessId);
  if ("error" in g) return g;
  const r = await searchCategories(g.auth, query, { publicImplicit: g.config.target_audience ?? null });
  if (!r.ok) return esecNomenclator(businessId, g.userId, "Nu am putut căuta categorii.", "categories.search", r);
  return { categories: r.data };
}

export async function getAboutYouAttributeGroups(businessId: string, categoryId: number): Promise<{ groups: AboutYouAttributeGroup[] } | { error: string }> {
  const g = await guardedAuth(businessId);
  if ("error" in g) return g;
  const r = await getAttributeGroupsCached(g.auth, categoryId);
  if (!r.ok) return esecNomenclator(businessId, g.userId, "Nu am putut încărca atributele categoriei.", "attribute-groups", r);
  return { groups: r.data };
}

// ── Category mapping (Edinio category -> About You category) ─────────────────────
export async function saveAboutYouCategoryMapEntry(
  businessId: string, edinioCategory: string, entry: AboutYouCategoryMapEntry | null,
): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const config = await loadConfig(businessId);
  const map = { ...(config.category_map ?? {}) };
  if (entry === null) delete map[edinioCategory];
  else map[edinioCategory] = entry;
  const ok = await saveConfig(businessId, { ...config, category_map: map });
  if (!ok) return { error: "Eroare la salvare." };
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

/*
 * ── Mapare automata a categoriilor ──────────────────────────────────────────
 *
 * Comerciantul are „Genti", About You are `Fashion|Women|Accessories|Bags &
 * suitcases|Handbag`. Traducem (vezi ro-taxonomy.ts), dam un scor fiecarei
 * categorii si intoarcem propunerile.
 *
 * NU aplicam tot ce gasim. Se aplica singure doar potrivirile exacte, cu scor
 * mare si cu o a doua varianta vizibil mai slaba; restul raman propuneri pe care
 * omul le confirma dintr-un clic. O categorie mapata gresit inseamna produse
 * respinse la aprobare, iar aia se vede abia peste zile.
 */
export interface SugestieMapare {
  edinioCategory: string;
  /** Deja mapata inainte de rulare — nu se atinge fara „suprascrie". */
  mapataDeja: boolean;
  sigura: boolean;
  optiuni: { category_id: number; label: string; scor: number; motiv: string }[];
}

function optiuneDinSugestie(s: SugestieCategorie) {
  return { category_id: s.category_id, label: s.path, scor: Math.round(s.scor * 100) / 100, motiv: s.motiv };
}

export async function suggestAboutYouCategoryMap(
  businessId: string, categorii: string[],
): Promise<{ sugestii: SugestieMapare[] } | { error: string }> {
  const g = await guardedAuth(businessId);
  if ("error" in g) return g;

  const r = await getAllCategoriesCached(g.auth);
  if (!r.ok) return esecNomenclator(businessId, g.userId, "Nu am putut încărca categoriile About You.", "categories.all", r);

  const mapate = g.config.category_map ?? {};
  const publicImplicit = g.config.target_audience ?? null;

  const sugestii = categorii.slice(0, 500).map((cat) => {
    const optiuni = potrivesteCategorie(cat, r.data, { publicImplicit, limita: 5 });
    return {
      edinioCategory: cat,
      mapataDeja: !!mapate[cat],
      sigura: potrivireSigura(optiuni) !== null,
      optiuni: optiuni.map(optiuneDinSugestie),
    };
  });
  return { sugestii };
}

/**
 * Aplica potrivirile sigure. `suprascrie` decide daca se ating si categoriile
 * deja mapate manual — implicit nu, ca o rulare din greseala sa nu strice o
 * mapare corecta facuta de om.
 */
export async function applyAboutYouCategoryMap(
  businessId: string, categorii: string[], suprascrie = false,
): Promise<{ aplicate: number; ramase: number } | { error: string }> {
  const g = await guardedAuth(businessId);
  if ("error" in g) return g;

  const r = await getAllCategoriesCached(g.auth);
  if (!r.ok) return esecNomenclator(businessId, g.userId, "Nu am putut încărca categoriile About You.", "categories.all", r);

  const config = await loadConfig(businessId);
  const map = { ...(config.category_map ?? {}) };
  const publicImplicit = config.target_audience ?? null;

  let aplicate = 0;
  let ramase = 0;
  for (const cat of categorii.slice(0, 500)) {
    if (map[cat] && !suprascrie) continue;
    const sigura = potrivireSigura(potrivesteCategorie(cat, r.data, { publicImplicit, limita: 5 }));
    if (!sigura) { ramase++; continue; }
    map[cat] = { category_id: sigura.category_id, label: sigura.path };
    aplicate++;
  }

  if (aplicate > 0 && !(await saveConfig(businessId, { ...config, category_map: map }))) {
    return { error: "Eroare la salvarea mapării." };
  }
  revalidatePath(FEATURE_PATH);
  return { aplicate, ramase };
}

// ── Carriers (courier -> About You carrier_key mapping) ─────────────────────────
export async function getAboutYouCarriers(businessId: string): Promise<{ carriers: AboutYouCarrier[] } | { error: string }> {
  const g = await guardedAuth(businessId);
  if ("error" in g) return g;
  const r = await getCarriersCached(g.auth);
  if (!r.ok) return esecNomenclator(businessId, g.userId, "Nu am putut încărca curierii About You.", "carriers", r);
  return { carriers: r.data };
}

export async function saveAboutYouCarrierMap(
  businessId: string, courierCode: string, carrierKey: string | null,
): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const config = await loadConfig(businessId);
  const map = { ...(config.carrier_map ?? {}) };
  if (!carrierKey) delete map[courierCode];
  else map[courierCode] = carrierKey;
  const ok = await saveConfig(businessId, { ...config, carrier_map: map });
  if (!ok) return { error: "Eroare la salvare." };
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

// ── Per-product listing editor ──────────────────────────────────────────────────
export interface AboutYouEditorVariant {
  key: string; label: string; sku: string; ron_price: number;
  ean: string | null; size_id: number | null; second_size_id: number | null; color_id: number | null;
  quantity: number | null; retail_price_eur: number | null; sale_price_eur: number | null; enabled: boolean;
}
export interface AboutYouEditorData {
  productName: string;
  category: string | null;
  images: string[];
  mappedCategoryId: number | null;
  /**
   * Ce fel de compozitie cere categoria. Vine din taxonomie, nu din ce bifeaza
   * comerciantul: About You o cere pentru 849 din cele 851 de categorii, iar
   * textilele au si procente.
   */
  materialType: "textile" | "non-textile" | null;
  listing: {
    brand_id: number | null; category_id: number | null; color_id: number | null;
    attributes: number[]; material: AboutYouStoredMaterial | null;
    country_of_origin: string | null; hs_code: string | null; status: string;
  } | null;
  variants: AboutYouEditorVariant[];
}

interface StoredVariantRow {
  sku: string; ean: string | null; size_id: number | null; second_size_id: number | null;
  color_id: number | null; quantity: number | null; retail_price_eur: number | null;
  sale_price_eur: number | null; enabled: boolean;
}

export async function getAboutYouListingEditor(businessId: string, productId: string): Promise<AboutYouEditorData | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const config = await loadConfig(businessId);

  const { data: product } = await g.supabase
    .from("products")
    .select("id, name, category, images, price, compare_at_price, sku, page_sections, weight_grams, track_inventory, stock_quantity")
    .eq("id", productId).eq("business_id", businessId).maybeSingle();
  if (!product) return { error: "Produs negăsit." };

  const slots = deriveVariantSlots(product as unknown as MappableProduct);

  const { data: listing } = await g.supabase
    .from("aboutyou_listings")
    .select("id, brand_id, category_id, color_id, attributes, material_composition, country_of_origin, hs_code, status")
    .eq("business_id", businessId).eq("product_id", productId).maybeSingle();

  let stored: StoredVariantRow[] = [];
  if (listing) {
    const { data: vs } = await g.supabase
      .from("aboutyou_variants")
      .select("sku, ean, size_id, second_size_id, color_id, quantity, retail_price_eur, sale_price_eur, enabled")
      .eq("listing_id", (listing as { id: string }).id);
    stored = (vs ?? []) as StoredVariantRow[];
  }
  const bySku = new Map(stored.map((v) => [v.sku, v]));

  const variants: AboutYouEditorVariant[] = slots.map((s) => {
    const ex = bySku.get(s.sku);
    return {
      key: s.key, label: s.label, sku: s.sku, ron_price: s.ron_price,
      // Codul de bare completat deja in fisa produsului se preia automat: era
      // scris in Edinio si totusi comerciantul era pus sa-l retasteze aici.
      ean: ex?.ean ?? s.gtin ?? null,
      size_id: ex?.size_id ?? null, second_size_id: ex?.second_size_id ?? null,
      color_id: ex?.color_id ?? null,
      quantity: ex?.quantity ?? s.quantity,
      retail_price_eur: ex?.retail_price_eur ?? null, sale_price_eur: ex?.sale_price_eur ?? null,
      enabled: ex?.enabled ?? true,
    };
  });

  const mappedCategoryId = product.category ? (config.category_map?.[product.category]?.category_id ?? null) : null;
  const l = listing as (Record<string, unknown> & { id: string }) | null;

  // Tipul compozitiei il decide categoria efectiva, nu comerciantul.
  const categorieEfectiva = ((l?.category_id as number | null) ?? mappedCategoryId) ?? null;
  let materialType: "textile" | "non-textile" | null = null;
  if (categorieEfectiva) {
    const auth = authFromConfig(config);
    if (auth) {
      const tax = await getAllCategoriesCached(auth);
      if (tax.ok) materialType = tax.data.find((c) => c.id === categorieEfectiva)?.material_composition_type ?? null;
    }
  }

  return {
    productName: product.name,
    category: product.category,
    images: Array.isArray(product.images) ? (product.images as unknown[]).map(String) : [],
    mappedCategoryId,
    materialType,
    listing: l ? {
      brand_id: (l.brand_id as number | null) ?? null,
      category_id: (l.category_id as number | null) ?? null,
      color_id: (l.color_id as number | null) ?? null,
      attributes: Array.isArray(l.attributes) ? (l.attributes as number[]) : [],
      material: (l.material_composition as AboutYouStoredMaterial | null) ?? null,
      country_of_origin: (l.country_of_origin as string | null) ?? null,
      hs_code: (l.hs_code as string | null) ?? null,
      status: (l.status as string) ?? "draft",
    } : null,
    variants,
  };
}

export interface AboutYouListingInput {
  brand_id: number | null;
  category_id: number | null;
  color_id: number | null;
  attributes: number[];
  material: AboutYouStoredMaterial | null;
  country_of_origin: string | null;
  hs_code: string | null;
  variants: {
    sku: string; ean: string | null; size_id: number | null; second_size_id: number | null;
    color_id: number | null; quantity: number | null; retail_price_eur: number | null;
    sale_price_eur: number | null; enabled: boolean;
  }[];
}

/*
 * Tot ce blocheaza listarea, dintr-o singura trecere, INAINTE de trimitere.
 *
 * `validateListing` exista de la inceput in mapping.ts, dar nu era apelata de
 * nicaieri: comerciantul salva, trimitea, si afla peste minute „produs respins",
 * fara sa i se spuna ce lipseste. Iar cand aflau, aflau cate o problema pe rand,
 * pentru ca `buildAboutYouItems` se opreste la prima.
 */
export async function validateAboutYouListing(
  businessId: string, productId: string, input: AboutYouListingInput,
): Promise<{ issues: string[] } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const config = await loadConfig(businessId);

  const { data: product } = await g.supabase
    .from("products")
    .select("id, name, description, category, images, price, compare_at_price, sku, page_sections, weight_grams, track_inventory, stock_quantity")
    .eq("id", productId).eq("business_id", businessId).maybeSingle();
  if (!product) return { error: "Produs negăsit." };
  const produs = product as unknown as MappableProduct;

  const categorie = input.category_id
    ?? (product.category ? config.category_map?.[product.category]?.category_id ?? null : null);
  let materialType: "textile" | "non-textile" | null = null;
  if (categorie) {
    const auth = authFromConfig(config);
    if (auth) {
      const tax = await getAllCategoriesCached(auth);
      if (tax.ok) materialType = tax.data.find((c) => c.id === categorie)?.material_composition_type ?? null;
    }
  }

  const variants = atasezaPreturileRon(produs, input.variants.map((v) => ({
    sku: v.sku, ean: v.ean, size_id: v.size_id, second_size_id: v.second_size_id,
    color_id: v.color_id, quantity: v.quantity, retail_price_eur: v.retail_price_eur,
    sale_price_eur: v.sale_price_eur, enabled: v.enabled,
  })));

  const issues = validateListing({
    config,
    product: produs,
    listing: {
      brand_id: input.brand_id, category_id: input.category_id, color_id: input.color_id,
      attributes: input.attributes, material_composition: input.material,
      country_of_origin: input.country_of_origin, hs_code: input.hs_code,
    },
    variants,
  }, materialType);

  return { issues };
}

export async function saveAboutYouListing(
  businessId: string, productId: string, input: AboutYouListingInput,
): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const { data: product } = await g.supabase
    .from("products").select("id").eq("id", productId).eq("business_id", businessId).maybeSingle();
  if (!product) return { error: "Produs negăsit." };

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: up, error: upErr } = await admin.from("aboutyou_listings").upsert(
    {
      business_id: businessId, product_id: productId, style_key: productId,
      brand_id: input.brand_id, category_id: input.category_id, color_id: input.color_id,
      attributes: input.attributes as never,
      material_composition: ((input.material ?? {}) as unknown) as never,
      country_of_origin: input.country_of_origin, hs_code: input.hs_code, updated_at: now,
    } as never,
    { onConflict: "business_id,style_key" },
  ).select("id").single();
  if (upErr || !up) return { error: "Eroare la salvarea listării." };
  const listingId = (up as { id: string }).id;

  // Build the new variant set and guard against cross-product SKU clashes BEFORE
  // deleting anything, so a duplicate SKU never wipes a listing's variants.
  const rows = input.variants.filter((v) => v.sku?.trim()).map((v) => ({
    listing_id: listingId, business_id: businessId, product_id: productId,
    sku: v.sku.trim(), ean: v.ean, size_id: v.size_id, second_size_id: v.second_size_id,
    color_id: v.color_id, quantity: v.quantity, retail_price_eur: v.retail_price_eur,
    sale_price_eur: v.sale_price_eur, enabled: v.enabled,
  }));
  const newSkus = rows.map((r) => r.sku);
  if (newSkus.length > 0) {
    const { data: clash } = await admin.from("aboutyou_variants")
      .select("sku, listing_id").eq("business_id", businessId).in("sku", newSkus);
    const conflict = (clash ?? []).find((c) => (c as { listing_id: string }).listing_id !== listingId);
    if (conflict) return { error: `SKU-ul „${(conflict as { sku: string }).sku}" este deja folosit de alt produs. Folosește SKU-uri unice.` };
  }
  // Safe now (no cross-listing collision): replace this listing's variants.
  await admin.from("aboutyou_variants").delete().eq("listing_id", listingId);
  if (rows.length > 0) {
    const { error: vErr } = await admin.from("aboutyou_variants").insert(rows as never);
    if (vErr) return { error: "Eroare la salvarea variantelor. Verifică să nu ai SKU-uri duplicate." };
  }
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

// ── Push / publish / remove ─────────────────────────────────────────────────────
async function withContext<T>(businessId: string, fn: (admin: ReturnType<typeof createAdminClient>, ctx: NonNullable<Awaited<ReturnType<typeof loadAboutYouContext>>>) => Promise<T>): Promise<T | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return { error: g.error };
  const admin = createAdminClient();
  const ctx = await loadAboutYouContext(admin, businessId);
  if (!ctx) return { error: "Conexiunea About You nu este disponibilă. Reconectează contul." };
  return fn(admin, ctx);
}

export async function syncAboutYouProduct(businessId: string, productId: string): Promise<{ success: true } | { error: string }> {
  const res = await withContext(businessId, (admin, ctx) => syncProductNow(admin, ctx, productId));
  if ("error" in res) {
    logError({ action: "aboutyou.sync", message: res.error, details: { businessId, productId }, businessId });
    return { error: res.error };
  }
  revalidatePath(FEATURE_PATH);
  revalidatePath("/dashboard/products");
  return { success: true };
}

export async function publishAboutYouProduct(businessId: string, productId: string): Promise<{ success: true } | { error: string }> {
  const res = await withContext(businessId, (admin, ctx) => publishProductNow(admin, ctx, productId));
  if ("error" in res) return { error: res.error };
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

export async function unpublishAboutYouProduct(businessId: string, productId: string): Promise<{ success: true } | { error: string }> {
  const res = await withContext(businessId, (admin, ctx) => unpublishProductNow(admin, ctx, productId));
  if ("error" in res) return { error: res.error };
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

export async function removeAboutYouListing(businessId: string, productId: string): Promise<{ success: true } | { error: string }> {
  const res = await withContext(businessId, (admin, ctx) => removeProductNow(admin, ctx, productId));
  if ("error" in res) return { error: res.error };
  revalidatePath(FEATURE_PATH);
  revalidatePath("/dashboard/products");
  return { success: true };
}

// ── Listings table ────────────────────────────────────────────────────────────────
export interface AboutYouListingRow {
  product_id: string | null;
  style_key: string;
  name: string;
  status: string;
  error: string | null;
  rejectionCount: number;
  lastSyncedAt: string | null;
}

/*
 * O pagina de produse, cu listarile lor.
 *
 * Inainte, pagina incarca 300 de produse si 200 de listari si le imperechea in
 * memorie. Peste atat, produsele pur si simplu lipseau din lista — iar cele
 * listate DEJA pe About You, dar aflate dupa prima suta de listari, se afisau ca
 * „Nelistat": comerciantul apasa „Trimite" pe ceva ce era deja acolo. Fara nicio
 * cautare si fara paginare, la o mie de produse ecranul era inutilizabil.
 */
// Nu se exporta: intr-un fisier „use server" doar functiile async au voie sa fie
// exporturi, iar o constanta exportata rupe compilarea intregului modul.
const ABOUTYOU_PAGE_SIZE = 50;

export interface AboutYouProductPage {
  products: { id: string; name: string; category: string | null; is_active: boolean }[];
  listings: AboutYouListingRow[];
  total: number;
  page: number;
  pages: number;
}

export async function getAboutYouProductPage(
  businessId: string, page = 1, q = "",
): Promise<AboutYouProductPage | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;

  const pagina = Math.max(1, Math.floor(page));
  const cautare = q.trim().slice(0, 80);
  const from = (pagina - 1) * ABOUTYOU_PAGE_SIZE;

  let query = g.supabase
    .from("products").select("id, name, category, is_active", { count: "exact" })
    .eq("business_id", businessId).eq("is_active", true);
  if (cautare) query = query.ilike("name", `%${cautare}%`);

  const { data, count } = await query
    .order("updated_at", { ascending: false })
    .range(from, from + ABOUTYOU_PAGE_SIZE - 1);

  const products = (data ?? []) as AboutYouProductPage["products"];
  const total = count ?? products.length;

  // Listarile se cer DOAR pentru produsele de pe pagina: asa nu mai poate exista
  // un produs listat caruia sa nu-i gasim listarea.
  let listings: AboutYouListingRow[] = [];
  if (products.length > 0) {
    const { data: ls } = await g.supabase
      .from("aboutyou_listings")
      .select("product_id, style_key, status, error, rejection_reasons, last_synced_at, products(name)")
      .eq("business_id", businessId)
      .in("product_id", products.map((p) => p.id));
    listings = (ls ?? []).map(randListare);
  }

  return { products, listings, total, page: pagina, pages: Math.max(1, Math.ceil(total / ABOUTYOU_PAGE_SIZE)) };
}

function randListare(r: {
  product_id: string | null; style_key: string; status: string; error: string | null;
  rejection_reasons: unknown; last_synced_at: string | null; products: unknown;
}): AboutYouListingRow {
  const prod = r.products as { name?: string } | { name?: string }[] | null;
  const name = Array.isArray(prod) ? prod[0]?.name : prod?.name;
  return {
    product_id: r.product_id,
    style_key: r.style_key,
    name: name ?? "Produs",
    status: r.status,
    error: r.error,
    rejectionCount: Array.isArray(r.rejection_reasons) ? r.rejection_reasons.length : 0,
    lastSyncedAt: r.last_synced_at,
  };
}

export async function getAboutYouListings(businessId: string): Promise<AboutYouListingRow[]> {
  const g = await guard(businessId);
  if ("error" in g) return [];
  const { data } = await g.supabase
    .from("aboutyou_listings")
    .select("product_id, style_key, status, error, rejection_reasons, last_synced_at, products(name)")
    .eq("business_id", businessId)
    .order("updated_at", { ascending: false })
    .limit(200);

  return (data ?? []).map((r) => {
    const prod = r.products as { name?: string } | { name?: string }[] | null;
    const name = Array.isArray(prod) ? prod[0]?.name : prod?.name;
    const rejections = Array.isArray(r.rejection_reasons) ? r.rejection_reasons.length : 0;
    return {
      product_id: r.product_id,
      style_key: r.style_key,
      name: name ?? "Produs",
      status: r.status,
      error: r.error,
      rejectionCount: rejections,
      lastSyncedAt: r.last_synced_at,
    };
  });
}

// ── Webhooks (stock.updated now; order events in Faza 3) ────────────────────────
export async function subscribeAboutYouWebhook(businessId: string): Promise<{ success: true } | { error: string }> {
  const g = await guardedAuth(businessId);
  if ("error" in g) return g;
  /*
   * Tokenul din URL e a doua incuietoare a rutei de webhook.
   *
   * Schema de semnatura a lui About You nu e documentata, deci verificarea ei e o
   * deductie care poate cadea mereu. Tokenul asta il stie doar About You, pentru
   * ca doar in URL-ul lui de abonare l-am pus — si nu depinde de nimic ghicit.
   * Se genereaza la fiecare abonare, deci o reabonare il si roteste.
   */
  const token = randomBytes(24).toString("base64url");
  const url = `${aboutyouWebhookUrl()}?businessId=${encodeURIComponent(businessId)}&token=${token}`;
  const res = await createWebhookSubscription(g.auth, { events: ABOUTYOU_WEBHOOK_EVENTS, url, description: "Edinio sync" });
  if (isAboutYouError(res)) return { error: res.error };
  const next: AboutYouConfig = {
    ...g.config,
    webhook_token: token,
    // `id` vine INTREG in raspuns (SecretWebhookSubscriptionSchema), iar noi il
    // folosim ca segment de cale la dezabonare — deci il pastram ca sir.
    webhook_subscription_id: res.data?.id != null ? String(res.data.id) : g.config.webhook_subscription_id,
    webhook_secret: res.data?.client_secret ?? g.config.webhook_secret,
  };
  if (!(await saveConfig(businessId, next))) return { error: "Eroare la salvare." };
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

export async function unsubscribeAboutYouWebhook(businessId: string): Promise<{ success: true } | { error: string }> {
  const g = await guardedAuth(businessId);
  if ("error" in g) return g;
  if (g.config.webhook_subscription_id) {
    await deleteWebhookSubscription(g.auth, g.config.webhook_subscription_id);
  }
  const next: AboutYouConfig = { ...g.config, webhook_subscription_id: undefined, webhook_secret: undefined, webhook_token: undefined };
  await saveConfig(businessId, next);
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

// ── Bulk operations (Faza 5) ────────────────────────────────────────────────────
async function enqueueForListings(
  supabase: ServerClient, businessId: string, op: "upsert" | "publish", statusFilter?: string,
): Promise<number> {
  let q = supabase.from("aboutyou_listings").select("product_id")
    .eq("business_id", businessId).not("product_id", "is", null);
  if (statusFilter) q = q.eq("status", statusFilter);
  const { data } = await q.limit(2000);
  const ids = [...new Set((data ?? []).map((l) => l.product_id).filter(Boolean) as string[])];
  if (ids.length === 0) return 0;
  const admin = createAdminClient();
  const rows = ids.map((id) => ({ business_id: businessId, product_id: id, offer_id: id, op }));
  for (let i = 0; i < rows.length; i += 1000) {
    await admin.from("aboutyou_sync_queue").upsert(rows.slice(i, i + 1000) as never, { onConflict: "business_id,offer_id,op" });
  }
  return rows.length;
}

// Re-send every enriched listing to About You (create/update).
export async function syncAllAboutYou(businessId: string): Promise<{ queued: number } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const queued = await enqueueForListings(g.supabase, businessId, "upsert");
  revalidatePath(FEATURE_PATH);
  return { queued };
}

// Publish every listing that already exists on About You as a draft.
export async function publishAllAboutYou(businessId: string): Promise<{ queued: number } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const queued = await enqueueForListings(g.supabase, businessId, "publish", "draft");
  revalidatePath(FEATURE_PATH);
  return { queued };
}
