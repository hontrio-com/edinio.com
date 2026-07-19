// About You sync engine — shared by the cron drain (api/cron/aboutyou-sync) and
// the dashboard "publish now" actions, so both paths behave identically.
//
// Everything is async batch: we submit products/status, store the returned
// batchRequestId in aboutyou_batches, and a poll pass resolves it later. A
// separate reconcile pass reads products back (GET /products) to pick up the
// approval/rejection transitions About You makes on its own side.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { AboutYouAuth } from "./client";
import {
  getPriceBatchResults, getProductBatchResults, getProducts, getShipBatchResults,
  getStatusBatchResults, getStockBatchResults, isAboutYouError, shipOrderItems, updatePrice,
  updateProductStatus, updateStock, upsertProducts,
} from "./client";
import {
  buildAboutYouItems, buildVariantPrices, type AboutYouListingEnrichment,
  type AboutYouStoredMaterial, type AboutYouVariantData, type MappableProduct,
} from "./mapping";
import type { AboutYouConfig, AboutYouRejectionReason } from "./types";

type Db = SupabaseClient<Database>;

export const PRODUCT_FIELDS =
  "id, name, description, price, compare_at_price, images, category, sku, weight_grams, page_sections, is_active, track_inventory, stock_quantity";

export interface AboutYouSyncContext {
  auth: AboutYouAuth;
  config: AboutYouConfig;
  businessId: string;
}

export type SyncOutcome =
  | { ok: true; action: "submitted" | "published" | "removed" | "skipped"; batchRequestId?: string }
  | { ok: false; error: string };

