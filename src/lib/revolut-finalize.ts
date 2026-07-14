import type { SupabaseClient } from "@supabase/supabase-js";
import { maybeMarkMailchimpOrderPaid } from "@/lib/mailchimp-sync";
import { maybeMarkBrevoOrderPaid } from "@/lib/brevo-sync";
import { getOrder, toMinor, type RevolutConfig } from "@/lib/revolut";

export type RevolutFinalizeResult =
  | { status: "paid" }
  | { status: "pending" }
  | { status: "failed"; error: string };

/**
 * Confirm a Revolut order and mark the Edinio order paid. Shared by the browser
 * return route and the signed ORDER_COMPLETED webhook, so it is idempotent — the
 * DB write guards with `.neq("payment_status", "paid")`, and re-reading a
 * `completed` order is harmless. With `capture_mode: automatic` a successful
 * payment lands the Revolut order in state `completed` (already captured), so no
 * separate capture is needed.
 */
export async function finalizeRevolutOrder(
  admin: SupabaseClient,
  cfg: RevolutConfig,
  order: { id: string; total: number },
  revolutOrderId: string,
): Promise<RevolutFinalizeResult> {
  const rev = await getOrder(cfg, revolutOrderId);
  if (!rev.ok || !rev.data) {
    return { status: "failed", error: rev.error || "Nu am putut verifica plata la Revolut." };
  }

  const state = String(rev.data.state || "").toLowerCase();

  if (state === "cancelled" || state === "failed") {
    return { status: "failed", error: "Plata nu a fost finalizata la Revolut." };
  }

  // pending | processing | authorised — payment not settled yet. The ORDER_COMPLETED
  // webhook will finalize; the browser lands on the confirmation page meanwhile.
  if (state !== "completed") {
    return { status: "pending" };
  }

  // completed: verify the captured amount matches the order before marking paid.
  const expected = toMinor(Number(order.total) || 0);
  if (typeof rev.data.amount === "number" && rev.data.amount !== expected) {
    console.error("[revolut] amount mismatch:", { orderId: order.id, expected, got: rev.data.amount });
    return { status: "failed", error: "Suma platii nu corespunde comenzii. Te rugam contacteaza magazinul." };
  }

  const { error } = await admin.from("orders")
    .update({
      payment_status: "paid",
      status: "confirmed",
      revolut_order_id: revolutOrderId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id)
    .neq("payment_status", "paid");

  if (!error) {
    void maybeMarkMailchimpOrderPaid(order.id);
    void maybeMarkBrevoOrderPaid(order.id);
  }
  return { status: "paid" };
}
