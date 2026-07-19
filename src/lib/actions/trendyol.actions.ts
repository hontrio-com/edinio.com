"use server";

// Dashboard server actions for the Trendyol integration (Faza 0: connect / test /
// disconnect / status / settings). Mirrors the About You action pattern: an owner
// `guard`, config load/save on store_settings.trendyol_config, count-only status
// queries (safe past the 1000-row PostgREST cap).
//
// SECURITY: api_key / api_secret live in trendyol_config (owner-only via RLS, like
// every other *_config secret). These actions NEVER return the raw secrets to the
// client — only a masked preview and booleans.

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { trendyolGloballyEnabled, maskSecret, trendyolWebhookUrl } from "@/lib/trendyol/auth";
import { createWebhook, deleteWebhook, getWebhooks, isTrendyolError, testConnection, type TrendyolAuth } from "@/lib/trendyol/client";
import { TRENDYOL_WEBHOOK_EVENTS } from "@/lib/trendyol/webhooks";
import {
  getCategoryAttributesCached, getCategoryAttributeValuesCached, getSupplierAddressesCached,
  searchBrands, searchLeafCategories,
} from "@/lib/trendyol/taxonomy";
import { loadTrendyolContext, removeProductNow, syncProductNow } from "@/lib/trendyol/sync";
import { setPackageStatus, getFulfillmentState, type TrendyolFulfillmentState } from "@/lib/trendyol/fulfillment";
import { deriveVariantSlots, type MappableProduct } from "@/lib/trendyol/mapping";
import type {
  TrendyolBrand, TrendyolCategoryAttribute, TrendyolCategoryMapEntry, TrendyolConfig,
  TrendyolEnvironment, TrendyolProductAttribute, TrendyolSupplierAddress,
} from "@/lib/trendyol/types";
import { TRENDYOL_CURRENCY } from "@/lib/trendyol/types";

type ServerClient = Awaited<ReturnType<typeof createClient>>;
const FEATURE_PATH = "/dashboard/features/trendyol";

interface OwnBiz { id: string; slug: string; store_name: string | null; business_name: string }

