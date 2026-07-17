"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { logError } from "@/lib/error-logger";
import {
  buildAuthUrl, ensureMerchantToken, olxConfigured, signState,
} from "@/lib/olx/oauth";
import {
  advertCommand, getAccountBalance, getAdvert, getAvailablePackets, getBoughtPackets,
  getPaidFeatures, getPaymentMethods, getThreadMessages, getThreads, getUser, isOlxError,
  markThreadRead, postThreadMessage, purchaseAdvertPacket, purchaseCategoryPacket, purchasePaidFeature,
} from "@/lib/olx/client";
import {
  getOlxCategoriesCached, getOlxCategoryAttributesCached, getOlxCityDistrictsCached,
  searchOlxCities, suggestOlxCategoriesCached,
} from "@/lib/olx/categories";
import { loadOlxContext, syncProductNow, deactivateProductNow, activateProductNow, deleteAdvertNow } from "@/lib/olx/sync";
import { olxReadinessError } from "@/lib/olx/mapping";
import type {
  OlxAttributeDef, OlxBoughtPacket, OlxCategory, OlxCategoryMapEntry, OlxCategorySuggestion,
  OlxCity, OlxConfig, OlxDistrict, OlxMessage, OlxPacket, OlxPaidFeature, OlxPaymentMethod, OlxThread,
} from "@/lib/olx/types";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

interface OwnBiz {
  id: string; slug: string; custom_domain: string | null; store_name: string | null; business_name: string;
}

async function ownedBusiness(supabase: ServerClient, businessId: string, userId: string): Promise<OwnBiz | null> {
  const { data } = await supabase
    .from("businesses")
    .select("id, slug, custom_domain, store_name, business_name")
    .eq("id", businessId).eq("user_id", userId).single();
  return (data as OwnBiz) ?? null;
}

async function loadConfig(supabase: ServerClient, businessId: string): Promise<OlxConfig> {
  const { data } = await supabase
    .from("store_settings").select("olx_config").eq("business_id", businessId).single();
  return ((data?.olx_config as OlxConfig) ?? {}) || {};
}

async function saveConfig(supabase: ServerClient, businessId: string, config: OlxConfig): Promise<boolean> {
  const { data: existing } = await supabase
    .from("store_settings").select("id").eq("business_id", businessId).single();
  if (existing) {
    const { error } = await supabase.from("store_settings")
      .update({ olx_config: config as never, updated_at: new Date().toISOString() })
      .eq("business_id", businessId);
    return !error;
  }
  const { error } = await supabase.from("store_settings")
    .insert({ business_id: businessId, olx_config: config as never });
  return !error;
}

// Auth guard shared by every action: returns the owned business or an error.
async function guard(businessId: string): Promise<{ supabase: ServerClient; userId: string; biz: OwnBiz } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  const biz = await ownedBusiness(supabase, businessId, user.id);
  if (!biz) return { error: "Magazin negasit" };
  return { supabase, userId: user.id, biz };
}

const FEATURE_PATH = "/dashboard/features/olx";

// ── Status (dashboard) ────────────────────────────────────────────────────────────
export interface OlxStatus {
  configured: boolean;
  connected: boolean;
  needsReconnect: boolean;
  olxUserName?: string;
  advertiserType: "private" | "business";
  cityId?: number;
  cityName?: string;
  districtId?: number;
  districtName?: string;
  contactName?: string;
  contactPhone?: string;
  courierEnabled: boolean;
  autoSync: boolean;
  autoExtend: boolean;
  lastSyncAt?: string;
  categoryMap: Record<string, OlxCategoryMapEntry>;
  ready: boolean;
  readinessError: string | null;
  counts: { total: number; published: number; active: number; pending: number; limited: number; rejected: number; queued: number };
}

