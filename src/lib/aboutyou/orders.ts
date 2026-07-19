// About You order ingestion. About You collects payment and delegates fulfillment
// to the seller: orders flow back to us via the order.created webhook (primary)
// and a polling safety net. Each ingested order becomes a normal Edinio order
// (order_source.marketplace = "aboutyou", payment already "paid") plus an
// aboutyou_orders side row holding the About You-specific per-item integer IDs,
// statuses and tracking keys needed to ship/cancel/return in Faza 4.
//
// Ingestion is idempotent on the About You order number. It does NOT go through
// the storefront checkout, so it never triggers Edinio payment capture, courier
// AWB generation, or auto-invoicing — those stay opt-in for marketplace orders.
//
// NOTE: the exact shipping-address shape and money units are confirmed on the
// sandbox. Money integer fields are treated as minor units (cents). Parsing is
// tolerant so ingestion keeps working as the shape is pinned down.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { AboutYouSyncContext } from "./sync";
import { getOrders, isAboutYouError } from "./client";
import type { AboutYouOrder } from "./types";

type Db = SupabaseClient<Database>;

function num(v: unknown): number { return typeof v === "number" && Number.isFinite(v) ? v : 0; }
// About You integer money fields are minor units (cents) -> main unit.
function money(v: unknown): number { return Math.round(num(v)) / 100; }

// Map an About You order status onto an Edinio order status. Only terminal
// marketplace states are reflected onto an existing order (open/shipped stay as
// the merchant manages them in Edinio).
function edinioStatusFor(ayStatus: string | undefined): string {
  if (ayStatus === "cancelled") return "cancelled";
  if (ayStatus === "returned") return "refunded";
  return "pending";
}

interface ParsedAddress { name: string; phone: string; email: string | null; raw: Record<string, unknown> }

function parseAddress(order: AboutYouOrder): ParsedAddress {
  const a = (order.shipping_address ?? order.address ?? order.customer ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof a[k] === "string" ? (a[k] as string) : undefined);
  const name = [str("first_name"), str("last_name")].filter(Boolean).join(" ")
    || str("name") || str("full_name") || "Client About You";
  const phone = str("phone") || str("phone_number") || "";
  const email = str("email") || null;
  return { name, phone, email, raw: a };
}

function toAyItems(order: AboutYouOrder) {
  const items = Array.isArray(order.order_items) ? order.order_items : [];
  return items.map((it) => ({
    order_item_id: it.id,
    sku: it.sku,
    status: it.status,
    price_with_tax: it.price_with_tax,
    price_without_tax: it.price_without_tax,
    vat: it.vat,
    shipment_tracking_key: it.shipment_tracking_key ?? null,
    return_tracking_key: it.return_tracking_key ?? null,
  }));
}