async function ownedBusiness(supabase: ServerClient, businessId: string, userId: string): Promise<OwnBiz | null> {
  const { data } = await supabase
    .from("businesses").select("id, slug, store_name, business_name")
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

async function loadConfig(supabase: ServerClient, businessId: string): Promise<TrendyolConfig> {
  const { data } = await supabase
    .from("store_settings").select("trendyol_config").eq("business_id", businessId).single();
  return ((data?.trendyol_config as TrendyolConfig) ?? {}) || {};
}

async function saveConfig(supabase: ServerClient, businessId: string, config: TrendyolConfig): Promise<boolean> {
  const { data: existing } = await supabase
    .from("store_settings").select("id").eq("business_id", businessId).single();
  if (existing) {
    const { error } = await supabase.from("store_settings")
      .update({ trendyol_config: config as never, updated_at: new Date().toISOString() })
      .eq("business_id", businessId);
    return !error;
  }
  const { error } = await supabase.from("store_settings")
    .insert({ business_id: businessId, trendyol_config: config as never });
  return !error;
}

// Local (not exported): a "use server" module may only export async functions.
function trendyolReadinessError(config: TrendyolConfig): string | null {
  if (!config.connected || !config.api_key || !config.api_secret || !config.supplier_id) {
    return "Conectează mai întâi contul Trendyol (SupplierID + API Key + Secret).";
  }
  if (config.needs_reconnect) return "Sesiunea Trendyol a expirat. Reconectează contul.";
  if (!config.shipment_address_id) return "Alege adresa de expediere în setări.";
  if (!config.returning_address_id) return "Alege adresa de retur în setări.";
  if (!config.default_cargo_company_id) return "Alege compania de curierat Trendyol în setări.";
  return null;
}

// ── Status ────────────────────────────────────────────────────────────────────
export interface TrendyolStatus {
  globallyEnabled: boolean;
  connected: boolean;
  needsReconnect: boolean;
  environment: TrendyolEnvironment;
  supplierId?: string;
  apiKeyMasked: string | null;
  sellerName?: string;
  shipmentAddressId?: number;
  returningAddressId?: number;
  defaultCargoCompanyId?: number;
  currency: string;
  brandId?: number;
  brandName?: string;
  autoSync: boolean;
  lastSyncAt?: string;
  webhookActive: boolean;
  ordersSyncedAt?: string;
  ready: boolean;
  readinessError: string | null;
  categoryMap: Record<string, TrendyolCategoryMapEntry>;
  counts: { listings: number; approved: number; rejected: number; variants: number; queued: number; orders: number };
}

export async function getTrendyolStatus(businessId: string): Promise<TrendyolStatus | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const { supabase } = g;
  const config = await loadConfig(supabase, businessId);

  const [{ count: listings }, { count: approved }, { count: rejected }, { count: variants }, { count: queued }, { count: orders }] = await Promise.all([
    supabase.from("trendyol_listings").select("id", { count: "exact", head: true }).eq("business_id", businessId),
    supabase.from("trendyol_listings").select("id", { count: "exact", head: true }).eq("business_id", businessId).in("status", ["approved", "active"]),
    supabase.from("trendyol_listings").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("status", "rejected"),
    supabase.from("trendyol_variants").select("id", { count: "exact", head: true }).eq("business_id", businessId),
    supabase.from("trendyol_sync_queue").select("id", { count: "exact", head: true }).eq("business_id", businessId),
    supabase.from("trendyol_orders").select("id", { count: "exact", head: true }).eq("business_id", businessId),
  ]);

  return {
    globallyEnabled: trendyolGloballyEnabled(),
    connected: !!config.connected && !!config.api_key && !!config.supplier_id,
    needsReconnect: config.needs_reconnect === true,
    environment: config.environment ?? "production",
    supplierId: config.supplier_id,
    apiKeyMasked: config.api_key ? maskSecret(config.api_key) : null,
    sellerName: config.seller_name,
    shipmentAddressId: config.shipment_address_id,
    returningAddressId: config.returning_address_id,
    defaultCargoCompanyId: config.default_cargo_company_id,
    currency: config.currency ?? TRENDYOL_CURRENCY,
    brandId: config.brand_id,
    brandName: config.brand_name,
    autoSync: config.auto_sync !== false,
    lastSyncAt: config.last_sync_at,
    webhookActive: !!config.webhook_id && !!config.webhook_secret,
    ordersSyncedAt: config.orders_synced_at,
    ready: trendyolReadinessError(config) === null,
    readinessError: trendyolReadinessError(config),
    categoryMap: config.category_map ?? {},
    counts: {
      listings: listings ?? 0, approved: approved ?? 0, rejected: rejected ?? 0,
      variants: variants ?? 0, queued: queued ?? 0, orders: orders ?? 0,
    },
  };
}

// ── Connect / disconnect ────────────────────────────────────────────────────────
export async function connectTrendyol(
  businessId: string,
  input: { supplierId: string; apiKey: string; apiSecret: string; environment: TrendyolEnvironment; company?: string },
): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  if (!trendyolGloballyEnabled()) return { error: "Integrarea Trendyol nu este disponibilă momentan." };

  const supplierId = (input.supplierId ?? "").trim();
  const apiKey = (input.apiKey ?? "").trim();
  const apiSecret = (input.apiSecret ?? "").trim();
  if (!supplierId || !apiKey || apiSecret.length < 8) {
    return { error: "Completează SupplierID, API Key și API Secret din panoul Trendyol." };
  }
  const env: TrendyolEnvironment = input.environment === "stage" ? "stage" : "production";
  const company = (input.company ?? "").trim() || undefined;

  const test = await testConnection({ supplierId, apiKey, apiSecret, environment: env, userAgentCompany: company });
  if (!test.ok) return { error: test.error };

  const prev = await loadConfig(g.supabase, businessId);
  const next: TrendyolConfig = {
    ...prev,
    connected: true,
    supplier_id: supplierId,
    api_key: apiKey,
    api_secret: apiSecret,
    environment: env,
    user_agent_company: company,
    needs_reconnect: false,
    currency: prev.currency ?? TRENDYOL_CURRENCY,
    auto_sync: prev.auto_sync ?? true,
  };
  const ok = await saveConfig(g.supabase, businessId, next);
  if (!ok) {
    logError({ action: "trendyol.connect", message: "saveConfig failed", details: { businessId }, businessId, userId: g.userId });
    return { error: "Eroare la salvarea conexiunii. Încearcă din nou." };
  }
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