export async function getOlxStatus(businessId: string): Promise<OlxStatus | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const { supabase } = g;
  const config = await loadConfig(supabase, businessId);

  // Count-only queries (exact at any volume; avoids the 1000-row PostgREST cap).
  const rejectedStatuses = ["moderated", "blocked", "disabled", "removed_by_moderator", "error"];
  const [{ count: total }, { count: published }, { count: active }, { count: pending }, { count: limited }, { count: rejected }, { count: queued }] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("is_active", true),
    supabase.from("olx_adverts").select("id", { count: "exact", head: true }).eq("business_id", businessId),
    supabase.from("olx_adverts").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("status", "active"),
    supabase.from("olx_adverts").select("id", { count: "exact", head: true }).eq("business_id", businessId).in("status", ["new", "unconfirmed", "unpaid"]),
    supabase.from("olx_adverts").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("status", "limited"),
    supabase.from("olx_adverts").select("id", { count: "exact", head: true }).eq("business_id", businessId).in("status", rejectedStatuses),
    supabase.from("olx_sync_queue").select("id", { count: "exact", head: true }).eq("business_id", businessId),
  ]);

  return {
    configured: olxConfigured(),
    connected: !!config.connected && !!config.refresh_token,
    needsReconnect: config.needs_reconnect === true,
    olxUserName: config.olx_user_name,
    advertiserType: config.advertiser_type ?? "private",
    cityId: config.default_city_id,
    cityName: config.default_city_name,
    districtId: config.default_district_id,
    districtName: config.default_district_name,
    contactName: config.contact_name,
    contactPhone: config.contact_phone,
    courierEnabled: config.courier_enabled === true,
    autoSync: config.auto_sync !== false,
    autoExtend: config.auto_extend === true,
    lastSyncAt: config.last_sync_at,
    categoryMap: config.category_map ?? {},
    ready: olxReadinessError(config) === null,
    readinessError: olxReadinessError(config),
    counts: {
      total: total ?? 0, published: published ?? 0, active: active ?? 0,
      pending: pending ?? 0, limited: limited ?? 0, rejected: rejected ?? 0, queued: queued ?? 0,
    },
  };
}

// ── OAuth ───────────────────────────────────────────────────────────────────────
export async function startOlxOAuth(businessId: string): Promise<{ url: string } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  if (!olxConfigured()) return { error: "Integrarea OLX nu este configurata pe server." };
  return { url: buildAuthUrl(signState(businessId)) };
}

export async function disconnectOlx(businessId: string): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const { supabase } = g;
  await saveConfig(supabase, businessId, {});
  const admin = createAdminClient();
  await admin.from("olx_adverts").delete().eq("business_id", businessId);
  await admin.from("olx_sync_queue").delete().eq("business_id", businessId);
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

// ── Settings ────────────────────────────────────────────────────────────────────
export interface OlxSettingsInput {
  advertiser_type?: "private" | "business";
  city_id?: number;
  city_name?: string;
  district_id?: number | null;
  district_name?: string | null;
  contact_name?: string;
  contact_phone?: string;
  courier_enabled?: boolean;
  auto_sync?: boolean;
  auto_extend?: boolean;
}

export async function saveOlxSettings(businessId: string, input: OlxSettingsInput): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const { supabase } = g;
  const config = await loadConfig(supabase, businessId);

  const next: OlxConfig = {
    ...config,
    advertiser_type: input.advertiser_type ?? config.advertiser_type ?? "private",
    default_city_id: input.city_id ?? config.default_city_id,
    default_city_name: input.city_name ?? config.default_city_name,
    default_district_id: input.district_id === null ? undefined : (input.district_id ?? config.default_district_id),
    default_district_name: input.district_id === null ? undefined : (input.district_name ?? config.default_district_name),
    contact_name: input.contact_name?.trim() ?? config.contact_name,
    contact_phone: input.contact_phone?.trim() ?? config.contact_phone,
    courier_enabled: input.courier_enabled ?? config.courier_enabled,
    auto_sync: input.auto_sync ?? config.auto_sync,
    auto_extend: input.auto_extend ?? config.auto_extend,
  };
  const ok = await saveConfig(supabase, businessId, next);
  if (!ok) return { error: "Eroare la salvare." };
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

// ── Location pickers ──────────────────────────────────────────────────────────────
export async function searchCities(businessId: string, q: string): Promise<{ cities: OlxCity[] } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const cities = await searchOlxCities(q);
  if (cities === null) return { error: "Nu am putut incarca localitatile OLX. Reincearca." };
  return { cities };
}

export async function getCityDistricts(businessId: string, cityId: number): Promise<{ districts: OlxDistrict[] } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const districts = await getOlxCityDistrictsCached(cityId);
  if (districts === null) return { error: "Nu am putut incarca cartierele." };
  return { districts };
}

// ── Category mapping ──────────────────────────────────────────────────────────────
export async function getOlxCategoryChildren(businessId: string, parentId?: number): Promise<{ categories: OlxCategory[] } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const categories = await getOlxCategoriesCached(parentId);
  if (categories === null) return { error: "Nu am putut incarca categoriile OLX." };
  return { categories };
}

