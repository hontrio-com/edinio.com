// Trendyol order ingestion. Trendyol collects payment and delegates fulfillment to
// the seller via its contracted cargo: orders flow back as shipment packages via
// the order webhook (primary) and a polling safety net. Each ingested package
// becomes a normal Edinio order (order_source.marketplace="trendyol", payment
// already "paid") plus a trendyol_orders side row holding the Trendyol-specific
// per-line lineIds, statuses and cargo tracking needed to fulfil in Faza 4.
//
// Idempotent on shipmentPackageId. It does NOT go through the storefront checkout,
// so it never triggers Edinio payment capture or auto-invoicing. Money fields are
// plain decimals (Trendyol, unlike About You, does not use minor units).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { TrendyolSyncContext } from "./sync";
import { getOrders, isTrendyolError } from "./client";
import { edinioStatusForTrendyol } from "./webhooks";
import type { TrendyolShipmentPackage } from "./types";

type Db = SupabaseClient<Database>;

function num(v: unknown): number { return typeof v === "number" && Number.isFinite(v) ? v : 0; }
function round2(n: number): number { return Math.round((n + Number.EPSILON) * 100) / 100; }

function toSideLines(pkg: TrendyolShipmentPackage) {
  return (Array.isArray(pkg.lines) ? pkg.lines : []).map((l) => ({
    lineId: l.lineId,
    barcode: l.barcode ?? null,
    quantity: l.quantity,
    status: l.orderLineItemStatusName ?? null,
  }));
}

function parseCustomer(pkg: TrendyolShipmentPackage): { name: string; phone: string; email: string | null; address: Record<string, unknown> } {
  const a = (pkg.shipmentAddress ?? {}) as Record<string, unknown>;
  const str = (o: Record<string, unknown>, k: string) => (typeof o[k] === "string" ? (o[k] as string) : undefined);
  const name = [pkg.customerFirstName, pkg.customerLastName].filter(Boolean).join(" ")
    || str(a, "fullName") || [str(a, "firstName"), str(a, "lastName")].filter(Boolean).join(" ") || "Client Trendyol";
  const phone = str(a, "phone") || "";
  const email = pkg.customerEmail || null;
  return { name, phone, email, address: a };
}