export async function disconnectTrendyol(businessId: string): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  // Best-effort: remove the order webhook on Trendyol before we drop the credentials.
  const prev = await loadConfig(g.supabase, businessId);
  const prevAuth = authFromConfig(prev);
  if (prevAuth && prev.webhook_id) { try { await deleteWebhook(prevAuth, prev.webhook_id); } catch { /* ignore */ } }
  await saveConfig(g.supabase, businessId, {});
  const admin = createAdminClient();
  await admin.from("trendyol_sync_queue").delete().eq("business_id", businessId);
  await admin.from("trendyol_variants").delete().eq("business_id", businessId);
  await admin.from("trendyol_batches").delete().eq("business_id", businessId);
  await admin.from("trendyol_listings").delete().eq("business_id", businessId);
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

// ── Settings ────────────────────────────────────────────────────────────────────
export interface TrendyolSettingsInput {
  shipment_address_id?: number | null;
  returning_address_id?: number | null;
  default_cargo_company_id?: number | null;
  brand_id?: number | null;
  brand_name?: string | null;
  currency?: string;
  auto_sync?: boolean;
}

export async function saveTrendyolSettings(
  businessId: string, input: TrendyolSettingsInput,
): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const config = await loadConfig(g.supabase, businessId);

  const next: TrendyolConfig = {
    ...config,
    shipment_address_id: input.shipment_address_id === null ? undefined : (input.shipment_address_id ?? config.shipment_address_id),
    returning_address_id: input.returning_address_id === null ? undefined : (input.returning_address_id ?? config.returning_address_id),
    default_cargo_company_id: input.default_cargo_company_id === null ? undefined : (input.default_cargo_company_id ?? config.default_cargo_company_id),
    brand_id: input.brand_id === null ? undefined : (input.brand_id ?? config.brand_id),
    brand_name: input.brand_name === null ? undefined : (input.brand_name ?? config.brand_name),
    currency: input.currency?.trim() || config.currency || TRENDYOL_CURRENCY,
    auto_sync: input.auto_sync ?? config.auto_sync,
  };
  const ok = await saveConfig(g.supabase, businessId, next);
  if (!ok) return { error: "Eroare la salvare." };
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