export async function suggestOlxCategory(businessId: string, q: string): Promise<{ suggestions: OlxCategorySuggestion[] } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const suggestions = await suggestOlxCategoriesCached(q);
  if (suggestions === null) return { error: "Nu am putut obtine sugestii." };
  return { suggestions };
}

export async function getOlxCategoryAttributes(businessId: string, categoryId: number): Promise<{ attributes: OlxAttributeDef[] } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const attributes = await getOlxCategoryAttributesCached(categoryId);
  if (attributes === null) return { error: "Nu am putut incarca atributele categoriei." };
  return { attributes };
}

// Save/replace the mapping for one Edinio category.
export async function saveOlxCategoryMapEntry(
  businessId: string, edinioCategory: string, entry: OlxCategoryMapEntry | null,
): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const { supabase } = g;
  const config = await loadConfig(supabase, businessId);
  const map = { ...(config.category_map ?? {}) };
  if (entry === null) delete map[edinioCategory];
  else map[edinioCategory] = entry;
  const ok = await saveConfig(supabase, businessId, { ...config, category_map: map });
  if (!ok) return { error: "Eroare la salvare." };
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

// ── Publishing ────────────────────────────────────────────────────────────────────
export async function publishOlxProduct(businessId: string, productId: string): Promise<{ success: true; status?: string; url?: string | null } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const config = await loadConfig(g.supabase, businessId);
  const readiness = olxReadinessError(config);
  if (readiness) return { error: readiness };

  const admin = createAdminClient();
  const ctx = await loadOlxContext(admin, businessId);
  if (!ctx) return { error: "Conexiunea OLX nu este disponibila. Reconecteaza contul." };

  const res = await syncProductNow(admin, ctx, businessId, productId);
  if (!res.ok) {
    logError({ action: "olx.publishProduct", message: res.error, details: { businessId, productId }, businessId, userId: g.userId });
    return { error: res.error };
  }
  revalidatePath(FEATURE_PATH);
  return { success: true, status: res.status, url: res.url ?? null };
}

export async function deactivateOlxProduct(businessId: string, productId: string): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const admin = createAdminClient();
  const ctx = await loadOlxContext(admin, businessId);
  if (!ctx) return { error: "Conexiunea OLX nu este disponibila." };
  const res = await deactivateProductNow(admin, ctx, businessId, productId);
  if (!res.ok) return { error: res.error };
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

export async function activateOlxProduct(businessId: string, productId: string): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const admin = createAdminClient();
  const ctx = await loadOlxContext(admin, businessId);
  if (!ctx) return { error: "Conexiunea OLX nu este disponibila." };
  const res = await activateProductNow(admin, ctx, businessId, productId);
  if (!res.ok) return { error: res.error };
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

export async function deleteOlxAdvert(businessId: string, offerId: string): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const admin = createAdminClient();
  const ctx = await loadOlxContext(admin, businessId);
  if (!ctx) return { error: "Conexiunea OLX nu este disponibila." };
  const res = await deleteAdvertNow(admin, ctx, businessId, offerId);
  if (!res.ok) return { error: res.error };
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

// Bulk: enqueue every sellable product that has a mapped category.
export async function publishAllOlx(businessId: string): Promise<{ queued: number } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const { supabase } = g;
  const config = await loadConfig(supabase, businessId);
  const readiness = olxReadinessError(config);
  if (readiness) return { error: readiness };
  const mappedCategories = new Set(Object.keys(config.category_map ?? {}));
  if (mappedCategories.size === 0) return { error: "Mapeaza mai intai cel putin o categorie la OLX." };

  // Windowed over the 1000-row cap — whole catalog, not just the first page.
  const products = await fetchAllRows("olx.publishAll.products", (from, to) =>
    supabase.from("products").select("id, category").eq("business_id", businessId).eq("is_active", true).order("id").range(from, to)
  );
  const rows = products
    .filter((p) => p.category && mappedCategories.has(p.category as string))
    .map((p) => ({ business_id: businessId, product_id: p.id, offer_id: p.id, op: "upsert" as const }));
  if (rows.length === 0) return { queued: 0 };

  const admin = createAdminClient();
  for (let i = 0; i < rows.length; i += 1000) {
    await admin.from("olx_sync_queue").upsert(rows.slice(i, i + 1000) as never, { onConflict: "business_id,offer_id,op" });
  }
  revalidatePath(FEATURE_PATH);
  return { queued: rows.length };
}