export async function ingestPackage(admin: Db, ctx: TrendyolSyncContext, pkg: TrendyolShipmentPackage): Promise<"created" | "updated" | "skipped"> {
  const packageId = pkg.shipmentPackageId != null ? String(pkg.shipmentPackageId) : undefined;
  if (!packageId) return "skipped";
  const now = new Date().toISOString();
  const sideLines = toSideLines(pkg);
  const edinioStatus = edinioStatusForTrendyol(pkg.status ?? pkg.shipmentPackageStatus);
  const tracking = pkg.cargoTrackingNumber != null ? String(pkg.cargoTrackingNumber) : null;

  const { data: existing } = await admin
    .from("trendyol_orders").select("id, order_id")
    .eq("business_id", ctx.businessId).eq("shipment_package_id", packageId).maybeSingle();
  if (existing) {
    const ex = existing as { id: string; order_id: string | null };
    await admin.from("trendyol_orders")
      .update({ status: pkg.status ?? "Created", lines: sideLines as never, cargo_tracking_number: tracking, last_synced_at: now, updated_at: now } as never)
      .eq("id", ex.id);
    // Reflect the marketplace order lifecycle onto the Edinio order (Trendyol drives it).
    if (ex.order_id) {
      await admin.from("orders")
        .update({ status: edinioStatus, tracking_number: tracking, updated_at: now } as never)
        .eq("id", ex.order_id).eq("business_id", ctx.businessId);
    }
    return "updated";
  }

  // Resolve product ids from barcode (variant -> product) for names + stock.
  const lines = Array.isArray(pkg.lines) ? pkg.lines : [];
  const barcodes = [...new Set(lines.map((l) => l.barcode).filter(Boolean) as string[])];
  const info = new Map<string, { productId: string | null }>();
  if (barcodes.length > 0) {
    const { data: vs } = await admin
      .from("trendyol_variants").select("barcode, product_id").eq("business_id", ctx.businessId).in("barcode", barcodes);
    for (const v of vs ?? []) info.set(v.barcode, { productId: v.product_id });
  }

  const qtyByProduct = new Map<string, number>();
  const edinioItems = lines.map((l) => {
    const pid = l.barcode ? info.get(l.barcode)?.productId ?? null : null;
    const qty = num(l.quantity) || 1;
    if (pid) qtyByProduct.set(pid, (qtyByProduct.get(pid) ?? 0) + qty);
    const price = num(l.lineUnitPrice) || num(l.price);
    return { product_id: pid, name: l.productName ?? `Barcode ${l.barcode}`, barcode: l.barcode ?? null, price, quantity: qty };
  });

  const total = num(pkg.packageTotalPrice) || num(pkg.totalPrice) || edinioItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const vatAmount = round2(lines.reduce((s, l) => {
    const lineTotal = num(l.lineUnitPrice) * num(l.quantity);
    const vr = num(l.vatRate);
    return s + (vr > 0 ? lineTotal - lineTotal / (1 + vr / 100) : 0);
  }, 0));
  const subtotal = round2(total - vatAmount);
  const cust = parseCustomer(pkg);

  const { data: created, error } = await admin.from("orders").insert({
    business_id: ctx.businessId,
    order_number: `TY-${packageId}`,
    customer_name: cust.name,
    customer_phone: cust.phone,
    customer_email: cust.email,
    shipping_address: { ...cust.address, source: "trendyol" } as never,
    items: edinioItems as never,
    subtotal,
    total: round2(total),
    vat_amount: vatAmount,
    payment_method: "trendyol",
    payment_status: "paid",
    status: edinioStatus,
    tracking_number: tracking,
    order_source: { marketplace: "trendyol", order_number: pkg.orderNumber, shipment_package_id: packageId } as never,
  } as never).select("id").single();

  // Recover from a prior/partial ingest: order_number is unique per business.
  let orderId: string;
  let isNew = true;
  if (error || !created) {
    const { data: found } = await admin.from("orders").select("id")
      .eq("business_id", ctx.businessId).eq("order_number", `TY-${packageId}`).maybeSingle();
    if (!found) return "skipped";
    orderId = (found as { id: string }).id;
    isNew = false;
  } else {
    orderId = (created as { id: string }).id;
  }

  await admin.from("trendyol_orders").upsert({
    business_id: ctx.businessId,
    order_id: orderId,
    shipment_package_id: packageId,
    order_number: pkg.orderNumber ?? null,
    status: pkg.status ?? "Created",
    currency: pkg.currencyCode ?? null,
    cargo_tracking_number: tracking,
    lines: sideLines as never,
    last_synced_at: now,
  } as never, { onConflict: "business_id,shipment_package_id" });

  if (isNew) {
    const decrements = [...qtyByProduct.entries()].map(([product_id, quantity]) => ({ product_id, quantity }));
    if (decrements.length > 0) {
      try { await admin.rpc("decrement_stock_batch" as never, { p_items: decrements } as never); } catch { /* best-effort */ }
    }
  }
  return isNew ? "created" : "updated";
}

// Fetch a single order by its Trendyol order number and ingest its packages.
export async function ingestByOrderNumber(admin: Db, ctx: TrendyolSyncContext, orderNumber: string): Promise<void> {
  const res = await getOrders(ctx.auth, { orderNumber, size: 50 });
  if (isTrendyolError(res)) return;
  for (const pkg of res.data?.content ?? []) await ingestPackage(admin, ctx, pkg);
}

// Poll recent shipment packages for one business (cron safety net). `sinceMs` is a
// unix-millisecond timestamp (Trendyol uses GMT+3 epoch millis).
export async function pollPackages(admin: Db, ctx: TrendyolSyncContext, sinceMs?: number): Promise<{ ingested: number; ok: boolean }> {
  let ingested = 0;
  let ok = true;
  for (let page = 0; page < 5; page++) {
    const res = await getOrders(ctx.auth, { startDate: sinceMs, page, size: 100, orderByField: "PackageLastModifiedDate", orderByDirection: "DESC" });
    if (isTrendyolError(res)) { ok = false; break; }
    const content = res.data?.content ?? [];
    if (content.length === 0) break;
    for (const pkg of content) {
      if ((await ingestPackage(admin, ctx, pkg)) === "created") ingested++;
    }
    const totalPages = Number(res.data?.totalPages ?? 1);
    if (page + 1 >= totalPages) break;
  }
  return { ingested, ok };
}

// Best-effort extraction of packages from a webhook payload (same shape as the
// shipment-packages response: { content: [...] }, or a single package object).
export function extractPackages(payload: unknown): TrendyolShipmentPackage[] {
  const p = (payload ?? {}) as { content?: unknown; shipmentPackageId?: unknown };
  if (Array.isArray(p.content)) return p.content as TrendyolShipmentPackage[];
  if (p.shipmentPackageId != null) return [payload as TrendyolShipmentPackage];
  return [];
}