// ── Order webhook (subscribe / unsubscribe) ─────────────────────────────────────
// Trendyol pushes order lifecycle events to /api/ty/webhook. We authenticate
// incoming calls with the API_KEY scheme: a random secret we register is echoed
// back in the x-api-key header. Re-subscribing is idempotent (any prior webhook on
// the same URL is deleted first, since Trendyol rejects duplicate URLs).
export async function subscribeTrendyolWebhook(businessId: string): Promise<{ success: true } | { error: string }> {
  const g = await guardedAuth(businessId);
  if ("error" in g) return g;

  const url = `${trendyolWebhookUrl()}?businessId=${encodeURIComponent(businessId)}`;
  const existing = await getWebhooks(g.auth);
  if (!isTrendyolError(existing)) {
    for (const w of existing.data ?? []) {
      if (w.id && (w.id === g.config.webhook_id || w.url === url)) await deleteWebhook(g.auth, w.id);
    }
  } else if (g.config.webhook_id) {
    await deleteWebhook(g.auth, g.config.webhook_id);
  }

  const secret = randomBytes(24).toString("hex");
  const res = await createWebhook(g.auth, {
    url, authenticationType: "API_KEY", apiKey: secret, subscribedStatuses: TRENDYOL_WEBHOOK_EVENTS,
  });
  if (isTrendyolError(res)) return { error: res.error };

  const next: TrendyolConfig = { ...g.config, webhook_id: res.data?.id ?? g.config.webhook_id, webhook_secret: secret };
  if (!(await saveConfig(g.supabase, businessId, next))) return { error: "Eroare la salvarea webhook-ului." };
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

export async function unsubscribeTrendyolWebhook(businessId: string): Promise<{ success: true } | { error: string }> {
  const g = await guardedAuth(businessId);
  if ("error" in g) return g;
  if (g.config.webhook_id) await deleteWebhook(g.auth, g.config.webhook_id);
  const next: TrendyolConfig = { ...g.config, webhook_id: undefined, webhook_secret: undefined };
  if (!(await saveConfig(g.supabase, businessId, next))) return { error: "Eroare la salvare." };
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

// ── Nomenclature (live from Trendyol) ───────────────────────────────────────────
function authFromConfig(config: TrendyolConfig): TrendyolAuth | null {
  if (!config.supplier_id || !config.api_key || !config.api_secret) return null;
  return {
    supplierId: config.supplier_id, apiKey: config.api_key, apiSecret: config.api_secret,
    environment: config.environment, userAgentCompany: config.user_agent_company,
  };
}
async function guardedAuth(
  businessId: string,
): Promise<{ supabase: ServerClient; userId: string; config: TrendyolConfig; auth: TrendyolAuth } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const config = await loadConfig(g.supabase, businessId);
  const auth = authFromConfig(config);
  if (!auth) return { error: "Conectează mai întâi contul Trendyol." };
  return { supabase: g.supabase, userId: g.userId, config, auth };
}

export async function searchTrendyolCategories(businessId: string, query: string): Promise<{ categories: { id: number; label: string }[] } | { error: string }> {
  const g = await guardedAuth(businessId);
  if ("error" in g) return g;
  const categories = await searchLeafCategories(g.auth, query);
  if (categories === null) return { error: "Nu am putut încărca categoriile Trendyol." };
  return { categories };
}
export async function getTrendyolCategoryAttributes(businessId: string, categoryId: number): Promise<{ attributes: TrendyolCategoryAttribute[] } | { error: string }> {
  const g = await guardedAuth(businessId);
  if ("error" in g) return g;
  const attributes = await getCategoryAttributesCached(g.auth, categoryId);
  if (attributes === null) return { error: "Nu am putut încărca atributele categoriei." };
  return { attributes };
}
export async function getTrendyolAttributeValues(businessId: string, categoryId: number, attributeId: number): Promise<{ values: { attributeValueId: number; attributeValue: string }[] } | { error: string }> {
  const g = await guardedAuth(businessId);
  if ("error" in g) return g;
  const values = await getCategoryAttributeValuesCached(g.auth, categoryId, attributeId);
  if (values === null) return { error: "Nu am putut încărca valorile atributului." };
  return { values };
}
export async function searchTrendyolBrands(businessId: string, query: string): Promise<{ brands: TrendyolBrand[] } | { error: string }> {
  const g = await guardedAuth(businessId);
  if ("error" in g) return g;
  const brands = await searchBrands(g.auth, query);
  if (brands === null) return { error: "Nu am putut căuta brandurile." };
  return { brands };
}
export async function getTrendyolAddresses(businessId: string): Promise<{ addresses: TrendyolSupplierAddress[] } | { error: string }> {
  const g = await guardedAuth(businessId);
  if ("error" in g) return g;
  const data = await getSupplierAddressesCached(g.auth, true);
  if (data === null) return { error: "Nu am putut încărca adresele Trendyol." };
  return { addresses: data.supplierAddresses ?? [] };
}

// ── Category mapping ────────────────────────────────────────────────────────────
export async function saveTrendyolCategoryMapEntry(
  businessId: string, edinioCategory: string, entry: TrendyolCategoryMapEntry | null,
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

// ── Per-product listing editor ──────────────────────────────────────────────────
export interface TrendyolEditorVariant {
  key: string; label: string; barcode: string; ron_price: number;
  stock_code: string | null; attributes: TrendyolProductAttribute[];
  quantity: number | null; list_price: number | null; sale_price: number | null; vat_rate: number | null; enabled: boolean;
}
export interface TrendyolEditorData {
  productName: string;
  category: string | null;
  images: string[];
  mappedCategoryId: number | null;
  mappedBrandId: number | null;
  listing: {
    brand_id: number | null; category_id: number | null; attributes: TrendyolProductAttribute[];
    dimensional_weight: number | null; cargo_company_id: number | null; status: string;
  } | null;
  variants: TrendyolEditorVariant[];
}
interface StoredVariantRow {
  barcode: string; stock_code: string | null; attributes: unknown; quantity: number | null;
  list_price: number | null; sale_price: number | null; vat_rate: number | null; enabled: boolean;
}

export async function getTrendyolListingEditor(businessId: string, productId: string): Promise<TrendyolEditorData | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const config = await loadConfig(g.supabase, businessId);

  const { data: product } = await g.supabase
    .from("products").select("id, name, category, images, price, compare_at_price, sku, page_sections")
    .eq("id", productId).eq("business_id", businessId).maybeSingle();
  if (!product) return { error: "Produs negăsit." };

  const slots = deriveVariantSlots(product as unknown as MappableProduct);

  const { data: listing } = await g.supabase
    .from("trendyol_listings")
    .select("id, brand_id, category_id, attributes, dimensional_weight, cargo_company_id, status")
    .eq("business_id", businessId).eq("product_id", productId).maybeSingle();

  let stored: StoredVariantRow[] = [];
  if (listing) {
    const { data: vs } = await g.supabase
      .from("trendyol_variants")
      .select("barcode, stock_code, attributes, quantity, list_price, sale_price, vat_rate, enabled")
      .eq("listing_id", (listing as { id: string }).id);
    stored = (vs ?? []) as StoredVariantRow[];
  }
  const byBarcode = new Map(stored.map((v) => [v.barcode, v]));

  const variants: TrendyolEditorVariant[] = slots.map((s) => {
    const ex = byBarcode.get(s.barcode);
    return {
      key: s.key, label: s.label, barcode: s.barcode, ron_price: s.ron_price,
      stock_code: ex?.stock_code ?? null,
      attributes: Array.isArray(ex?.attributes) ? (ex.attributes as unknown as TrendyolProductAttribute[]) : [],
      quantity: ex?.quantity ?? null, list_price: ex?.list_price ?? null, sale_price: ex?.sale_price ?? null,
      vat_rate: ex?.vat_rate ?? null, enabled: ex?.enabled ?? true,
    };
  });

  const entry = product.category ? config.category_map?.[product.category] : undefined;
  const l = listing as (Record<string, unknown> & { id: string }) | null;
  return {
    productName: product.name,
    category: product.category,
    images: Array.isArray(product.images) ? (product.images as unknown[]).map(String) : [],
    mappedCategoryId: entry?.category_id ?? null,
    mappedBrandId: entry?.brand_id ?? config.brand_id ?? null,
    listing: l ? {
      brand_id: (l.brand_id as number | null) ?? null,
      category_id: (l.category_id as number | null) ?? null,
      attributes: Array.isArray(l.attributes) ? (l.attributes as unknown as TrendyolProductAttribute[]) : [],
      dimensional_weight: (l.dimensional_weight as number | null) ?? null,
      cargo_company_id: (l.cargo_company_id as number | null) ?? null,
      status: (l.status as string) ?? "draft",
    } : null,
    variants,
  };
}

export interface TrendyolListingInput {
  brand_id: number | null;
  category_id: number | null;
  attributes: TrendyolProductAttribute[];
  dimensional_weight: number | null;
  cargo_company_id: number | null;
  variants: {
    barcode: string; stock_code: string | null; attributes: TrendyolProductAttribute[];
    quantity: number | null; list_price: number | null; sale_price: number | null; vat_rate: number | null; enabled: boolean;
  }[];
}

export async function saveTrendyolListing(
  businessId: string, productId: string, input: TrendyolListingInput,
): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const { data: product } = await g.supabase
    .from("products").select("id").eq("id", productId).eq("business_id", businessId).maybeSingle();
  if (!product) return { error: "Produs negăsit." };

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: up, error: upErr } = await admin.from("trendyol_listings").upsert(
    {
      business_id: businessId, product_id: productId, product_main_id: productId,
      brand_id: input.brand_id, category_id: input.category_id,
      attributes: (input.attributes as unknown) as never,
      dimensional_weight: input.dimensional_weight, cargo_company_id: input.cargo_company_id, updated_at: now,
    } as never,
    { onConflict: "business_id,product_main_id" },
  ).select("id").single();
  if (upErr || !up) return { error: "Eroare la salvarea listării." };
  const listingId = (up as { id: string }).id;

  // Guard against cross-product barcode clashes BEFORE deleting anything, so a
  // duplicate barcode never wipes a listing's variants.
  const rows = input.variants.filter((v) => v.barcode?.trim()).map((v) => ({
    listing_id: listingId, business_id: businessId, product_id: productId,
    barcode: v.barcode.trim(), stock_code: v.stock_code, attributes: (v.attributes as unknown) as never,
    quantity: v.quantity, list_price: v.list_price, sale_price: v.sale_price, vat_rate: v.vat_rate, enabled: v.enabled,
  }));
  // Barcode is Trendyol's cross-endpoint identifier (max 40): reject over-long ones
  // at save so create/inventory/order-match all use the exact same value.
  const tooLong = rows.find((r) => r.barcode.length > 40);
  if (tooLong) return { error: `Barcode-ul „${tooLong.barcode}" depășește 40 de caractere (limita Trendyol). Folosește un barcode mai scurt (ex. EAN).` };

  const newBarcodes = rows.map((r) => r.barcode);
  if (newBarcodes.length > 0) {
    const { data: clash } = await admin.from("trendyol_variants")
      .select("barcode, listing_id").eq("business_id", businessId).in("barcode", newBarcodes);
    const conflict = (clash ?? []).find((c) => (c as { listing_id: string }).listing_id !== listingId);
    if (conflict) return { error: `Barcode-ul „${(conflict as { barcode: string }).barcode}" este deja folosit de alt produs. Folosește barcode-uri unice.` };
  }
  await admin.from("trendyol_variants").delete().eq("listing_id", listingId);
  if (rows.length > 0) {
    const { error: vErr } = await admin.from("trendyol_variants").insert(rows as never);
    if (vErr) return { error: "Eroare la salvarea variantelor. Verifică barcode-urile duplicate." };
  }
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