export async function retryOlxProduct(businessId: string, productId: string): Promise<{ success: true } | { error: string }> {
  return publishOlxProduct(businessId, productId).then((r) => ("error" in r ? r : { success: true }));
}

// ── Product table ───────────────────────────────────────────────────────────────
export interface OlxAdvertRow {
  product_id: string | null;
  offer_id: string;
  name: string;
  status: string;
  olx_advert_id: number | null;
  olx_url: string | null;
  valid_to: string | null;
  error: string | null;
  last_synced_at: string | null;
}

export async function getOlxAdverts(businessId: string): Promise<OlxAdvertRow[]> {
  const g = await guard(businessId);
  if ("error" in g) return [];
  const { supabase } = g;
  const { data } = await supabase
    .from("olx_adverts")
    .select("product_id, offer_id, status, olx_advert_id, olx_url, valid_to, error, last_synced_at, products(name)")
    .eq("business_id", businessId)
    .order("updated_at", { ascending: false })
    .limit(200);

  return (data ?? []).map((r) => {
    const prod = r.products as { name?: string } | { name?: string }[] | null;
    const name = Array.isArray(prod) ? prod[0]?.name : prod?.name;
    return {
      product_id: r.product_id,
      offer_id: r.offer_id,
      name: name ?? "Produs",
      status: r.status,
      olx_advert_id: r.olx_advert_id,
      olx_url: r.olx_url,
      valid_to: r.valid_to,
      error: r.error,
      last_synced_at: r.last_synced_at,
    };
  });
}

// ── Monetization: balance, packets, paid features ──────────────────────────────────
async function withToken<T>(businessId: string, fn: (token: string) => Promise<T>): Promise<T | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return { error: g.error };
  const admin = createAdminClient();
  const config = await loadConfig(g.supabase, businessId);
  if (!config.connected || !config.refresh_token) return { error: "Conecteaza mai intai contul OLX." };
  const tok = await ensureMerchantToken(admin, businessId, config);
  if ("error" in tok) return { error: tok.error };
  return fn(tok.token);
}

export interface OlxAccountInfo {
  balance: { sum: number; wallet: number; bonus: number; currency: string } | null;
  paymentMethods: OlxPaymentMethod[];
}

export async function getOlxAccountInfo(businessId: string): Promise<OlxAccountInfo | { error: string }> {
  return withToken(businessId, async (token) => {
    const [balRes, pmRes] = await Promise.all([getAccountBalance(token), getPaymentMethods(token)]);
    return {
      balance: isOlxError(balRes) ? null : {
        sum: balRes.data.sum, wallet: balRes.data.wallet, bonus: balRes.data.bonus, currency: balRes.data.currency,
      },
      paymentMethods: isOlxError(pmRes) ? [] : (Array.isArray(pmRes.data) ? pmRes.data : []),
    };
  });
}

export async function getOlxPackets(businessId: string): Promise<{ available: OlxPacket[]; bought: OlxBoughtPacket[] } | { error: string }> {
  return withToken(businessId, async (token) => {
    const [availRes, boughtRes] = await Promise.all([
      getAvailablePackets(token, { type: "all" }),
      getBoughtPackets(token, "active"),
    ]);
    return {
      available: isOlxError(availRes) ? [] : (Array.isArray(availRes.data) ? availRes.data : []),
      bought: isOlxError(boughtRes) ? [] : (Array.isArray(boughtRes.data) ? boughtRes.data : []),
    };
  });
}

