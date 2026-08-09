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
import { logError } from "@/lib/error-logger";
import type { Database } from "@/types/database.types";
import type { TrendyolSyncContext } from "./sync";
import { getOrders, isTrendyolError } from "./client";
import { edinioStatusForTrendyol } from "./webhooks";
import type { TrendyolShipmentPackage } from "./types";
import { tranzitieComandaMarketplace } from "@/lib/orders/tranzitie-marketplace";

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
    /*
     * Ciclul de viata trece prin ACELASI motor ca panoul si loturile.
     *
     * Aici se scria direct in `orders`, deci o anulare venita de la Trendyol punea
     * statusul pe `cancelled` si LASA STOCUL CONSUMAT — tocmai pe sursa de comenzi
     * pe care n-o controlam si care anuleaza cel mai des.
     */
    if (ex.order_id) {
      await tranzitieComandaMarketplace(admin, {
        orderId: ex.order_id, businessId: ctx.businessId,
        status: edinioStatus, sursa: "trendyol",
        campuriSuplimentare: { tracking_number: tracking },
      });
    }
    return "updated";
  }

  // Resolve product ids from barcode (variant -> product) for names + stock.
  const lines = Array.isArray(pkg.lines) ? pkg.lines : [];
  const barcodes = [...new Set(lines.map((l) => l.barcode).filter(Boolean) as string[])];
  const info = new Map<string, { productId: string | null; variantTitle: string | null }>();
  if (barcodes.length > 0) {
    const { data: vs, error: eVar } = await admin
      .from("trendyol_variants").select("barcode, product_id, variant_title" as never).eq("business_id", ctx.businessId).in("barcode", barcodes);
    /*
     * „Nu exista mapare" si „n-am putut CITI maparea" sunt doua lucruri diferite.
     *
     * Fara verificare, o citire picata dadea o harta goala -> `product_id` null ->
     * comanda intra, stocul nu se scade, iar randul lateral scris facea ca
     * sincronizarea urmatoare sa nu mai incerce. Un incident de doua secunde
     * devenea permanent. Se iese INAINTE sa se scrie ceva.
     */
    if (eVar) {
      await logError({
        action: "trendyol/orders", message: `maparea codurilor de bare nu s-a putut citi: ${eVar.message}`,
        details: { packageId }, businessId: ctx.businessId, severity: "critical",
      });
      return "skipped";
    }
    // `as never` pe `select`: `variant_title` e adaugata de migratia
    // `2026-08-19-stoc-marketplace` si nu apare inca in tipurile generate.
    for (const v of (vs ?? []) as unknown as { barcode: string; product_id: string | null; variant_title: string | null }[]) {
      info.set(v.barcode, { productId: v.product_id, variantTitle: v.variant_title ?? null });
    }
  }

  const qtyByProduct = new Map<string, number>();
  // Si pe COMBINATIE, nu doar pe produs: vezi migratia `2026-08-19-stoc-marketplace`.
  const qtyByVariant = new Map<string, { product_id: string; variant_title: string; quantity: number }>();
  const edinioItems = lines.map((l) => {
    const pid = l.barcode ? info.get(l.barcode)?.productId ?? null : null;
    const qty = num(l.quantity) || 1;
    if (pid) qtyByProduct.set(pid, (qtyByProduct.get(pid) ?? 0) + qty);
    const vt = l.barcode ? info.get(l.barcode)?.variantTitle ?? null : null;
    if (pid && vt) {
      const k = `${pid}::${vt}`;
      const e = qtyByVariant.get(k);
      if (e) e.quantity += qty;
      else qtyByVariant.set(k, { product_id: pid, variant_title: vt, quantity: qty });
    }
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
    /*
     * `stoc_rezervat` NU se scrie aici.
     *
     * Il scrie `consuma_stoc_comanda_marketplace`, in aceeasi instructiune cu
     * consumul, si cu ce s-a luat CU ADEVARAT. Scris aici cu ce s-a CERUT, o
     * picare a consumului ar lasa o comanda din care nu s-a scazut nimic dar care
     * pretinde ca a consumat — iar anularea ar ADAUGA stoc care n-a existat.
     */
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

  /*
   * Consumul se cheama INDIFERENT de `isNew`, si asta e tot rostul.
   *
   * `isNew` se hotaraste dupa inserarea comenzii (unicitate pe `order_number`), nu
   * dupa consumul stocului. Deci un consum picat o data lasa comanda creata, iar
   * sincronizarea urmatoare punea `isNew = false` si SAREA blocul — pe vecie.
   *
   * `consuma_stoc_comanda_marketplace` e idempotenta prin marcajul
   * `stoc_marketplace_la`: cat timp e NULL se reincearca, odata pus nu se repeta.
   * Chemata pe ambele ramuri, REPARA si comenzile ramase din urma.
   */
  const produse = [...qtyByProduct.entries()].map(([product_id, quantity]) => ({ product_id, quantity }));
  const variante = [...qtyByVariant.values()];
  if (produse.length > 0 || variante.length > 0) {
    const { data: rez, error } = await admin.rpc("consuma_stoc_comanda_marketplace" as never, {
      p_order_id: orderId, p_business_id: ctx.businessId,
      p_produse: produse, p_variante: variante,
    } as never);
    const r = rez as { gasit?: boolean; deja?: boolean; lipsa?: unknown[] } | null;
    if (error || r?.gasit !== true) {
      await logError({
        action: "trendyol/orders", message: error?.message ?? "consumul de stoc n-a raspuns valid",
        details: { orderId, raspuns: r }, businessId: ctx.businessId, severity: "critical",
      });
    } else if (!r.deja && Array.isArray(r.lipsa) && r.lipsa.length > 0) {
      await logError({
        action: "trendyol/orders",
        message: "Comanda de marketplace a cerut mai mult stoc decat exista; s-a scazut cat s-a putut.",
        details: { orderId, lipsa: r.lipsa }, businessId: ctx.businessId, severity: "warning",
      });
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

/**
 * Fereastra de interogare a comenzilor, taiata la ce accepta Trendyol.
 *
 * Serviciul refuza un interval mai mare de DOUA SAPTAMANI. Un magazin care sta
 * o luna fara sincronizare ar fi cerut o fereastra mai lunga si ar fi primit
 * eroare la fiecare rulare de cron — adica exact magazinul care avea nevoie de
 * recuperare nu si-ar mai fi luat niciodata comenzile. Cerem ultimele doua
 * saptamani si lasam pasul urmator sa continue.
 */
const DOUA_SAPTAMANI = 14 * 24 * 60 * 60 * 1000;

export function fereastraComenzi(sinceMs: number | undefined, acum = Date.now()): { startDate: number; endDate: number } {
  const minim = acum - DOUA_SAPTAMANI;
  // O marja de un minut: ceasurile noastre si ale lor nu bat perfect.
  const start = sinceMs != null && sinceMs > minim ? sinceMs : minim + 60_000;
  return { startDate: Math.min(start, acum), endDate: acum };
}

// Poll recent shipment packages for one business (cron safety net). `sinceMs` is a
// unix-millisecond timestamp (Trendyol uses GMT+3 epoch millis).
export async function pollPackages(admin: Db, ctx: TrendyolSyncContext, sinceMs?: number): Promise<{ ingested: number; ok: boolean }> {
  let ingested = 0;
  let ok = true;
  const { startDate, endDate } = fereastraComenzi(sinceMs);
  for (let page = 0; page < 5; page++) {
    const res = await getOrders(ctx.auth, { startDate, endDate, page, size: 100, orderByField: "PackageLastModifiedDate", orderByDirection: "DESC" });
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