export async function ingestOrder(admin: Db, ctx: AboutYouSyncContext, order: AboutYouOrder): Promise<"created" | "updated" | "skipped"> {
  const ayNumber = typeof order.order_number === "string" ? order.order_number : undefined;
  if (!ayNumber) return "skipped";
  const now = new Date().toISOString();
  const ayItems = toAyItems(order);

  // Idempotency: an already-ingested order only refreshes its side-row (item
  // statuses + tracking); it is never recreated.
  const { data: existing } = await admin
    .from("aboutyou_orders").select("id, order_id")
    .eq("business_id", ctx.businessId).eq("aboutyou_order_number", ayNumber).maybeSingle();
  if (existing) {
    const ex = existing as { id: string; order_id: string | null };
    await admin.from("aboutyou_orders")
      .update({ items: ayItems as never, status: order.status ?? "open", last_synced_at: now, updated_at: now } as never)
      .eq("id", ex.id);
    // Reflect terminal marketplace states (cancelled/returned) onto the order.
    if (ex.order_id && (order.status === "cancelled" || order.status === "returned")) {
      await admin.from("orders")
        .update({ status: edinioStatusFor(order.status), updated_at: now } as never)
        .eq("id", ex.order_id).eq("business_id", ctx.businessId);
    }
    return "updated";
  }

  // Resolve product names from SKU (variant -> product) for a readable order.
  const items = Array.isArray(order.order_items) ? order.order_items : [];
  const skus = [...new Set(items.map((it) => it.sku).filter(Boolean))];
  const info = new Map<string, { productId: string | null; name: string }>();
  if (skus.length > 0) {
    const { data: vs } = await admin
      .from("aboutyou_variants").select("sku, product_id").eq("business_id", ctx.businessId).in("sku", skus);
    const prodIds = [...new Set((vs ?? []).map((v) => v.product_id).filter(Boolean) as string[])];
    const prodName = new Map<string, string>();
    if (prodIds.length > 0) {
      const { data: ps } = await admin.from("products").select("id, name").in("id", prodIds);
      for (const p of ps ?? []) prodName.set(p.id, p.name);
    }
    for (const v of vs ?? []) {
      info.set(v.sku, { productId: v.product_id, name: v.product_id ? (prodName.get(v.product_id) ?? "Produs About You") : "Produs About You" });
    }
  }

  const qtyByProduct = new Map<string, number>();
  const edinioItems = items.map((it) => {
    const meta = info.get(it.sku);
    const q = (it as { quantity?: number }).quantity;
    const qty = typeof q === "number" ? q : 1;
    if (meta?.productId) qtyByProduct.set(meta.productId, (qtyByProduct.get(meta.productId) ?? 0) + qty);
    return { product_id: meta?.productId ?? null, name: meta?.name ?? `SKU ${it.sku}`, sku: it.sku, price: money(it.price_with_tax), quantity: qty };
  });

  const subtotal = money(items.reduce((s, it) => s + num(it.price_without_tax), 0));
  const total = money(items.reduce((s, it) => s + num(it.price_with_tax), 0));
  const vatAmount = Math.round((total - subtotal) * 100) / 100;
  const addr = parseAddress(order);

  const { data: created, error } = await admin.from("orders").insert({
    business_id: ctx.businessId,
    order_number: `AY-${ayNumber}`,
    customer_name: addr.name,
    customer_phone: addr.phone,
    customer_email: addr.email,
    shipping_address: { ...addr.raw, source: "aboutyou", shop_country: order.shop_country ?? null } as never,
    items: edinioItems as never,
    subtotal,
    total,
    vat_amount: vatAmount,
    payment_method: "aboutyou",
    payment_status: "paid",
    status: edinioStatusFor(order.status),
    order_source: { marketplace: "aboutyou", order_number: ayNumber } as never,
  } as never).select("id").single();

  // Recover from a prior/partial ingest: order_number is unique per business, so a
  // failed insert means the order already exists — link to it instead of dropping
  // the marketplace order, and skip the stock decrement (already applied once).
  let orderId: string;
  let isNew = true;
  if (error || !created) {
    const { data: found } = await admin.from("orders").select("id")
      .eq("business_id", ctx.businessId).eq("order_number", `AY-${ayNumber}`).maybeSingle();
    if (!found) return "skipped";
    orderId = (found as { id: string }).id;
    isNew = false;
  } else {
    orderId = (created as { id: string }).id;
  }

  await admin.from("aboutyou_orders").upsert({
    business_id: ctx.businessId,
    order_id: orderId,
    aboutyou_order_number: ayNumber,
    shop_country: order.shop_country ?? null,
    fulfillment_type: (typeof order.fulfillment_type === "string" ? order.fulfillment_type : null),
    status: order.status ?? "open",
    items: ayItems as never,
    last_synced_at: now,
  } as never, { onConflict: "business_id,aboutyou_order_number" });

  // Unified inventory: reflect the marketplace sale in Edinio stock (only on a
  // genuinely new order, never when recovering/re-linking an existing one).
  if (isNew) {
    const decrements = [...qtyByProduct.entries()].map(([product_id, quantity]) => ({ product_id, quantity }));
    if (decrements.length > 0) {
      try { await admin.rpc("decrement_stock_batch" as never, { p_items: decrements } as never); } catch { /* best-effort */ }
    }
  }
  return isNew ? "created" : "updated";
}

// Fetch a single order by its About You number and ingest it (webhook path).
export async function ingestOrderByNumber(admin: Db, ctx: AboutYouSyncContext, orderNumber: string): Promise<void> {
  const res = await getOrders(ctx.auth, { order_number: orderNumber, per_page: 5 });
  if (isAboutYouError(res)) return;
  const order = (res.data?.items ?? []).find((o) => o.order_number === orderNumber) ?? res.data?.items?.[0];
  if (order) await ingestOrder(admin, ctx, order);
}

// Poll new/open orders for one business and ingest them (cron safety net).
export async function pollOrders(admin: Db, ctx: AboutYouSyncContext, since?: string): Promise<{ ingested: number; ok: boolean }> {
  let ingested = 0;
  let ok = true;
  for (let page = 1; page <= 5; page++) {
    const res = await getOrders(ctx.auth, { order_status: "open", orders_from: since, page, per_page: 50 });
    if (isAboutYouError(res)) { ok = false; break; }
    const orders = res.data?.items ?? [];
    if (orders.length === 0) break;
    for (const o of orders) {
      if ((await ingestOrder(admin, ctx, o)) === "created") ingested++;
    }
    const total = Number((res.data?.pagination as { pages?: number } | undefined)?.pages ?? 1);
    if (page >= total) break;
  }
  return { ingested, ok };
}

// Best-effort extraction of the order number from a webhook payload.
export function extractOrderNumber(event: unknown): string | undefined {
  const e = (event ?? {}) as Record<string, unknown>;
  const data = (e.data as Record<string, unknown>) ?? e;
  const n = data.order_number ?? data.orderNumber ?? e.order_number;
  return typeof n === "string" ? n : undefined;
}