// ── Push / remove ─────────────────────────────────────────────────────────────
async function withContext<T>(businessId: string, fn: (admin: ReturnType<typeof createAdminClient>, ctx: NonNullable<Awaited<ReturnType<typeof loadTrendyolContext>>>) => Promise<T>): Promise<T | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return { error: g.error };
  const admin = createAdminClient();
  const ctx = await loadTrendyolContext(admin, businessId);
  if (!ctx) return { error: "Conexiunea Trendyol nu este disponibilă. Reconectează contul." };
  return fn(admin, ctx);
}

export async function syncTrendyolProduct(businessId: string, productId: string): Promise<{ success: true } | { error: string }> {
  const res = await withContext(businessId, (admin, ctx) => syncProductNow(admin, ctx, productId));
  if ("error" in res) {
    logError({ action: "trendyol.sync", message: res.error, details: { businessId, productId }, businessId });
    return { error: res.error };
  }
  revalidatePath(FEATURE_PATH);
  revalidatePath("/dashboard/products");
  return { success: true };
}

export async function removeTrendyolListing(businessId: string, productId: string): Promise<{ success: true } | { error: string }> {
  const res = await withContext(businessId, (admin, ctx) => removeProductNow(admin, ctx, productId));
  if ("error" in res) return { error: res.error };
  revalidatePath(FEATURE_PATH);
  revalidatePath("/dashboard/products");
  return { success: true };
}

