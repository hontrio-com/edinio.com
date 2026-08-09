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
  const info = new Map<string, { productId: string | null; variantTitle: string | null }>();
  if (barcodes.length > 0) {
    const { data: vs } = await admin
      .from("trendyol_variants").select("barcode, product_id, variant_title" as never).eq("business_id", ctx.businessId).in("barcode", barcodes);
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
     * CE STOC A CONSUMAT comanda, ca anularea sau returul sa poata da INAPOI.
     *
     * Comenzile de marketplace scadeau stoc si nu scriau nimic aici, deci
     * `elibereaza_stoc_comanda` raporta „necunoscut" si nu punea nimic la loc —
     * exact gaura pe care am inchis-o pentru comenzile din magazin. Din `items`
     * nu se poate deduce: acolo `product_id` poate fi null, iar combinatia nu
     * apare deloc.
     */
    stoc_rezervat: {
      produse: [...qtyByProduct.entries()].map(([product_id, quantity]) => ({ product_id, quantity })),
      variante: [...qtyByVariant.values()],
    } as never,
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
    const produse = [...qtyByProduct.entries()].map(([product_id, quantity]) => ({ product_id, quantity }));
    const variante = [...qtyByVariant.values()];
    if (produse.length > 0 || variante.length > 0) {
      /*
       * ⚠ `{ error }`, NU `try/catch`.
       *
       * Aici era `try { await admin.rpc(...) } catch { /* best-effort *\/ }`, si
       * `catch` nu prindea NIMIC: clientul Supabase nu arunca la eroare de SQL,
       * intoarce `{ error }`. Deci comanda se crea, stocul ramanea neatins, si
       * nimic nu se vedea nicaieri.
       *
       * NU se refuza nimic: vanzarea s-a facut deja pe marketplace, iar clientul
       * are confirmarea lor. Se scade cat se poate SI SE RAPORTEAZA ce n-a
       * incaput — plafonarea e purtarea corecta aici, tacerea nu era.
       */
      const { data: rez, error } = await admin.rpc("consuma_stoc_marketplace" as never, {
        p_produse: produse, p_variante: variante,
      } as never);
      if (error) {
        await logError({
          action: "trendyol/orders", message: `Stocul NU s-a scazut pentru comanda de marketplace: ${error.message}`,
          details: { orderId, produse, variante }, businessId: ctx.businessId, severity: "critical",
        });
      } else {
        const raspuns = rez as { lipsa?: unknown[]; consumat?: unknown } | null;
        /*
         * `stoc_rezervat` se REscrie cu ce s-a consumat CU ADEVARAT.
         *
         * Pe marketplace se plafoneaza (vanzarea s-a facut deja, n-o putem
         * refuza), deci „cerut" si „luat" chiar difera: o comanda de 2 dintr-o
         * marime care avea 1 consuma 1. Scris cu cererea, anularea ar fi pus
         * inapoi 2 — adica ar fi INVENTAT o bucata. Dovedit pe date sintetice
         * inainte de reparatie: marimea revenea la 2 dintr-un stoc initial de 1.
         */
        if (raspuns?.consumat) {
          const { error: eRez } = await admin.from("orders")
            .update({ stoc_rezervat: raspuns.consumat } as never)
            .eq("id", orderId);
          if (eRez) {
            await logError({
              action: "trendyol/orders", message: `stoc_rezervat NU s-a putut corecta: ${eRez.message}`,
              details: { orderId }, businessId: ctx.businessId, severity: "critical",
            });
          }
        }
        const lipsa = raspuns?.lipsa ?? [];
        if (Array.isArray(lipsa) && lipsa.length > 0) {
          await logError({
            action: "trendyol/orders",
            message: "Comanda de marketplace a cerut mai mult stoc decat exista; s-a scazut cat s-a putut.",
            details: { orderId, lipsa }, businessId: ctx.businessId, severity: "warning",
          });
        }
      }
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
