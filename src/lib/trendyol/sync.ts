// Trendyol sync engine — shared by the cron drain (api/cron/trendyol-sync) and
// the dashboard "list now" actions. Products/inventory are async batch: submit ->
// { batchRequestId } -> poll batch-requests. A reconcile pass reads approved
// products back to pick up Trendyol's approval decision.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { TrendyolAuth } from "./client";
import {
  createProducts, getApprovedProducts, getBatchResult, isTrendyolError, updatePriceInventory,
} from "./client";
import {
  buildTrendyolItems, buildVariantPrices, resolveVariantQuantity, type MappableProduct,
  type TrendyolListingEnrichment, type TrendyolVariantData,
} from "./mapping";
import type { TrendyolConfig, TrendyolProductAttribute } from "./types";

type Db = SupabaseClient<Database>;

export const PRODUCT_FIELDS =
  "id, name, description, price, compare_at_price, images, category, sku, weight_grams, page_sections, is_active, track_inventory, stock_quantity";

export interface TrendyolSyncContext {
  auth: TrendyolAuth;
  config: TrendyolConfig;
  businessId: string;
}

export type SyncOutcome =
  | { ok: true; action: "submitted" | "removed" | "skipped"; batchRequestId?: string }
  | { ok: false; error: string };

export function pause(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function loadTrendyolContext(admin: Db, businessId: string): Promise<TrendyolSyncContext | null> {
  const { data: ss } = await admin
    .from("store_settings").select("trendyol_config").eq("business_id", businessId).single();
  const config = (ss?.trendyol_config as TrendyolConfig) ?? {};
  if (!config.connected || !config.api_key || !config.api_secret || !config.supplier_id) return null;
  return {
    auth: {
      supplierId: config.supplier_id, apiKey: config.api_key, apiSecret: config.api_secret,
      environment: config.environment, userAgentCompany: config.user_agent_company,
    },
    config,
    businessId,
  };
}

// ── Loaders ───────────────────────────────────────────────────────────────────
interface ListingRow {
  id: string; product_id: string | null; product_main_id: string; status: string;
  brand_id: number | null; category_id: number | null; attributes: unknown;
  dimensional_weight: number | null; cargo_company_id: number | null;
}

async function getListing(admin: Db, businessId: string, productId: string): Promise<ListingRow | null> {
  const { data } = await admin
    .from("trendyol_listings")
    .select("id, product_id, product_main_id, status, brand_id, category_id, attributes, dimensional_weight, cargo_company_id")
    .eq("business_id", businessId).eq("product_id", productId).maybeSingle();
  return (data as ListingRow) ?? null;
}
async function getListingByMainId(admin: Db, businessId: string, mainId: string): Promise<ListingRow | null> {
  const { data } = await admin
    .from("trendyol_listings")
    .select("id, product_id, product_main_id, status, brand_id, category_id, attributes, dimensional_weight, cargo_company_id")
    .eq("business_id", businessId).eq("product_main_id", mainId).maybeSingle();
  return (data as ListingRow) ?? null;
}

function toEnrichment(row: ListingRow): TrendyolListingEnrichment {
  return {
    brand_id: row.brand_id,
    category_id: row.category_id,
    attributes: Array.isArray(row.attributes) ? (row.attributes as TrendyolProductAttribute[]) : [],
    dimensional_weight: row.dimensional_weight,
    cargo_company_id: row.cargo_company_id,
  };
}

async function getVariantData(admin: Db, listingId: string): Promise<TrendyolVariantData[]> {
  const { data } = await admin
    .from("trendyol_variants")
    .select("barcode, stock_code, attributes, quantity, list_price, sale_price, vat_rate, enabled")
    .eq("listing_id", listingId);
  return (data ?? []).map((v) => ({
    barcode: v.barcode,
    stock_code: v.stock_code,
    attributes: Array.isArray(v.attributes) ? (v.attributes as unknown as TrendyolProductAttribute[]) : [],
    quantity: v.quantity,
    list_price: v.list_price,
    sale_price: v.sale_price,
    vat_rate: v.vat_rate,
    enabled: v.enabled,
  }));
}

async function setListingStatus(admin: Db, listingId: string, status: string, extra: Record<string, unknown> = {}): Promise<void> {
  const now = new Date().toISOString();
  await admin.from("trendyol_listings")
    .update({ status, last_status_at: now, updated_at: now, ...extra } as never)
    .eq("id", listingId);
}

async function recordBatch(admin: Db, businessId: string, batchRequestId: string, kind: string, relatedIds: string[]): Promise<void> {
  await admin.from("trendyol_batches").upsert(
    { business_id: businessId, batch_request_id: batchRequestId, kind, status: "pending", related_ids: relatedIds as never },
    { onConflict: "business_id,batch_request_id" },
  );
}

// ── Upsert (create/update on Trendyol) ──────────────────────────────────────────
export async function syncProductNow(admin: Db, ctx: TrendyolSyncContext, productId: string): Promise<SyncOutcome> {
  const { data: product } = await admin
    .from("products").select(PRODUCT_FIELDS).eq("id", productId).eq("business_id", ctx.businessId).maybeSingle();
  if (!product) return removeProductNow(admin, ctx, productId);

  const listing = await getListing(admin, ctx.businessId, productId);
  if (!listing) return { ok: false, error: "Produsul nu are configurare Trendyol. Completează detaliile de listare mai întâi." };

  // Deactivated in Edinio -> zero the stock on Trendyol instead of relisting.
  if ((product as { is_active?: boolean }).is_active === false) {
    const res = await pushInventoryNow(admin, ctx, productId, true);
    await setListingStatus(admin, listing.id, "inactive", { error: null });
    return res;
  }

  const variants = await getVariantData(admin, listing.id);
  const built = buildTrendyolItems({
    config: ctx.config, product: product as unknown as MappableProduct, listing: toEnrichment(listing), variants,
  });
  if ("error" in built) {
    await setListingStatus(admin, listing.id, "error", { error: built.error });
    return { ok: false, error: built.error };
  }

  const res = await createProducts(ctx.auth, built.items);
  if (isTrendyolError(res)) {
    await setListingStatus(admin, listing.id, "error", { error: res.error });
    return { ok: false, error: res.error };
  }
  const batchRequestId = res.data?.batchRequestId;
  await setListingStatus(admin, listing.id, "pending", { error: null, last_synced_at: new Date().toISOString() });
  if (batchRequestId) await recordBatch(admin, ctx.businessId, batchRequestId, "product", [listing.product_main_id]);
  return { ok: true, action: "submitted", batchRequestId };
}

// ── Inventory / price push (also used to deactivate by zeroing stock) ───────────
export type InventoryItem = { barcode: string; quantity: number; salePrice: number; listPrice: number };

// Compute the price-and-inventory items Edinio intends for a product. Shared by the
// forward push AND the reverse reconciliation, so both agree exactly (no oscillation).
// Returns null when the listing isn't pushable (not on Trendyol yet, no variants).
async function computeInventoryItems(
  admin: Db, ctx: TrendyolSyncContext, productId: string, forceZero = false,
): Promise<{ items: InventoryItem[]; listing: ListingRow } | { error: string } | null> {
  const { data: product } = await admin
    .from("products").select("id, price, compare_at_price, track_inventory, stock_quantity").eq("id", productId).eq("business_id", ctx.businessId).maybeSingle();
  if (!product) return null;
  const listing = await getListing(admin, ctx.businessId, productId);
  if (!listing) return null;
  // price-and-inventory only works for products that already exist on Trendyol; a
  // not-yet-created listing (draft/pending/error) will get its stock+price from the
  // createProducts payload instead.
  if (!["created", "approved", "active", "inactive"].includes(listing.status)) return null;
  const variants = (await getVariantData(admin, listing.id)).filter((v) => v.enabled && v.barcode);
  if (variants.length === 0) return null;

  const single = variants.length === 1;
  const prod = product as { price: number; compare_at_price: number | null; track_inventory: boolean; stock_quantity: number | null };
  const items: InventoryItem[] = [];
  for (const v of variants) {
    const priced = buildVariantPrices(prod as unknown as MappableProduct, v);
    if ("error" in priced) return { error: priced.error };
    items.push({ barcode: v.barcode, quantity: resolveVariantQuantity(prod, v.quantity, single, forceZero), salePrice: priced.salePrice, listPrice: priced.listPrice });
  }
  return { items, listing };
}

export async function pushInventoryNow(admin: Db, ctx: TrendyolSyncContext, productId: string, forceZero = false): Promise<SyncOutcome> {
  const built = await computeInventoryItems(admin, ctx, productId, forceZero);
  if (built === null) return { ok: true, action: "skipped" };
  if ("error" in built) return { ok: false, error: built.error };

  const res = await updatePriceInventory(ctx.auth, built.items);
  if (isTrendyolError(res)) return { ok: false, error: res.error };
  const batchRequestId = res.data?.batchRequestId;
  if (batchRequestId) await recordBatch(admin, ctx.businessId, batchRequestId, "inventory", [built.listing.product_main_id]);
  return { ok: true, action: "submitted", batchRequestId };
}

// ── Remove (drop local rows; Trendyol-side archive is a later refinement) ───────
export async function removeProductNow(admin: Db, ctx: TrendyolSyncContext, productId: string): Promise<SyncOutcome> {
  const listing = await getListing(admin, ctx.businessId, productId);
  if (!listing) return { ok: true, action: "skipped" };
  // Best-effort deactivate on Trendyol by zeroing stock before dropping local rows.
  if (listing.status !== "draft" && listing.status !== "error") {
    await pushInventoryNow(admin, ctx, productId, true);
  }
  await admin.from("trendyol_listings").delete().eq("id", listing.id);
  return { ok: true, action: "removed" };
}
export async function removeByMainId(admin: Db, ctx: TrendyolSyncContext, mainId: string): Promise<SyncOutcome> {
  const listing = await getListingByMainId(admin, ctx.businessId, mainId);
  if (!listing) return { ok: true, action: "skipped" };
  await admin.from("trendyol_listings").delete().eq("id", listing.id);
  return { ok: true, action: "removed" };
}

// ── Batch polling (cron) ────────────────────────────────────────────────────────
interface BatchRow { id: string; batch_request_id: string; kind: string; related_ids: unknown; attempts: number }

export async function pollOpenBatches(admin: Db, ctx: TrendyolSyncContext, limit = 20): Promise<void> {
  const { data } = await admin
    .from("trendyol_batches")
    .select("id, batch_request_id, kind, related_ids, attempts")
    .eq("business_id", ctx.businessId)
    .in("status", ["pending", "processing", "retry"])
    .order("submitted_at", { ascending: true })
    .limit(limit);
  const batches = (data ?? []) as BatchRow[];

  for (const b of batches) {
    const res = await getBatchResult(ctx.auth, b.batch_request_id);
    const now = new Date().toISOString();

    if (isTrendyolError(res)) {
      await admin.from("trendyol_batches")
        .update({ attempts: b.attempts + 1, polled_at: now, status: b.attempts + 1 >= 6 ? "failed" : "retry" } as never)
        .eq("id", b.id);
      continue;
    }
    const result = res.data;
    // Trendyol returns COMPLETED once done; anything else is still processing.
    if (!result || (result.status && result.status.toUpperCase() !== "COMPLETED" && result.status.toUpperCase() !== "FAILED")) {
      await admin.from("trendyol_batches").update({ attempts: b.attempts + 1, polled_at: now } as never).eq("id", b.id);
      continue;
    }

    const errors = (result.items ?? []).filter((it) => String(it.status).toUpperCase() !== "SUCCESS").flatMap((it) => it.failureReasons ?? []);
    const hardFail = (result.failedItemCount ?? 0) > 0 || errors.length > 0 || String(result.status).toUpperCase() === "FAILED";

    // Only product batches reflect onto the listing status; inventory batches settle.
    if (b.kind === "product") {
      const mainIds = Array.isArray(b.related_ids) ? (b.related_ids as string[]) : [];
      for (const mid of mainIds) {
        const listing = await getListingByMainId(admin, ctx.businessId, mid);
        if (!listing) continue;
        if (hardFail) {
          await setListingStatus(admin, listing.id, "error", { error: errors.slice(0, 5).join("; ").slice(0, 500) || "Eroare la procesarea pe Trendyol." });
        } else if (listing.status === "pending") {
          // Accepted; exists on Trendyol pending approval.
          await setListingStatus(admin, listing.id, "created", { error: null });
        }
      }
    }
    await admin.from("trendyol_batches")
      .update({ status: hardFail ? "failed" : "completed", polled_at: now, result_summary: { status: result.status, errors: errors.slice(0, 10) } as never })
      .eq("id", b.id);
  }
}

// ── Reconcile (cron): approved products -> mark listings approved ───────────────
export async function reconcileStatuses(admin: Db, ctx: TrendyolSyncContext, maxPages = 5): Promise<void> {
  const approvedMainIds = new Set<string>();
  for (let page = 0; page < maxPages; page++) {
    const res = await getApprovedProducts(ctx.auth, { page, size: 100 });
    if (isTrendyolError(res)) return;
    const content = res.data?.content ?? [];
    if (content.length === 0) break;
    for (const p of content) if (p.productMainId) approvedMainIds.add(p.productMainId);
    const total = Number(res.data?.totalPages ?? 1);
    if (page + 1 >= total) break;
    await pause(250);
  }
  if (approvedMainIds.size === 0) return;
  const now = new Date().toISOString();
  // Mark listings that appear in the approved set (and are not already approved).
  const { data: listings } = await admin
    .from("trendyol_listings").select("id, product_main_id, status")
    .eq("business_id", ctx.businessId).in("status", ["pending", "created"]);
  for (const l of listings ?? []) {
    if (approvedMainIds.has((l as { product_main_id: string }).product_main_id)) {
      await admin.from("trendyol_listings").update({ status: "approved", error: null, last_status_at: now, updated_at: now } as never).eq("id", (l as { id: string }).id);
    }
  }
}

// ── Reverse reconciliation (cron): correct stock/price drift on Trendyol ─────────
// Trendyol has no stock webhook, and a push can fail silently. This reads Trendyol's
// current approved inventory and, where it disagrees with what Edinio intends
// (Edinio being the source of truth), re-pushes the corrected values. Shares
// computeInventoryItems with the forward push so a settled state produces zero
// drift (no oscillation); only genuine differences are corrected.
export async function reconcileInventory(admin: Db, ctx: TrendyolSyncContext, maxProducts = 60): Promise<{ corrected: number }> {
  const trendyol = new Map<string, { quantity: number; salePrice: number; listPrice: number }>();
  for (let page = 0; page < 10; page++) {
    const res = await getApprovedProducts(ctx.auth, { page, size: 100 });
    if (isTrendyolError(res)) return { corrected: 0 };
    const content = res.data?.content ?? [];
    if (content.length === 0) break;
    for (const p of content) {
      for (const v of p.variants ?? []) {
        if (v.barcode) trendyol.set(v.barcode, { quantity: Number(v.quantity ?? 0), salePrice: Number(v.salePrice ?? 0), listPrice: Number(v.listPrice ?? 0) });
      }
    }
    const total = Number(res.data?.totalPages ?? 1);
    if (page + 1 >= total) break;
    await pause(250);
  }
  if (trendyol.size === 0) return { corrected: 0 };

  const { data: listings } = await admin
    .from("trendyol_listings").select("product_id")
    .eq("business_id", ctx.businessId).in("status", ["approved", "active"]).limit(maxProducts);

  const drifted: InventoryItem[] = [];
  for (const l of listings ?? []) {
    const pid = (l as { product_id: string | null }).product_id;
    if (!pid) continue;
    const built = await computeInventoryItems(admin, ctx, pid);
    if (!built || "error" in built) continue;
    for (const it of built.items) {
      const cur = trendyol.get(it.barcode);
      if (!cur) continue; // not (yet) approved on Trendyol
      const qtyDrift = cur.quantity !== it.quantity;
      const priceDrift = Math.abs(cur.salePrice - it.salePrice) > 0.01 || Math.abs(cur.listPrice - it.listPrice) > 0.01;
      if (qtyDrift || priceDrift) drifted.push(it);
    }
  }
  if (drifted.length === 0) return { corrected: 0 };

  let corrected = 0;
  for (let i = 0; i < drifted.length; i += 100) {
    const chunk = drifted.slice(i, i + 100);
    const res = await updatePriceInventory(ctx.auth, chunk);
    if (!isTrendyolError(res)) {
      corrected += chunk.length;
      const batchRequestId = res.data?.batchRequestId;
      if (batchRequestId) await recordBatch(admin, ctx.businessId, batchRequestId, "inventory", []);
    }
    await pause(300);
  }
  return { corrected };
}

// ── Queue routing ────────────────────────────────────────────────────────────────
export interface TrendyolQueueItem {
  id: string; business_id: string; product_id: string | null; offer_id: string; op: string; attempts: number;
}

export async function processQueueItem(admin: Db, ctx: TrendyolSyncContext, item: TrendyolQueueItem): Promise<SyncOutcome> {
  switch (item.op) {
    case "delete":
      return removeByMainId(admin, ctx, item.offer_id);
    case "inventory":
      return item.product_id ? pushInventoryNow(admin, ctx, item.product_id) : { ok: true, action: "skipped" };
    default:
      return item.product_id ? syncProductNow(admin, ctx, item.product_id) : { ok: true, action: "skipped" };
  }
}