// ── Listings table ────────────────────────────────────────────────────────────────
export interface TrendyolListingRow {
  product_id: string | null;
  product_main_id: string;
  name: string;
  status: string;
  error: string | null;
  lastSyncedAt: string | null;
}

export async function getTrendyolListings(businessId: string): Promise<TrendyolListingRow[]> {
  const g = await guard(businessId);
  if ("error" in g) return [];
  const { data } = await g.supabase
    .from("trendyol_listings")
    .select("product_id, product_main_id, status, error, last_synced_at, products(name)")
    .eq("business_id", businessId)
    .order("updated_at", { ascending: false })
    .limit(200);

  return (data ?? []).map((r) => {
    const prod = r.products as { name?: string } | { name?: string }[] | null;
    const name = Array.isArray(prod) ? prod[0]?.name : prod?.name;
    return {
      product_id: r.product_id,
      product_main_id: r.product_main_id,
      name: name ?? "Produs",
      status: r.status,
      error: r.error,
      lastSyncedAt: r.last_synced_at,
    };
  });
}

// ── Fulfillment (Trendyol cargo) ────────────────────────────────────────────────
// Trendyol ships with its own contracted cargo; the seller only advances the
// package Picking -> Invoiced (no AWB to create). Read + the two transitions.
export async function getTrendyolOrderFulfillment(
  businessId: string, orderId: string,
): Promise<TrendyolFulfillmentState | null | { error: string }> {
  return withContext(businessId, (admin, ctx) => getFulfillmentState(admin, ctx, orderId));
}

export async function markTrendyolPicking(
  businessId: string, orderId: string,
): Promise<{ success: true; status: string } | { error: string }> {
  const res = await withContext(businessId, (admin, ctx) => setPackageStatus(admin, ctx, orderId, "Picking"));
  if ("error" in res) return { error: res.error };
  revalidatePath("/dashboard/orders");
  return { success: true, status: res.status };
}

export async function markTrendyolInvoiced(
  businessId: string, orderId: string, invoiceNumber?: string,
): Promise<{ success: true; status: string } | { error: string }> {
  const res = await withContext(businessId, (admin, ctx) => setPackageStatus(admin, ctx, orderId, "Invoiced", invoiceNumber?.trim() || undefined));
  if ("error" in res) return { error: res.error };
  revalidatePath("/dashboard/orders");
  return { success: true, status: res.status };
}
