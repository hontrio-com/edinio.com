"use server";

// Dashboard server actions for the About You Marketplace integration (Faza 0:
// connect / test / disconnect / status / settings). Mirrors the OLX action
// pattern: an owner `guard`, config load/save on store_settings.aboutyou_config,
// and count-only status queries (safe past the 1000-row PostgREST cap).
//
// SECURITY: the API key lives in aboutyou_config (owner-only via RLS, like every
// other *_config secret). These actions NEVER return the raw key to the client —
// only a masked preview and booleans.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { aboutyouGloballyEnabled, aboutyouWebhookUrl, maskApiKey } from "@/lib/aboutyou/auth";
import {
  createWebhookSubscription, deleteWebhookSubscription, isAboutYouError, testConnection,
  type AboutYouAuth,
} from "@/lib/aboutyou/client";
import { ABOUTYOU_WEBHOOK_EVENTS } from "@/lib/aboutyou/webhooks";
import {
  getAttributeGroupsCached, getBrandsCached, getCarriersCached, getCategoryChildrenCached,
  getCountriesCached, searchCategories,
} from "@/lib/aboutyou/taxonomy";
import {
  loadAboutYouContext, publishProductNow, removeProductNow, syncProductNow, unpublishProductNow,
} from "@/lib/aboutyou/sync";
import { deriveVariantSlots, type AboutYouStoredMaterial, type MappableProduct } from "@/lib/aboutyou/mapping";
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

async function loadConfig(supabase: ServerClient, businessId: string): Promise<AboutYouConfig> {
  const { data } = await supabase
    .from("store_settings").select("aboutyou_config").eq("business_id", businessId).single();
  return ((data?.aboutyou_config as AboutYouConfig) ?? {}) || {};
}

async function saveConfig(supabase: ServerClient, businessId: string, config: AboutYouConfig): Promise<boolean> {
  const { data: existing } = await supabase
    .from("store_settings").select("id").eq("business_id", businessId).single();
  if (existing) {
    const { error } = await supabase.from("store_settings")
      .update({ aboutyou_config: config as never, updated_at: new Date().toISOString() })
      .eq("business_id", businessId);
    return !error;
  }
  const { error } = await supabase.from("store_settings")
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
  const config = await loadConfig(supabase, businessId);

  const [{ count: listings }, { count: published }, { count: rejected }, { count: variants }, { count: queued }] = await Promise.all([
    supabase.from("aboutyou_listings").select("id", { count: "exact", head: true }).eq("business_id", businessId),
    supabase.from("aboutyou_listings").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("status", "published"),
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

  const prev = await loadConfig(g.supabase, businessId);
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
  const ok = await saveConfig(g.supabase, businessId, next);
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
  await saveConfig(g.supabase, businessId, {});
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
}

export async function saveAboutYouSettings(
  businessId: string, input: AboutYouSettingsInput,
): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const config = await loadConfig(g.supabase, businessId);

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
  };
  const ok = await saveConfig(g.supabase, businessId, next);
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
  const config = await loadConfig(g.supabase, businessId);
  const auth = authFromConfig(config);
  if (!auth) return { error: "Conectează mai întâi contul About You." };
  return { supabase: g.supabase, userId: g.userId, config, auth };
}

export async function getAboutYouBrands(businessId: string): Promise<{ brands: AboutYouBrand[] } | { error: string }> {
  const g = await guardedAuth(businessId);
  if ("error" in g) return g;
  const brands = await getBrandsCached(g.auth);
  if (brands === null) return { error: "Nu am putut încărca brandurile About You." };
  return { brands };
}

export async function getAboutYouCountries(businessId: string): Promise<{ data: AboutYouCountriesResponse } | { error: string }> {
  const g = await guardedAuth(businessId);
  if ("error" in g) return g;
  const data = await getCountriesCached(g.auth);
  if (data === null) return { error: "Nu am putut încărca țările About You." };
  return { data };
}

export async function getAboutYouCategoryChildren(businessId: string, parentId?: number): Promise<{ categories: AboutYouCategory[] } | { error: string }> {
  const g = await guardedAuth(businessId);
  if ("error" in g) return g;
  const categories = await getCategoryChildrenCached(g.auth, parentId);
  if (categories === null) return { error: "Nu am putut încărca categoriile About You." };
  return { categories };
}

