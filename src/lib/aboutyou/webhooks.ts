// About You webhook helpers: subscription event set, signature verification, and
// event handlers. About You returns a `client_secret` when a subscription is
// created; events are signed with it.
//
// SIGNATURE SCHEME: the exact header name + algorithm are confirmed on the sandbox.
// The most likely form is HMAC-SHA256(client_secret, rawBody) as hex, delivered in
// a signature header. We accept a few candidate header names / encodings and
// compare timing-safe. Until confirmed, an event that fails verification is logged
// and IGNORED — we never act on unverified data (safe by default).

import { createHmac, timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

// Subscribe to the full set now so the merchant does not re-subscribe later; order
// events are handled starting in Faza 3.
export const ABOUTYOU_WEBHOOK_EVENTS = [
  "order.created", "order.updated", "order.cancelled", "order.shipped", "order.returned",
  "order_items.shipped", "order_items.cancelled", "order_items.returned",
  "stock.updated", "product_master.status_updated",
];

const SIGNATURE_HEADERS = ["x-signature", "x-aboutyou-signature", "x-scayle-signature", "signature"];

export function readSignatureHeader(headers: Headers): string | null {
  for (const h of SIGNATURE_HEADERS) {
    const v = headers.get(h);
    if (v) return v;
  }
  return null;
}

export function verifyAboutYouSignature(secret: string | undefined | null, signatureHeader: string | null, rawBody: string): boolean {
  if (!secret || !signatureHeader) return false;
  const hex = createHmac("sha256", secret).update(rawBody).digest("hex");
  const candidates = [hex, `sha256=${hex}`];
  return signatureHeader
    .split(/[\s,]+/)
    .filter(Boolean)
    .some((sig) => candidates.some((exp) => {
      const a = Buffer.from(sig);
      const b = Buffer.from(exp);
      if (a.length !== b.length) return false;
      try { return timingSafeEqual(a, b); } catch { return false; }
    }));
}

// stock.updated: reflect About You's stock view onto the local variant so the
// dashboard shows accurate quantities. Tolerant parse (payload shape TBD).
export async function handleStockUpdated(
  admin: SupabaseClient<Database>, businessId: string, payload: unknown,
): Promise<void> {
  const root = (payload ?? {}) as Record<string, unknown>;
  const data = (root.data as Record<string, unknown>) ?? root;
  const sku = typeof data.sku === "string" ? data.sku : undefined;
  const qtyRaw = data.quantity ?? data.stock;
  const qty = typeof qtyRaw === "number" ? qtyRaw : undefined;
  if (!sku || qty == null) return;
  await admin.from("aboutyou_variants")
    .update({ quantity: Math.max(0, Math.round(qty)), updated_at: new Date().toISOString() } as never)
    .eq("business_id", businessId).eq("sku", sku);
}
