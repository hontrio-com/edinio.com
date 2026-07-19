"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Central auto-invoicing dispatcher. On an order status/payment change it issues
 * exactly ONE automatic invoice, with the highest-priority provider that has
 * auto-invoicing enabled and whose trigger matches the change.
 *
 * Priority: SmartBill → Oblio → fGO. A merchant normally enables auto on just one
 * provider, so priority only decides the rare case where several are enabled. If
 * the order already has an invoice from ANY provider (auto OR manual), nothing
 * happens — we never double-invoice. Fire-and-forget: never throws, never blocks
 * the order update.
 */
export async function maybeAutoInvoice(
  businessId: string,
  orderId: string,
  newStatus: string,
  newPaymentStatus: string,
): Promise<void> {
  try {
    const supabase = await createClient();
    const { data: order } = await supabase
      .from("orders")
      .select("smartbill_invoice_number, oblio_invoice_number, fgo_invoice_number, payment_method, order_source")
      .eq("id", orderId)
      .eq("business_id", businessId)
      .single();
    if (!order) return;

    const o = order as Record<string, unknown>;
    // About You collects payment and invoices the end customer itself, so we never
    // auto-invoice marketplace orders (the merchant invoices About You B2B instead).
    const src = o.order_source as { marketplace?: string } | null;
    if (o.payment_method === "aboutyou" || src?.marketplace === "aboutyou") return;
    if (o.smartbill_invoice_number || o.oblio_invoice_number || o.fgo_invoice_number) return;

    const smartbill = await import("@/lib/actions/smartbill.actions");
    if (await smartbill.maybeAutoGenerateInvoice(businessId, orderId, newStatus, newPaymentStatus)) return;

    const oblio = await import("@/lib/actions/oblio.actions");
    if (await oblio.maybeAutoGenerateInvoice(businessId, orderId, newStatus, newPaymentStatus)) return;

    const fgo = await import("@/lib/actions/fgo.actions");
    if (await fgo.maybeAutoGenerateInvoice(businessId, orderId, newStatus, newPaymentStatus)) return;
  } catch {
    // best-effort; auto-invoicing must never block an order update
  }
}
