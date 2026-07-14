import type { SupabaseClient } from "@supabase/supabase-js";
import { maybeMarkMailchimpOrderPaid } from "@/lib/mailchimp-sync";
import { maybeMarkBrevoOrderPaid } from "@/lib/brevo-sync";
import {
  placeOrder, captureOrder, getOmOrder, toMinor,
  type KlarnaConfig, type KlarnaOrderInput,
} from "@/lib/klarna";

export type KlarnaFinalizeResult =
  | { status: "paid" }
  | { status: "pending" }
  | { status: "failed"; error: string };

/**
 * Turn a Klarna authorization into a paid order: place the order, then (on
 * ACCEPTED) capture the full amount immediately and mark the Edinio order paid.
 * Shared by the browser return route and the HPP status_update callback, so it is
 * idempotent — every DB write guards with `.neq("payment_status", "paid")`, and a
 * second call re-using the same (single-use) authorization token fails harmlessly
 * at place_order.
 */
export async function finalizeKlarnaOrder(
  admin: SupabaseClient,
  cfg: KlarnaConfig,
  order: KlarnaOrderInput,
  authToken: string,
  confirmationUrl: string,
): Promise<KlarnaFinalizeResult> {
  // 1) Create the Klarna order-management order from the authorization.
  const placed = await placeOrder(cfg, authToken, order, confirmationUrl);
  if (!placed.ok || !placed.data?.order_id) {
    return { status: "failed", error: placed.error || "Nu am putut finaliza comanda la Klarna." };
  }
  const klarnaOrderId = placed.data.order_id;
  const fraud = placed.data.fraud_status;

  if (fraud === "REJECTED") {
    await admin.from("orders").update({ klarna_order_id: klarnaOrderId }).eq("id", order.id).neq("payment_status", "paid");
    return { status: "failed", error: "Plata a fost respinsa de Klarna." };
  }

  if (fraud === "PENDING") {
    // Klarna is reviewing the purchase — keep the order confirmed but not yet paid.
    await admin.from("orders")
      .update({ klarna_order_id: klarnaOrderId, status: "confirmed", updated_at: new Date().toISOString() })
      .eq("id", order.id)
      .neq("payment_status", "paid");
    return { status: "pending" };
  }

  // fraud === "ACCEPTED": verify the placed amount, then capture in full.
  const expected = toMinor(Number(order.total) || 0);
  const om = await getOmOrder(cfg, klarnaOrderId);
  if (om.ok && typeof om.data?.order_amount === "number" && om.data.order_amount !== expected) {
    console.error("[klarna] amount mismatch:", { orderId: order.id, expected, got: om.data.order_amount });
    return { status: "failed", error: "Suma platii nu corespunde comenzii. Te rugam contacteaza magazinul." };
  }

  const cap = await captureOrder(cfg, klarnaOrderId, expected);
  if (!cap.ok) {
    // Authorized but not captured — store the id, log, and leave the order unpaid.
    await admin.from("orders").update({ klarna_order_id: klarnaOrderId }).eq("id", order.id).neq("payment_status", "paid");
    console.error("[klarna] capture failed:", { orderId: order.id, error: cap.error });
    return { status: "failed", error: cap.error || "Plata a fost autorizata dar nu a putut fi incasata." };
  }

  const { error } = await admin.from("orders")
    .update({ payment_status: "paid", status: "confirmed", klarna_order_id: klarnaOrderId, updated_at: new Date().toISOString() })
    .eq("id", order.id)
    .neq("payment_status", "paid");
  if (!error) {
    void maybeMarkMailchimpOrderPaid(order.id);
    void maybeMarkBrevoOrderPaid(order.id);
  }
  return { status: "paid" };
}
