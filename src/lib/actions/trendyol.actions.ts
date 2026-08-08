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
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { trendyolGloballyEnabled, maskSecret, trendyolWebhookUrl } from "@/lib/trendyol/auth";
import { createWebhook, deleteWebhook, getWebhooks, isTrendyolError, testConnection, type TrendyolAuth } from "@/lib/trendyol/client";
import { TRENDYOL_WEBHOOK_EVENTS } from "@/lib/trendyol/webhooks";
import {
  getCategoryAttributesCached, getCategoryAttributeValuesCached, getLeafCategoriesCached,
  getSupplierAddressesCached, searchBrands, searchLeafCategories,
} from "@/lib/trendyol/taxonomy";
import { indexeazaFrunze, potrivesteIndexat, type PotrivireCategorie } from "@/lib/trendyol/category-match";
import { sugereazaAtribute, type SugestieAtribut, type ValoriAtribut } from "@/lib/trendyol/attribute-autofill";
import { loadTrendyolContext, removeProductNow, syncProductNow, syncProductsBulk } from "@/lib/trendyol/sync";
import { setPackageStatus, sendTrackingNumber, getFulfillmentState, type TrendyolFulfillmentState } from "@/lib/trendyol/fulfillment";
import { deriveVariantSlots, verificaBarcode, type MappableProduct } from "@/lib/trendyol/mapping";
import type {
  TrendyolBrand, TrendyolCategoryAttribute, TrendyolCategoryMapEntry, TrendyolConfig,
  TrendyolEnvironment, TrendyolProductAttribute, TrendyolStoreFront, TrendyolSupplierAddress,
} from "@/lib/trendyol/types";
import {
  TRENDYOL_DEFAULT_STOREFRONT, TRENDYOL_STOREFRONTS, curieriVitrina, infoVitrina,
} from "@/lib/trendyol/types";

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
//
// Ce e cu adevarat obligatoriu ca sa poti lista: contul si brandul. Adresele sunt
// optionale in API (Trendyol foloseste implicitele contului), iar curierul se
// declara abia la expediere — cerute aici, blocau degeaba integrarea.
function trendyolReadinessError(config: TrendyolConfig): string | null {
  if (!config.connected || !config.api_key || !config.api_secret || !config.supplier_id) {
    return "Conectează mai întâi contul Trendyol (Seller ID + API Key + Secret).";
  }
  if (config.needs_reconnect) return "Sesiunea Trendyol a expirat. Reconectează contul.";
  return null;
}

// ── Status ────────────────────────────────────────────────────────────────────
export interface TrendyolStatus {
  globallyEnabled: boolean;
  connected: boolean;
  needsReconnect: boolean;
  environment: TrendyolEnvironment;
  storefront: TrendyolStoreFront;
  storefrontLabel: string;
  supplierId?: string;
  apiKeyMasked: string | null;
  sellerName?: string;
  shipmentAddressId?: number;
  returningAddressId?: number;
  defaultCarrierCode?: string;
  currency: string;
  brandId?: number;
  brandName?: string;
  autoSync: boolean;
  autoPublish: boolean;
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

  const vitrina = config.storefront ?? TRENDYOL_DEFAULT_STOREFRONT;
  const info = infoVitrina(vitrina);
  return {
    globallyEnabled: trendyolGloballyEnabled(),
    connected: !!config.connected && !!config.api_key && !!config.supplier_id,
    needsReconnect: config.needs_reconnect === true,
    environment: config.environment ?? "production",
    storefront: vitrina,
    storefrontLabel: info.tara,
    supplierId: config.supplier_id,
    apiKeyMasked: config.api_key ? maskSecret(config.api_key) : null,
    sellerName: config.seller_name,
    shipmentAddressId: config.shipment_address_id,
    returningAddressId: config.returning_address_id,
    defaultCarrierCode: config.default_carrier_code,
    // Moneda o dicteaza vitrina, nu noi: preturile trimise sunt citite in ea.
    currency: info.moneda,
    brandId: config.brand_id,
    brandName: config.brand_name,
    autoSync: config.auto_sync !== false,
    autoPublish: config.auto_publish === true,
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
  input: { supplierId: string; apiKey: string; apiSecret: string; environment: TrendyolEnvironment; storefront?: TrendyolStoreFront; company?: string },
): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  if (!trendyolGloballyEnabled()) return { error: "Integrarea Trendyol nu este disponibilă momentan." };