export async function searchAboutYouCategories(businessId: string, query: string): Promise<{ categories: AboutYouCategory[] } | { error: string }> {
  const g = await guardedAuth(businessId);
  if ("error" in g) return g;
  const categories = await searchCategories(g.auth, query);
  if (categories === null) return { error: "Nu am putut căuta categorii." };
  return { categories };
}

export async function getAboutYouAttributeGroups(businessId: string, categoryId: number): Promise<{ groups: AboutYouAttributeGroup[] } | { error: string }> {
  const g = await guardedAuth(businessId);
  if ("error" in g) return g;
  const groups = await getAttributeGroupsCached(g.auth, categoryId);
  if (groups === null) return { error: "Nu am putut încărca atributele categoriei." };
  return { groups };
}

// ── Category mapping (Edinio category -> About You category) ─────────────────────
export async function saveAboutYouCategoryMapEntry(
  businessId: string, edinioCategory: string, entry: AboutYouCategoryMapEntry | null,
): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const config = await loadConfig(g.supabase, businessId);
  const map = { ...(config.category_map ?? {}) };
  if (entry === null) delete map[edinioCategory];
  else map[edinioCategory] = entry;
  const ok = await saveConfig(g.supabase, businessId, { ...config, category_map: map });
  if (!ok) return { error: "Eroare la salvare." };
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

// ── Carriers (courier -> About You carrier_key mapping) ─────────────────────────
export async function getAboutYouCarriers(businessId: string): Promise<{ carriers: AboutYouCarrier[] } | { error: string }> {
  const g = await guardedAuth(businessId);
  if ("error" in g) return g;
  const carriers = await getCarriersCached(g.auth);
  if (carriers === null) return { error: "Nu am putut încărca curierii About You." };
  return { carriers };
}

export async function saveAboutYouCarrierMap(
  businessId: string, courierCode: string, carrierKey: string | null,
): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const config = await loadConfig(g.supabase, businessId);
  const map = { ...(config.carrier_map ?? {}) };
  if (!carrierKey) delete map[courierCode];
  else map[courierCode] = carrierKey;
  const ok = await saveConfig(g.supabase, businessId, { ...config, carrier_map: map });
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
  const config = await loadConfig(g.supabase, businessId);

  const { data: product } = await g.supabase
    .from("products").select("id, name, category, images, price, compare_at_price, sku, page_sections")
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
      ean: ex?.ean ?? null, size_id: ex?.size_id ?? null, second_size_id: ex?.second_size_id ?? null,
      color_id: ex?.color_id ?? null, quantity: ex?.quantity ?? null,
      retail_price_eur: ex?.retail_price_eur ?? null, sale_price_eur: ex?.sale_price_eur ?? null,
      enabled: ex?.enabled ?? true,
    };
  });

  const mappedCategoryId = product.category ? (config.category_map?.[product.category]?.category_id ?? null) : null;
  const l = listing as (Record<string, unknown> & { id: string }) | null;
  return {
    productName: product.name,
    category: product.category,
    images: Array.isArray(product.images) ? (product.images as unknown[]).map(String) : [],
    mappedCategoryId,
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
  const url = `${aboutyouWebhookUrl()}?businessId=${encodeURIComponent(businessId)}`;
  const res = await createWebhookSubscription(g.auth, { events: ABOUTYOU_WEBHOOK_EVENTS, url, description: "Edinio sync" });
  if (isAboutYouError(res)) return { error: res.error };
  const next: AboutYouConfig = {
    ...g.config,
    webhook_subscription_id: res.data?.id ?? g.config.webhook_subscription_id,
    webhook_secret: res.data?.client_secret ?? g.config.webhook_secret,
  };
  if (!(await saveConfig(g.supabase, businessId, next))) return { error: "Eroare la salvare." };
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

export async function unsubscribeAboutYouWebhook(businessId: string): Promise<{ success: true } | { error: string }> {
  const g = await guardedAuth(businessId);
  if ("error" in g) return g;
  if (g.config.webhook_subscription_id) {
    await deleteWebhookSubscription(g.auth, g.config.webhook_subscription_id);
  }
  const next: AboutYouConfig = { ...g.config, webhook_subscription_id: undefined, webhook_secret: undefined };
  await saveConfig(g.supabase, businessId, next);
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
