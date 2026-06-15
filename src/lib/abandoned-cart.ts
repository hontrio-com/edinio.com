// Shared (non-"use server") helpers for abandoned-cart capture & recovery.
// Lives outside the actions file so order creation can reuse markCartConverted
// with the admin client already in its scope.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export interface AbandonedCartItem {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  image_url?: string | null;
}

export interface AbandonedProduct {
  name: string;
  quantity: number;
  value: number;
  carts: number;
  image_url: string | null;
}

export interface AbandonedCartRow {
  id: string;
  customer_name: string | null;
  email: string | null;
  phone: string | null;
  items: AbandonedCartItem[];
  item_count: number;
  subtotal: number;
  source: string;
  last_activity_at: string;
  created_at: string;
  recovery_email_sent_at: string | null;
  recovery_sms_sent_at: string | null;
  recovery_count: number;
}

export interface AbandonedCartsData {
  enabled: boolean;
  smsoEnabled: boolean;
  storeUrl: string;
  storeName: string;
  primaryColor: string;
  kpis: {
    abandonedCount: number;
    abandonedValue: number;
    avgCartValue: number;
    abandonRate: number;
    recoveredCount: number;
    recoveredValue: number;
  };
  potentialRevenueThisMonth: number;
  abandonedProducts: AbandonedProduct[];
  carts: AbandonedCartRow[];
}

// How long without activity before an open cart is considered "abandoned".
export const ABANDON_MINUTES = 60;

// Called from order creation (admin client in scope): when an order is placed,
// close any matching open cart so it leaves the "abandoned" set — and counts as
// recovered if a recovery message had been sent. Never throws.
export async function markCartConverted(
  admin: SupabaseClient<Database>,
  businessId: string,
  match: { sessionId?: string | null; email?: string | null; phone?: string | null; orderId: string },
): Promise<void> {
  try {
    const now = new Date().toISOString();
    const patch = { status: "converted", order_id: match.orderId, converted_at: now, updated_at: now };

    let q = admin
      .from("abandoned_carts")
      .update(patch)
      .eq("business_id", businessId)
      .eq("status", "open");

    if (match.sessionId) {
      q = q.eq("session_id", match.sessionId);
    } else if (match.phone) {
      q = q.eq("phone", match.phone);
    } else if (match.email) {
      q = q.eq("email", match.email);
    } else {
      return; // nothing to match on
    }
    await q;
  } catch {
    // Recovery bookkeeping must never break an order.
  }
}

// Default recovery SMS body (editable by the merchant before sending).
export function defaultRecoverySms(opts: { name?: string | null; storeName: string; url: string }): string {
  const first = opts.name?.trim().split(/\s+/)[0];
  const hi = first ? `Salut ${first}! ` : "Salut! ";
  return `${hi}Ai uitat produse in cosul tau la ${opts.storeName}. Finalizeaza comanda aici: ${opts.url}`;
}