  const supplierId = (input.supplierId ?? "").trim();
  const apiKey = (input.apiKey ?? "").trim();
  const apiSecret = (input.apiSecret ?? "").trim();
  if (!supplierId || !apiKey || apiSecret.length < 8) {
    return { error: "Completează Seller ID, API Key și API Secret din panoul Trendyol." };
  }
  // Seller ID-ul e numeric si intra direct in calea cererii. Lipit din portal, vine
  // adesea cu spatii sau cu alt camp cu totul (codul de referinta al integrarii),
  // si atunci Trendyol raspunde „furnizor negasit" — eroare care pare a cheilor.
  if (!/^\d+$/.test(supplierId)) {
    return { error: "Seller ID trebuie să fie doar cifre. Îl găsești în panoul Trendyol, la Informații cont > Detalii integrare (nu este codul de referință al integrării)." };
  }
  const env: TrendyolEnvironment = input.environment === "stage" ? "stage" : "production";
  const vitrina: TrendyolStoreFront =
    TRENDYOL_STOREFRONTS.find((s) => s.code === input.storefront)?.code ?? TRENDYOL_DEFAULT_STOREFRONT;
  const company = (input.company ?? "").trim() || undefined;

  const test = await testConnection({ supplierId, apiKey, apiSecret, environment: env, storefront: vitrina, userAgentCompany: company });
  if (!test.ok) return { error: test.error };

  const prev = await loadConfig(g.supabase, businessId);
  const next: TrendyolConfig = {
    ...prev,
    connected: true,
    supplier_id: supplierId,
    api_key: apiKey,
    api_secret: apiSecret,
    environment: env,
    storefront: vitrina,
    user_agent_company: company,
    needs_reconnect: false,
    currency: infoVitrina(vitrina).moneda,
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
  default_carrier_code?: string | null;
  brand_id?: number | null;
  brand_name?: string | null;
  auto_sync?: boolean;
  auto_publish?: boolean;
}

export async function saveTrendyolSettings(
  businessId: string, input: TrendyolSettingsInput,
): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const config = await loadConfig(g.supabase, businessId);

  // Curierul trebuie sa existe si sa fie valabil pe vitrina magazinului; altfel
  // AWB-ul e respins abia la expediere, cand comerciantul are coletul in mana.
  let carrier = input.default_carrier_code === null ? undefined : (input.default_carrier_code ?? config.default_carrier_code);
  if (carrier) {
    const permis = curieriVitrina(config.storefront).some((c) => c.code === carrier);
    if (!permis) return { error: "Curierul ales nu este disponibil pe vitrina magazinului tău." };
  } else {
    carrier = undefined;
  }