export async function buyOlxCategoryPacket(
  businessId: string, categoryId: number, size: number, paymentMethod: OlxPaymentMethod, type: "base" | "mega" = "base",
): Promise<{ success: true } | { error: string }> {
  const res = await withToken(businessId, (token) =>
    purchaseCategoryPacket(token, { category_id: categoryId, size, payment_method: paymentMethod, type }));
  if ("error" in res) return res;
  if (isOlxError(res)) return { error: mapPaymentError(res.error) };
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

export async function buyOlxAdvertPacket(
  businessId: string, advertId: number, paymentMethod: OlxPaymentMethod, isPremium = false,
): Promise<{ success: true } | { error: string }> {
  const res = await withToken(businessId, async (token) => {
    const buy = await purchaseAdvertPacket(token, advertId, { payment_method: paymentMethod, is_premium: isPremium });
    if (isOlxError(buy)) return buy;
    // After buying a packet for a `limited` advert, activate it.
    return advertCommand(token, advertId, "activate");
  });
  if ("error" in res) return res;
  if (isOlxError(res)) return { error: mapPaymentError(res.error) };
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

export async function getOlxPaidFeatures(businessId: string): Promise<{ features: OlxPaidFeature[] } | { error: string }> {
  const res = await withToken(businessId, (token) => getPaidFeatures(token));
  if ("error" in res) return res;
  if (isOlxError(res)) return { error: res.error };
  return { features: Array.isArray(res.data) ? res.data : [] };
}

export async function buyOlxPaidFeature(
  businessId: string, advertId: number, code: string, paymentMethod: OlxPaymentMethod,
): Promise<{ success: true } | { error: string }> {
  const res = await withToken(businessId, (token) => purchasePaidFeature(token, advertId, { code, payment_method: paymentMethod }));
  if ("error" in res) return res;
  if (isOlxError(res)) return { error: mapPaymentError(res.error) };
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

// ── Inbox (buyer leads) ────────────────────────────────────────────────────────────
export async function getOlxThreads(businessId: string): Promise<{ threads: OlxThread[] } | { error: string }> {
  const res = await withToken(businessId, (token) => getThreads(token, { limit: 50 }));
  if ("error" in res) return res;
  if (isOlxError(res)) return { error: res.error };
  return { threads: Array.isArray(res.data) ? res.data : [] };
}

export interface OlxConversation {
  messages: OlxMessage[];
  buyer: { id: number; name: string; avatar: string | null } | null;
  advert: { id: number; title: string; url: string | null; price: string | null; image: string | null } | null;
}

// One round-trip for a full OLX-style conversation view: messages + the buyer's
// profile (name/avatar) + the advert card (title/price/thumbnail). Marks read.
export async function getOlxConversation(
  businessId: string, threadId: number, opts: { advertId?: number; interlocutorId?: number } = {},
): Promise<OlxConversation | { error: string }> {
  const res = await withToken(businessId, async (token) => {
    const [msgsRes, buyerRes, advertRes] = await Promise.all([
      getThreadMessages(token, threadId),
      opts.interlocutorId ? getUser(token, opts.interlocutorId) : Promise.resolve(null),
      opts.advertId ? getAdvert(token, opts.advertId) : Promise.resolve(null),
    ]);
    void markThreadRead(token, threadId);
    return { msgsRes, buyerRes, advertRes };
  });
  if ("error" in res) return res;
  const { msgsRes, buyerRes, advertRes } = res;
  if (isOlxError(msgsRes)) return { error: msgsRes.error };

  // API can return newest-first — sort ascending by id for a chat view.
  const messages = (Array.isArray(msgsRes.data) ? msgsRes.data : []).slice().sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  const buyer = buyerRes && !isOlxError(buyerRes) && buyerRes.data
    ? { id: buyerRes.data.id, name: buyerRes.data.name, avatar: buyerRes.data.avatar ?? null }
    : null;
  let advert: OlxConversation["advert"] = null;
  if (advertRes && !isOlxError(advertRes) && advertRes.data) {
    const a = advertRes.data;
    advert = {
      id: a.id,
      title: a.title ?? "",
      url: a.url ?? null,
      price: a.price?.value != null ? `${a.price.value} ${a.price.currency ?? "RON"}` : null,
      image: a.images?.[0]?.url ?? null,
    };
  }
  return { messages, buyer, advert };
}

export async function replyOlxThread(businessId: string, threadId: number, text: string): Promise<{ success: true } | { error: string }> {
  const clean = text.trim();
  if (!clean) return { error: "Mesajul este gol." };
  const res = await withToken(businessId, (token) => postThreadMessage(token, threadId, clean));
  if ("error" in res) return res;
  if (isOlxError(res)) return { error: res.error };
  return { success: true };
}

// Translate OLX payment error details into actionable Romanian guidance.
function mapPaymentError(detail: string): string {
  if (/not enough credits/i.test(detail)) {
    return "Sold insuficient pe contul OLX. Alimenteaza portofelul pe olx.ro (plata cu cardul nu este disponibila prin API), apoi reincearca.";
  }
  if (/postpaid.*not activated/i.test(detail)) {
    return "Plata pe factura (postpaid) nu este activata pe contul tau OLX. Contacteaza suportul OLX pentru a o activa.";
  }
  if (/invalid payment method/i.test(detail)) {
    return "Metoda de plata selectata nu este disponibila pe contul tau OLX.";
  }
  if (/no variant with size/i.test(detail)) {
    return "Marimea pachetului nu este disponibila pentru aceasta categorie. Alege alta marime.";
  }
  return detail;
}