export function pause(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function loadAboutYouContext(admin: Db, businessId: string): Promise<AboutYouSyncContext | null> {
  const { data: ss } = await admin
    .from("store_settings").select("aboutyou_config").eq("business_id", businessId).single();
  const config = (ss?.aboutyou_config as AboutYouConfig) ?? {};
  if (!config.connected || !config.api_key) return null;
  return { auth: { apiKey: config.api_key, environment: config.environment }, config, businessId };
}

// ── Loaders ───────────────────────────────────────────────────────────────────
interface ListingRow {
  id: string;
  product_id: string | null;
  style_key: string;
  status: string;
  brand_id: number | null;
  category_id: number | null;
  color_id: number | null;
  attributes: unknown;
  material_composition: unknown;
  country_of_origin: string | null;
  hs_code: string | null;
}

async function getListing(admin: Db, businessId: string, productId: string): Promise<ListingRow | null> {
  const { data } = await admin
    .from("aboutyou_listings")
    .select("id, product_id, style_key, status, brand_id, category_id, color_id, attributes, material_composition, country_of_origin, hs_code")
    .eq("business_id", businessId).eq("product_id", productId).maybeSingle();
  return (data as ListingRow) ?? null;
}

async function getListingByStyleKey(admin: Db, businessId: string, styleKey: string): Promise<ListingRow | null> {
  const { data } = await admin
    .from("aboutyou_listings")
    .select("id, product_id, style_key, status, brand_id, category_id, color_id, attributes, material_composition, country_of_origin, hs_code")
    .eq("business_id", businessId).eq("style_key", styleKey).maybeSingle();
  return (data as ListingRow) ?? null;
}

function toEnrichment(row: ListingRow): AboutYouListingEnrichment {
  return {
    brand_id: row.brand_id,
    category_id: row.category_id,
    color_id: row.color_id,
    attributes: Array.isArray(row.attributes) ? (row.attributes as number[]) : [],
    material_composition: (row.material_composition as AboutYouStoredMaterial | null) ?? null,
    country_of_origin: row.country_of_origin,
    hs_code: row.hs_code,
  };
}

async function getVariantData(admin: Db, listingId: string): Promise<AboutYouVariantData[]> {
  const { data } = await admin
    .from("aboutyou_variants")
    .select("sku, ean, size_id, second_size_id, color_id, quantity, retail_price_eur, sale_price_eur, enabled")
    .eq("listing_id", listingId);
  return (data ?? []).map((v) => ({
    sku: v.sku,
    ean: v.ean,
    size_id: v.size_id,
    second_size_id: v.second_size_id,
    color_id: v.color_id,
    quantity: v.quantity,
    retail_price_eur: v.retail_price_eur,
    sale_price_eur: v.sale_price_eur,
    enabled: v.enabled,
  }));
}

async function setListingStatus(
  admin: Db, listingId: string, status: string, extra: Record<string, unknown> = {},
): Promise<void> {
  const now = new Date().toISOString();
  await admin.from("aboutyou_listings")
    .update({ status, last_status_at: now, updated_at: now, ...extra } as never)
    .eq("id", listingId);
}

async function recordBatch(
  admin: Db, businessId: string, batchRequestId: string, kind: string, relatedIds: string[],
): Promise<void> {
  await admin.from("aboutyou_batches").upsert(
    { business_id: businessId, batch_request_id: batchRequestId, kind, status: "pending", related_ids: relatedIds as never },
    { onConflict: "business_id,batch_request_id" },
  );
}

// ── Upsert (create/update on About You) ─────────────────────────────────────────
export async function syncProductNow(admin: Db, ctx: AboutYouSyncContext, productId: string): Promise<SyncOutcome> {
  const { data: product } = await admin
    .from("products").select(PRODUCT_FIELDS).eq("id", productId).eq("business_id", ctx.businessId).maybeSingle();
  if (!product) return removeProductNow(admin, ctx, productId);

  const listing = await getListing(admin, ctx.businessId, productId);
  if (!listing) return { ok: false, error: "Produsul nu are configurare About You. Completează detaliile de listare mai întâi." };

  // Deactivated in Edinio -> set inactive on About You instead of relisting it.
  if ((product as { is_active?: boolean }).is_active === false) {
    if (["pending", "draft", "active", "pending_approval", "pending_active"].includes(listing.status)) {
      return setRemoteStatus(admin, ctx, productId, "inactive");
    }
    return { ok: true, action: "skipped" };
  }

  const variants = await getVariantData(admin, listing.id);
  const built = buildAboutYouItems({
    config: ctx.config,
    product: product as unknown as MappableProduct,
    listing: toEnrichment(listing),
    variants,
  });
  if ("error" in built) {
    await setListingStatus(admin, listing.id, "error", { error: built.error });
    return { ok: false, error: built.error };
  }

  const res = await upsertProducts(ctx.auth, built.items);
  if (isAboutYouError(res)) {
    await setListingStatus(admin, listing.id, "error", { error: res.error });
    return { ok: false, error: res.error };
  }
  const batchRequestId = res.data?.batchRequestId;
  const now = new Date().toISOString();
  await setListingStatus(admin, listing.id, "pending", { error: null, last_synced_at: now });
  if (batchRequestId) await recordBatch(admin, ctx.businessId, batchRequestId, "product", [listing.style_key]);
  return { ok: true, action: "submitted", batchRequestId };
}

// ── Publish / unpublish ─────────────────────────────────────────────────────────
async function setRemoteStatus(
  admin: Db, ctx: AboutYouSyncContext, productId: string, status: "published" | "inactive" | "draft",
): Promise<SyncOutcome> {
  const listing = await getListing(admin, ctx.businessId, productId);
  if (!listing) return { ok: false, error: "Listarea About You nu există." };
  const res = await updateProductStatus(ctx.auth, [{ style_key: listing.style_key, status }]);
  if (isAboutYouError(res)) {
    await setListingStatus(admin, listing.id, "error", { error: res.error });
    return { ok: false, error: res.error };
  }
  const batchRequestId = res.data?.batchRequestId;
  await setListingStatus(admin, listing.id, status === "published" ? "pending" : "inactive", { error: null });
  if (batchRequestId) await recordBatch(admin, ctx.businessId, batchRequestId, "status", [listing.style_key]);
  return { ok: true, action: "published", batchRequestId };
}

export function publishProductNow(admin: Db, ctx: AboutYouSyncContext, productId: string): Promise<SyncOutcome> {
  return setRemoteStatus(admin, ctx, productId, "published");
}
export function unpublishProductNow(admin: Db, ctx: AboutYouSyncContext, productId: string): Promise<SyncOutcome> {
  return setRemoteStatus(admin, ctx, productId, "inactive");
}

// Deactivate on About You (best-effort) then drop the local rows.
export async function removeProductNow(admin: Db, ctx: AboutYouSyncContext, productId: string): Promise<SyncOutcome> {
  const listing = await getListing(admin, ctx.businessId, productId);
  if (!listing) return { ok: true, action: "skipped" };
  if (listing.status !== "draft" && listing.status !== "error") {
    await updateProductStatus(ctx.auth, [{ style_key: listing.style_key, status: "inactive" }]);
  }
  await admin.from("aboutyou_listings").delete().eq("id", listing.id);
  return { ok: true, action: "removed" };
}

export async function removeByStyleKey(admin: Db, ctx: AboutYouSyncContext, styleKey: string): Promise<SyncOutcome> {
  const listing = await getListingByStyleKey(admin, ctx.businessId, styleKey);
  if (!listing) return { ok: true, action: "skipped" };
  if (listing.status !== "draft" && listing.status !== "error") {
    await updateProductStatus(ctx.auth, [{ style_key: styleKey, status: "inactive" }]);
  }
  await admin.from("aboutyou_listings").delete().eq("id", listing.id);
  return { ok: true, action: "removed" };
}

// ── Batch polling (cron) ────────────────────────────────────────────────────────
interface BatchRow { id: string; batch_request_id: string; kind: string; related_ids: unknown; attempts: number }

export async function pollOpenBatches(admin: Db, ctx: AboutYouSyncContext, limit = 20): Promise<void> {
  const { data } = await admin
    .from("aboutyou_batches")
    .select("id, batch_request_id, kind, related_ids, attempts")
    .eq("business_id", ctx.businessId)
    .in("status", ["pending", "processing", "retry"])
    .order("submitted_at", { ascending: true })
    .limit(limit);
  const batches = (data ?? []) as BatchRow[];

  for (const b of batches) {
    const res =
      b.kind === "status" ? await getStatusBatchResults(ctx.auth, b.batch_request_id)
      : b.kind === "stock" ? await getStockBatchResults(ctx.auth, b.batch_request_id)
      : b.kind === "price" ? await getPriceBatchResults(ctx.auth, b.batch_request_id)
      : b.kind === "ship" ? await getShipBatchResults(ctx.auth, b.batch_request_id)
      : await getProductBatchResults(ctx.auth, b.batch_request_id);
    const now = new Date().toISOString();

    if (isAboutYouError(res)) {
      await admin.from("aboutyou_batches")
        .update({ attempts: b.attempts + 1, polled_at: now, status: b.attempts + 1 >= 6 ? "failed" : "retry" } as never)
        .eq("id", b.id);
      continue;
    }
    const result = res.data;
    if (!result || result.status === "pending" || result.status === "processing" || result.status === "retry") {
      await admin.from("aboutyou_batches").update({ attempts: b.attempts + 1, polled_at: now } as never).eq("id", b.id);
      continue;
    }

    // Completed or failed: aggregate per-style errors and settle the batch.
    const styleKeys = Array.isArray(b.related_ids) ? (b.related_ids as string[]) : [];
    const errors = (result.items ?? []).filter((it) => !it.success).flatMap((it) => it.errors ?? []);
    const hardFail = result.status === "failed" || errors.length > 0;

    // Only catalog batches (product create/update, status) reflect onto the
    // listing status; stock/price batches are transient and just settle.
    if (b.kind === "product" || b.kind === "status") {
      for (const sk of styleKeys) {
        const listing = await getListingByStyleKey(admin, ctx.businessId, sk);
        if (!listing) continue;
        if (hardFail) {
          await setListingStatus(admin, listing.id, "error", { error: errors.slice(0, 5).join("; ").slice(0, 500) || "Eroare la procesarea pe About You." });
        } else if (b.kind === "product" && listing.status === "pending") {
          // Product accepted; it exists as a draft on About You until published.
          await setListingStatus(admin, listing.id, "draft", { error: null });
        }
      }
    }
    await admin.from("aboutyou_batches")
      .update({ status: hardFail ? "failed" : "completed", polled_at: now, result_summary: { status: result.status, errors: errors.slice(0, 10) } as never })
      .eq("id", b.id);
  }
}

// ── Status reconcile (cron): read products back for approval/rejection ──────────
export async function reconcileStatuses(admin: Db, ctx: AboutYouSyncContext, maxPages = 5): Promise<void> {
  for (let page = 1; page <= maxPages; page++) {
    const res = await getProducts(ctx.auth, { page, per_page: 100 });
    if (isAboutYouError(res)) return;
    const items = res.data?.items ?? [];
    if (items.length === 0) break;
    const now = new Date().toISOString();
    for (const it of items) {
      if (!it.style_key) continue;
      const rejection = (it.rejection_reasons ?? []) as AboutYouRejectionReason[];
      await admin.from("aboutyou_listings")
        .update({
          status: it.status,
          rejection_reasons: (rejection as unknown) as never,
          error: it.rejection_message ?? null,
          last_status_at: now,
          updated_at: now,
        } as never)
        .eq("business_id", ctx.businessId).eq("style_key", it.style_key);
    }
    const total = Number((res.data?.pagination as { pages?: number } | undefined)?.pages ?? 1);
    if (page >= total) break;
    await pause(250);
  }
}

// ── Queue routing ────────────────────────────────────────────────────────────────
export interface AboutYouQueueItem {
  id: string;
  business_id: string;
  product_id: string | null;
  offer_id: string;
  op: string;
  attempts: number;
}

export async function processQueueItem(admin: Db, ctx: AboutYouSyncContext, item: AboutYouQueueItem): Promise<SyncOutcome> {
  switch (item.op) {
    case "delete":
      return removeByStyleKey(admin, ctx, item.offer_id);
    case "publish":
      return item.product_id ? publishProductNow(admin, ctx, item.product_id) : { ok: true, action: "skipped" };
    case "stock":
      return item.product_id ? pushStockNow(admin, ctx, item.product_id) : { ok: true, action: "skipped" };
    case "price":
      return item.product_id ? pushPriceNow(admin, ctx, item.product_id) : { ok: true, action: "skipped" };
    case "ship":
      return shipOrderNow(admin, ctx, item.offer_id);
    default:
      // upsert: full product push (also refreshes stock + price on About You).
      return item.product_id ? syncProductNow(admin, ctx, item.product_id) : { ok: true, action: "skipped" };
  }
}

// ── Dedicated stock / price push (Faza 2) ────────────────────────────────────────
// Edinio tracks stock at the product level. A single-variant listing gets the
// product's live stock; a multi-variant listing uses the per-variant quantity the
// merchant set (per-size stock is a later refinement). Untracked products push a
// nominal "in stock" quantity.
export async function pushStockNow(admin: Db, ctx: AboutYouSyncContext, productId: string): Promise<SyncOutcome> {
  const { data: product } = await admin
    .from("products").select("id, track_inventory, stock_quantity")
    .eq("id", productId).eq("business_id", ctx.businessId).maybeSingle();
  if (!product) return { ok: true, action: "skipped" };
  const listing = await getListing(admin, ctx.businessId, productId);
  if (!listing) return { ok: true, action: "skipped" };
  const variants = (await getVariantData(admin, listing.id)).filter((v) => v.enabled && v.sku);
  if (variants.length === 0) return { ok: true, action: "skipped" };

  const single = variants.length === 1;
  const items = variants.map((v) => {
    let qty: number;
    if (single && product.track_inventory) qty = product.stock_quantity ?? 0;
    else if (v.quantity != null) qty = v.quantity;
    else if (product.track_inventory) qty = product.stock_quantity ?? 0;
    else qty = 100;
    return { sku: v.sku, quantity: Math.max(0, Math.min(1_000_000, Math.round(qty))) };
  });

  const res = await updateStock(ctx.auth, items);
  if (isAboutYouError(res)) return { ok: false, error: res.error };
  const batchRequestId = res.data?.batchRequestId;
  if (batchRequestId) await recordBatch(admin, ctx.businessId, batchRequestId, "stock", [listing.style_key]);
  return { ok: true, action: "submitted", batchRequestId };
}

export async function pushPriceNow(admin: Db, ctx: AboutYouSyncContext, productId: string): Promise<SyncOutcome> {
  const { data: product } = await admin
    .from("products").select(PRODUCT_FIELDS).eq("id", productId).eq("business_id", ctx.businessId).maybeSingle();
  if (!product) return { ok: true, action: "skipped" };
  const listing = await getListing(admin, ctx.businessId, productId);
  if (!listing) return { ok: true, action: "skipped" };
  const variants = (await getVariantData(admin, listing.id)).filter((v) => v.enabled && v.sku);
  if (variants.length === 0) return { ok: true, action: "skipped" };

  const items: { sku: string; price: { country_code: string; retail_price: number; sale_price?: number | null } }[] = [];
  for (const v of variants) {
    const priced = buildVariantPrices(ctx.config, product as unknown as MappableProduct, v);
    if ("error" in priced) return { ok: false, error: priced.error };
    for (const p of priced.prices) {
      items.push({ sku: v.sku, price: { country_code: p.country_code, retail_price: p.retail_price, sale_price: p.sale_price ?? null } });
    }
  }
  if (items.length === 0) return { ok: true, action: "skipped" };

  const res = await updatePrice(ctx.auth, items);
  if (isAboutYouError(res)) return { ok: false, error: res.error };
  const batchRequestId = res.data?.batchRequestId;
  if (batchRequestId) await recordBatch(admin, ctx.businessId, batchRequestId, "price", [listing.style_key]);
  return { ok: true, action: "submitted", batchRequestId };
}

// ── Fulfillment: push AWB tracking to About You (Faza 4, dropshipping) ────────────
// The About You order item integer IDs live in aboutyou_orders.items; the courier
// + tracking are derived from whichever *_awb_number the merchant generated in
// Edinio, mapped to an About You carrier_key via the store's carrier_map.
const COURIER_FIELDS: { field: string; courier: string }[] = [
  { field: "cargus_awb_number", courier: "cargus" },
  { field: "sameday_awb_number", courier: "sameday" },
  { field: "fan_courier_awb_number", courier: "fan-courier" },
  { field: "dpd_awb_number", courier: "dpd" },
  { field: "colete_awb_number", courier: "colete" },
  { field: "woot_awb_number", courier: "woot" },
];

export async function shipOrderNow(admin: Db, ctx: AboutYouSyncContext, orderId: string): Promise<SyncOutcome> {
  const { data: order } = await admin
    .from("orders")
    .select("id, tracking_number, cargus_awb_number, sameday_awb_number, fan_courier_awb_number, dpd_awb_number, colete_awb_number, woot_awb_number")
    .eq("id", orderId).eq("business_id", ctx.businessId).maybeSingle();
  if (!order) return { ok: true, action: "skipped" };

  const { data: ayOrder } = await admin
    .from("aboutyou_orders").select("id, items")
    .eq("business_id", ctx.businessId).eq("order_id", orderId).maybeSingle();
  if (!ayOrder) return { ok: true, action: "skipped" }; // not an About You order

  const row = order as Record<string, unknown>;
  let tracking: string | undefined;
  let courier: string | undefined;
  for (const { field, courier: c } of COURIER_FIELDS) {
    const v = row[field];
    if (typeof v === "string" && v.trim()) { tracking = v.trim(); courier = c; break; }
  }
  if (!tracking && typeof row.tracking_number === "string" && row.tracking_number.trim()) tracking = row.tracking_number.trim();
  if (!tracking) return { ok: true, action: "skipped" }; // no AWB generated yet

  const carrierKey = (courier ? ctx.config.carrier_map?.[courier] : undefined) ?? ctx.config.default_carrier_key;
  if (!carrierKey) return { ok: false, error: "Mapează curierul la un carrier About You în setări." };

  const rawItems = (ayOrder as { items?: unknown }).items;
  const items = Array.isArray(rawItems) ? (rawItems as { order_item_id?: number }[]) : [];
  const orderItemIds = items.map((i) => i.order_item_id).filter((x): x is number => typeof x === "number");
  if (orderItemIds.length === 0) return { ok: true, action: "skipped" };

  // return_tracking_key is REQUIRED by the ship endpoint; RO couriers issue a single
  // AWB for both directions, so we reuse the shipment tracking as the return key.
  const res = await shipOrderItems(ctx.auth, [{
    order_items: orderItemIds, carrier_key: carrierKey,
    shipment_tracking_key: tracking, return_tracking_key: tracking,
  }]);
  if (isAboutYouError(res)) return { ok: false, error: res.error };
  const batchRequestId = res.data?.batchRequestId;
  const now = new Date().toISOString();
  if (batchRequestId) await recordBatch(admin, ctx.businessId, batchRequestId, "ship", [orderId]);
  await admin.from("aboutyou_orders")
    .update({ status: "shipped", last_synced_at: now, updated_at: now } as never)
    .eq("id", (ayOrder as { id: string }).id);
  return { ok: true, action: "submitted", batchRequestId };
}