  const next: TrendyolConfig = {
    ...config,
    shipment_address_id: input.shipment_address_id === null ? undefined : (input.shipment_address_id ?? config.shipment_address_id),
    returning_address_id: input.returning_address_id === null ? undefined : (input.returning_address_id ?? config.returning_address_id),
    default_carrier_code: carrier,
    brand_id: input.brand_id === null ? undefined : (input.brand_id ?? config.brand_id),
    brand_name: input.brand_name === null ? undefined : (input.brand_name ?? config.brand_name),
    currency: infoVitrina(config.storefront).moneda,
    auto_sync: input.auto_sync ?? config.auto_sync,
    auto_publish: input.auto_publish ?? config.auto_publish,
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
    // Fara tara, abonamentul prinde toate vitrinele contului; magazinul asculta
    // doar de a lui, ca sa nu importe comenzi din alta tara si alta moneda.
    countryCodes: [g.config.storefront ?? TRENDYOL_DEFAULT_STOREFRONT],
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
    environment: config.environment, storefront: config.storefront ?? TRENDYOL_DEFAULT_STOREFRONT,
    userAgentCompany: config.user_agent_company,
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
/**
 * Valorile propuse pentru atributele categoriei.
 *
 * Datele de conformitate (producător, importatori) sunt identice pe tot catalogul
 * și se iau din datele firmei; restul se deduc din produs, dar numai când sunt
 * fără echivoc. Vezi lib/trendyol/attribute-autofill.ts.
 */
export async function suggestTrendyolAttributes(
  businessId: string, productId: string, categoryId: number,
): Promise<{ sugestii: SugestieAtribut[] } | { error: string }> {
  const g = await guardedAuth(businessId);
  if ("error" in g) return g;

  const [{ data: product }, { data: biz }] = await Promise.all([
    g.supabase.from("products").select("name, description, page_sections, weight_grams")
      .eq("id", productId).eq("business_id", businessId).maybeSingle(),
    g.supabase.from("businesses").select("business_name, email, address, city, county, cui")
      .eq("id", businessId).maybeSingle(),
  ]);
  if (!product) return { error: "Produs negăsit." };

  const atribute = await getCategoryAttributesCached(g.auth, categoryId);
  if (atribute === null) return { error: "Nu am putut încărca atributele categoriei." };

  // Valorile se iau doar pentru atributele cu listă; la cele libere nu există ce cere.
  const valori: ValoriAtribut = {};
  for (const a of atribute.slice(0, 20)) {
    if (a.allowCustom && (!a.attributeValues || a.attributeValues.length === 0)) continue;
    const v = await getCategoryAttributeValuesCached(g.auth, categoryId, a.attribute.id);
    if (v) valori[a.attribute.id] = v;
  }

  const b = (biz ?? {}) as { business_name?: string; email?: string | null; address?: string | null; city?: string | null; county?: string | null; cui?: string | null };
  const google = ((product.page_sections as { google?: { gtin?: string; brand?: string } } | null)?.google) ?? {};
  return {
    sugestii: sugereazaAtribute(atribute, valori, {
      nume: b.business_name ?? "",
      email: b.email ?? null,
      adresa: b.address ?? null,
      oras: b.city ?? null,
      judet: b.county ?? null,
      cui: b.cui ?? null,
      tara: "România",
    }, {
      nume: product.name,
      descriere: product.description,
      brand: google.brand?.trim() || null,
      gtin: google.gtin?.trim() || null,
      weightGrams: product.weight_grams,
    }),
  };
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

// ── Mapare automată a categoriilor ──────────────────────────────────────────────
// Propune, nu aplica. Comerciantul vede fiecare potrivire, cu increderea ei si cu
// alternativele, si bifeaza ce vrea. Vezi lib/trendyol/category-match.ts pentru de
// ce increderea „sigura" cere si scor mare, si distanta fata de urmatoarea varianta.

// Cate categorii procesam intr-o rulare; peste atat, comerciantul le ia in transe.
// Nu e exportat: un fisier "use server" are voie sa exporte doar functii async.
const MAX_CATEGORII_MAPARE = 300;

export interface TrendyolMapSuggestion {
  edinioCategory: string;
  /** Prima varianta si urmatoarele doua, in ordinea increderii. */
  optiuni: PotrivireCategorie[];
  /** Maparea existenta, daca e deja mapata (o aratam ca sa nu se piarda din greseala). */
  existent: { category_id: number; label: string } | null;
}

export async function suggestTrendyolCategoryMap(
  businessId: string, categories: string[],
): Promise<{ sugestii: TrendyolMapSuggestion[]; totalFrunze: number } | { error: string }> {
  const g = await guardedAuth(businessId);
  if ("error" in g) return g;

  const frunze = await getLeafCategoriesCached(g.auth);
  if (frunze === null) return { error: "Nu am putut încărca lista de categorii Trendyol. Încearcă din nou." };
  if (frunze.length === 0) return { error: "Trendyol nu a returnat nicio categorie pentru vitrina aleasă." };

  // Indexul se construieste O SINGURA data pentru toate categoriile magazinului:
  // catalogul lor are mii de frunze, iar tokenizarea repetata ar fi facut din
  // butonul asta o asteptare de zeci de secunde.
  const index = indexeazaFrunze(frunze);
  const map = g.config.category_map ?? {};
  const sugestii = categories.slice(0, MAX_CATEGORII_MAPARE).map((cat) => ({
    edinioCategory: cat,
    optiuni: potrivesteIndexat(cat, index),
    existent: map[cat] ? { category_id: map[cat].category_id, label: map[cat].label } : null,
  }));
  return { sugestii, totalFrunze: frunze.length };
}

export async function applyTrendyolCategoryMap(
  businessId: string, intrari: { edinioCategory: string; category_id: number; label: string }[],
): Promise<{ success: true; aplicate: number } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  if (intrari.length === 0) return { error: "Nu ai selectat nicio mapare." };

  const config = await loadConfig(g.supabase, businessId);
  const map = { ...(config.category_map ?? {}) };
  let aplicate = 0;
  for (const intrare of intrari) {
    const cat = (intrare.edinioCategory ?? "").trim();
    if (!cat || !Number.isInteger(intrare.category_id) || intrare.category_id <= 0) continue;
    // Brandul si atributele deja alese pe categoria asta raman: schimbam doar
    // categoria Trendyol, nu si munca facuta manual peste ea.
    const prev = map[cat];
    map[cat] = { category_id: intrare.category_id, label: intrare.label, brand_id: prev?.brand_id, attributes: prev?.attributes };
    aplicate++;
  }
  if (aplicate === 0) return { error: "Nicio mapare validă." };
  if (!(await saveConfig(g.supabase, businessId, { ...config, category_map: map }))) {
    return { error: "Eroare la salvarea mapărilor." };
  }
  revalidatePath(FEATURE_PATH);
  return { success: true, aplicate };
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
  mappedBrandName: string | null;
  /** Marca din atributele Google ale produsului, pentru alegerea automata a brandului. */
  productBrand: string | null;
  /** Valorile salvate ca implicite pentru categoria produsului. */
  mappedAttributes: TrendyolProductAttribute[];
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
    // Fara nume, editorul afisa „#2969976" in campul de brand.
    mappedBrandName: entry?.brand_name ?? (entry?.brand_id ? null : config.brand_name) ?? null,
    productBrand: ((product.page_sections as { google?: { brand?: string } } | null)?.google?.brand ?? "").trim() || null,
    mappedAttributes: entry?.attributes ?? [],
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
  /** Ridica brandul si atributele ca implicite pentru categoria produsului. */
  save_as_category_defaults?: boolean;
  brand_name?: string | null;
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
  // Barcode is Trendyol's cross-endpoint identifier (create, inventory, order match):
  // validate here so the merchant sees the problem while editing, not hours later in
  // a batch result that only names the barcode.
  for (const r of rows) {
    const problema = verificaBarcode(r.barcode);
    if (problema) return { error: problema };
  }

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

  // „Salvează ca implicite": munca facuta pe primul produs dintr-o categorie se
  // aplica de la sine pe urmatoarele. Explicit, nu automat — unele atribute chiar
  // sunt specifice produsului (ingrediente, volum).
  if (input.save_as_category_defaults) {
    const { data: prod } = await g.supabase
      .from("products").select("category").eq("id", productId).eq("business_id", businessId).maybeSingle();
    const cat = (prod as { category: string | null } | null)?.category;
    if (cat) {
      const config = await loadConfig(g.supabase, businessId);
      const map = { ...(config.category_map ?? {}) };
      const prev = map[cat];
      if (prev) {
        map[cat] = {
          ...prev,
          brand_id: input.brand_id ?? prev.brand_id,
          brand_name: input.brand_name ?? prev.brand_name,
          attributes: input.attributes,
        };
        await saveConfig(g.supabase, businessId, { ...config, category_map: map });
      }
    }
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

/**
 * „Publică pe Trendyol" din pagina produsului.
 *
 * Butonul echivalent pentru OLX publică dintr-un click, așa că și acesta trebuie
 * să funcționeze fără o trecere prealabilă prin ecranul de listare: dacă produsul
 * n-are încă o configurare Trendyol, i-o construim din maparea categoriei
 * (categorie + brand) și din variantele produsului, apoi trimitem.
 *
 * Când lipsește ceva ce nu putem deduce, spunem exact ce și de unde se rezolvă —
 * o eroare de tipul „produsul nu are configurare" ar fi o fundătură.
 */
export async function publishTrendyolProduct(
  businessId: string, productId: string,
): Promise<{ success: true; creatAcum: boolean } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const config = await loadConfig(g.supabase, businessId);
  const gata = trendyolReadinessError(config);
  if (gata) return { error: gata };

  const { data: product } = await g.supabase
    .from("products").select("id, name, category, price, sku, page_sections, is_active")
    .eq("id", productId).eq("business_id", businessId).maybeSingle();
  if (!product) return { error: "Produs negăsit." };
  if ((product as { is_active?: boolean }).is_active === false) {
    return { error: "Produsul este inactiv. Activează-l înainte să îl publici pe Trendyol." };
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("trendyol_listings").select("id").eq("business_id", businessId).eq("product_id", productId).maybeSingle();

  let creatAcum = false;
  if (!existing) {
    const entry = product.category ? config.category_map?.[product.category] : undefined;
    if (!entry?.category_id) {
      return {
        error: product.category
          ? `Categoria „${product.category}" nu este mapată la Trendyol. Mapeaz-o în Integrări > Trendyol (poți folosi maparea automată).`
          : "Produsul nu are categorie. Alege una și mapeaz-o la Trendyol.",
      };
    }
    const brandId = entry.brand_id ?? config.brand_id;
    if (!brandId) {
      return { error: "Alege brandul Trendyol pentru această categorie, în Integrări > Trendyol." };
    }

    const slots = deriveVariantSlots(product as unknown as MappableProduct);
    for (const s of slots) {
      const problema = verificaBarcode(s.barcode.trim());
      if (problema) return { error: problema };
    }

    const now = new Date().toISOString();
    const { data: up, error: upErr } = await admin.from("trendyol_listings").upsert(
      {
        business_id: businessId, product_id: productId, product_main_id: productId,
        brand_id: brandId, category_id: entry.category_id,
        attributes: ((entry.attributes ?? []) as unknown) as never,
        dimensional_weight: null, cargo_company_id: null, updated_at: now,
      } as never,
      { onConflict: "business_id,product_main_id" },
    ).select("id").single();
    if (upErr || !up) return { error: "Eroare la pregătirea listării." };
    const listingId = (up as { id: string }).id;

    const rows = slots.map((s) => ({
      listing_id: listingId, business_id: businessId, product_id: productId,
      barcode: s.barcode.trim(), stock_code: null, attributes: [] as unknown as never,
      quantity: null, list_price: null, sale_price: null, vat_rate: null, enabled: true,
    }));
    // Acelasi barcode nu poate sta la doua produse: Trendyol l-ar suprascrie pe primul.
    const { data: clash } = await admin.from("trendyol_variants")
      .select("barcode, listing_id").eq("business_id", businessId).in("barcode", rows.map((r) => r.barcode));
    const conflict = (clash ?? []).find((c) => (c as { listing_id: string }).listing_id !== listingId);
    if (conflict) {
      return { error: `Barcode-ul „${(conflict as { barcode: string }).barcode}" este deja folosit de alt produs. Schimbă SKU-ul sau completează manual listarea.` };
    }
    await admin.from("trendyol_variants").delete().eq("listing_id", listingId);
    if (rows.length > 0) await admin.from("trendyol_variants").insert(rows as never);
    creatAcum = true;
  }

  const ctx = await loadTrendyolContext(admin, businessId);
  if (!ctx) return { error: "Conexiunea Trendyol nu este disponibilă. Reconectează contul." };
  const res = await syncProductNow(admin, ctx, productId);
  if (!res.ok) {
    logError({ action: "trendyol.publish", message: res.error, details: { businessId, productId }, businessId });
    return { error: res.error };
  }
  revalidatePath(FEATURE_PATH);
  revalidatePath("/dashboard/products");
  return { success: true, creatAcum };
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

// ── Lista de produse (căutare + filtre + paginare) ──────────────────────────────
// Un magazin cu mii de produse nu poate fi servit ca listă întreagă: pagina ar
// cădea, iar comerciantul tot n-ar găsi produsul căutat. Totul se face pe server;
// numărătorile sunt exacte, iar când o parcurgere atinge plafonul o spunem în loc
// să lăsăm impresia că atât există.

const TRENDYOL_PAGE_SIZE = 25;
// Cate produse trimitem intr-o apasare. Clientul imparte selectia in transe si
// arata progresul: o singura actiune cu mii de produse ar depasi timpul functiei.
const MAX_TRANSA = 100;
// Plafonul pentru „selecteaza toate cele N".
const MAX_SELECTIE = 2000;
/** Plafon de parcurgere pentru filtrul „nelistate" (fara echivalent SQL direct). */
const MAX_PARCURGERE = 5000;

export type TrendyolProductStatusFilter =
  | "toate" | "listate" | "nelistate" | "eroare" | "in_asteptare" | "aprobate";

export interface TrendyolProductFilters {
  q?: string;
  category?: string;
  status?: TrendyolProductStatusFilter;
  page?: number;
}

export interface TrendyolProductRow {
  id: string;
  name: string;
  category: string | null;
  is_active: boolean;
  status: string | null;
  error: string | null;
  lastSyncedAt: string | null;
}

export interface TrendyolProductPage {
  items: TrendyolProductRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** Am atins plafonul de parcurgere: `total` e un minim, nu totalul real. */
  truncat: boolean;
}

const STATUSURI_FILTRU: Record<string, string[]> = {
  eroare: ["error", "rejected"],
  in_asteptare: ["pending", "created", "draft"],
  aprobate: ["approved", "active"],
};

interface ProdusBrut { id: string; name: string; category: string | null; is_active: boolean }

export async function getTrendyolProductPage(
  businessId: string, filters: TrendyolProductFilters = {},
): Promise<TrendyolProductPage | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const { supabase } = g;

  const q = (filters.q ?? "").trim();
  const categorie = (filters.category ?? "").trim();
  const status: TrendyolProductStatusFilter = filters.status ?? "toate";
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const pageSize = TRENDYOL_PAGE_SIZE;

  // Listarile sunt doar cate produse a configurat comerciantul, deci se pot tine
  // in memorie fara grija; produsele nu.
  const listari = await fetchAllRows<{ product_id: string | null; status: string; error: string | null; last_synced_at: string | null }>(
    "trendyol.listings", (from, to) =>
      supabase.from("trendyol_listings").select("product_id, status, error, last_synced_at")
        .eq("business_id", businessId).order("product_id").range(from, to),
  );
  const dupaProdus = new Map(listari.filter((l) => l.product_id).map((l) => [l.product_id as string, l]));

  // `%`, `_` si `\` sunt metacaractere de LIKE: cine cauta „50%" ar primi altfel
  // tot catalogul.
  const tipar = q ? `%${q.replace(/[%_\\]/g, (m) => "\\" + m)}%` : null;

  const randuri = (produse: ProdusBrut[]): TrendyolProductRow[] =>
    produse.map((p) => {
      const l = dupaProdus.get(p.id);
      return {
        id: p.id, name: p.name, category: p.category, is_active: p.is_active,
        status: l?.status ?? null, error: l?.error ?? null, lastSyncedAt: l?.last_synced_at ?? null,
      };
    });

  // ── Fără filtru de stare: numărătoarea o face baza, exact ──────────────────
  if (status === "toate") {
    const de_la = (page - 1) * pageSize;
    let qb = supabase.from("products").select("id, name, category, is_active", { count: "exact" })
      .eq("business_id", businessId);
    if (tipar) qb = qb.ilike("name", tipar);
    if (categorie) qb = qb.eq("category", categorie);
    const { data, count } = await qb.order("name").order("id").range(de_la, de_la + pageSize - 1);
    const total = count ?? 0;
    return {
      items: randuri((data ?? []) as ProdusBrut[]),
      total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)), truncat: false,
    };
  }

  // ── Stări care presupun o listare: pornim de la listări, nu de la produse ──
  if (status !== "nelistate") {
    const permise = STATUSURI_FILTRU[status];
    const ids = listari
      .filter((l) => l.product_id && (status === "listate" || permise?.includes(l.status)))
      .map((l) => l.product_id as string);
    if (ids.length === 0) return { items: [], total: 0, page, pageSize, totalPages: 1, truncat: false };

    // Pe bucati: id-urile intra in URL-ul cererii, iar o mie de uuid-uri deodata
    // ar depasi lungimea acceptata si ar da 414.
    const gasite: ProdusBrut[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      let qb = supabase.from("products").select("id, name, category, is_active")
        .eq("business_id", businessId).in("id", ids.slice(i, i + 200));
      if (tipar) qb = qb.ilike("name", tipar);
      if (categorie) qb = qb.eq("category", categorie);
      const { data } = await qb.order("name").order("id");
      gasite.push(...((data ?? []) as ProdusBrut[]));
    }
    gasite.sort((a, b) => a.name.localeCompare(b.name, "ro"));
    const de_la = (page - 1) * pageSize;
    return {
      items: randuri(gasite.slice(de_la, de_la + pageSize)),
      total: gasite.length, page, pageSize,
      totalPages: Math.max(1, Math.ceil(gasite.length / pageSize)), truncat: false,
    };
  }

  // ── „Nelistate": diferenta dintre produse si listări ───────────────────────
  const nelistate: ProdusBrut[] = [];
  let truncat = false;
  for (let from = 0; from < MAX_PARCURGERE; from += 1000) {
    let qb = supabase.from("products").select("id, name, category, is_active")
      .eq("business_id", businessId);
    if (tipar) qb = qb.ilike("name", tipar);
    if (categorie) qb = qb.eq("category", categorie);
    const { data } = await qb.order("name").order("id").range(from, from + 999);
    const lot = (data ?? []) as ProdusBrut[];
    nelistate.push(...lot.filter((p) => !dupaProdus.has(p.id)));
    if (lot.length < 1000) break;
    if (from + 1000 >= MAX_PARCURGERE) truncat = true;
  }
  const de_la = (page - 1) * pageSize;
  return {
    items: randuri(nelistate.slice(de_la, de_la + pageSize)),
    total: nelistate.length, page, pageSize,
    totalPages: Math.max(1, Math.ceil(nelistate.length / pageSize)), truncat,
  };
}

/**
 * Toate id-urile care se potrivesc filtrelor, pentru „selectează tot".
 *
 * Separată de pagină fiindcă selecția „toate cele N" nu are voie să depindă de ce
 * s-a întâmplat să fie afișat. Plafonată: peste atât, comerciantul le ia în tranșe.
 */
export async function getTrendyolProductIds(
  businessId: string, filters: TrendyolProductFilters = {},
): Promise<{ ids: string[]; truncat: boolean } | { error: string }> {
  const strans: string[] = [];
  let truncat = false;
  for (let page = 1; page <= Math.ceil(MAX_SELECTIE / TRENDYOL_PAGE_SIZE); page++) {
    const res = await getTrendyolProductPage(businessId, { ...filters, page });
    if ("error" in res) return res;
    strans.push(...res.items.map((i) => i.id));
    if (page >= res.totalPages) break;
    if (strans.length >= MAX_SELECTIE) { truncat = true; break; }
  }
  return { ids: strans.slice(0, MAX_SELECTIE), truncat };
}

/**
 * Trimite mai multe produse deodată pe Trendyol.
 *
 * Articolele întregii tranșe pleacă într-o singură cerere de creare (serviciul lor
 * acceptă până la 1000), nu una pe produs. Produsele care nu se pot construi —
 * categorie nemapată, fără brand, barcode invalid — sunt raportate individual, ca
 * să nu pice toată tranșa din cauza unuia.
 */
export async function bulkPublishTrendyol(
  businessId: string, productIds: string[],
): Promise<{ submitted: number; failed: number; errors: { product: string; message: string }[] } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const config = await loadConfig(g.supabase, businessId);
  const gata = trendyolReadinessError(config);
  if (gata) return { error: gata };

  const ids = [...new Set((productIds ?? []).filter(Boolean))].slice(0, MAX_TRANSA);
  if (ids.length === 0) return { error: "Niciun produs selectat." };

  const admin = createAdminClient();
  const ctx = await loadTrendyolContext(admin, businessId);
  if (!ctx) return { error: "Conexiunea Trendyol nu este disponibilă. Reconectează contul." };

  const res = await syncProductsBulk(admin, ctx, ids);

  /*
   * MOTIVELE se scriu in log, nu doar numerele.
   *
   * Pana acum se inregistra `submitted=0 failed=25` si atat. Cele mai multe
   * produse pica INAINTE de trimitere (categorie nemapata, fara brand, barcode
   * invalid), deci nu apuca sa aiba nici macar un rand in `trendyol_listings` —
   * adica motivul exista doar in raspunsul catre interfata si dispare in clipa in
   * care comerciantul inchide pagina. Verificat pe productie: 52 de esecuri in
   * trei rulari, din care DOUA au lasat vreo urma.
   *
   * Se grupeaza dupa mesaj, nu se scriu toate: douazeci si cinci de produse pica
   * de obicei din acelasi motiv, iar o lista de douazeci si cinci de randuri
   * identice ascunde tocmai asta. Se pastreaza si un exemplu de produs pentru
   * fiecare motiv, ca sa se poata deschide unul si vedea.
   *
   * `warning` cand a picat ceva, `info` cand a mers tot: un esec tacut la
   * severitatea `info` nu se vede in /admin/logs printre rularile reusite.
   */
  const peMotiv = new Map<string, { nr: number; exemplu: string }>();
  for (const e of res.errors) {
    const cheie = e.message.slice(0, 200);
    const intrare = peMotiv.get(cheie);
    if (intrare) intrare.nr++;
    else peMotiv.set(cheie, { nr: 1, exemplu: e.product });
  }
  logError({
    action: "trendyol.bulkPublish",
    message: `submitted=${res.submitted} failed=${res.failed}`,
    details: {
      businessId,
      cerute: ids.length,
      motive: [...peMotiv.entries()]
        .sort((a, b) => b[1].nr - a[1].nr)
        .slice(0, 10)
        .map(([mesaj, v]) => ({ mesaj, produse: v.nr, exemplu: v.exemplu })),
    },
    businessId, userId: g.userId,
    severity: res.failed > 0 ? "warning" : "info",
  });
  revalidatePath(FEATURE_PATH);
  revalidatePath("/dashboard/products");
  return { submitted: res.submitted, failed: res.failed, errors: res.errors.slice(0, 20) };
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

/**
 * Trimite catre Trendyol AWB-ul facut cu curierul propriu.
 *
 * Necesar pentru curierii pe care ii plateste vanzatorul (DPD, DHL, GLS,
 * PACKETA): fara numar, coletul ramane blocat in „Picking" la Trendyol, oricat
 * de repede l-ar preda comerciantul.
 */
export async function sendTrendyolTracking(
  businessId: string, orderId: string,
  input: { trackingNumber: string; providerCode: string; returnTrackingNumber?: string },
): Promise<{ success: true } | { error: string }> {
  const res = await withContext(businessId, (admin, ctx) => sendTrackingNumber(admin, ctx, orderId, input));
  if ("error" in res) return { error: res.error };
  revalidatePath("/dashboard/orders");
  return { success: true };
}
