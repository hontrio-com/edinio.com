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
  automation: AbandonedAutomationConfig;
  isPremium: boolean;
  discounts: { code: string; type: string; value: number }[];
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

// Standard recovery message templates (with {nume}/{magazin} placeholders that are
// filled in per customer). Shown pre-filled in the UI so the merchant sees exactly
// what will be sent, and editable.
export const STANDARD_SMS_TEMPLATE = "Salut {nume}! Ai uitat produse in cosul tau la {magazin}. Finalizeaza comanda mai jos.";
export const STANDARD_EMAIL_TEMPLATE = "Buna {nume}! Ai lasat cateva produse in cosul tau la {magazin}. Le-am pastrat pentru tine, finalizeaza comanda inainte sa se epuizeze.";

export function standardRecoveryTemplate(channel: RecoveryChannel): string {
  return channel === "sms" ? STANDARD_SMS_TEMPLATE : STANDARD_EMAIL_TEMPLATE;
}

// Fill {nume}/{magazin} and tidy up spacing/punctuation if the name is empty.
export function interpolateRecoveryMessage(tpl: string, opts: { name?: string | null; store: string }): string {
  const first = opts.name?.trim().split(/\s+/)[0] ?? "";
  return tpl
    .replace(/\{nume\}/gi, first)
    .replace(/\{magazin\}/gi, opts.store)
    .replace(/\s+([!,.?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Default recovery SMS body (editable by the merchant before sending).
export function defaultRecoverySms(opts: { name?: string | null; storeName: string; url: string; code?: string | null }): string {
  const first = opts.name?.trim().split(/\s+/)[0];
  const hi = first ? `Salut ${first}! ` : "Salut! ";
  const codePart = opts.code ? ` Foloseste codul ${opts.code} pentru reducere.` : "";
  return `${hi}Ai uitat produse in cosul tau la ${opts.storeName}.${codePart} Finalizeaza comanda aici: ${opts.url}`;
}

// ── Automations ────────────────────────────────────────────────────────────────
export type RecoveryChannel = "email" | "sms";

export interface AbandonedAutomationStep {
  id: string;
  delay_hours: number;
  channel: RecoveryChannel;
  message?: string;
  discount_code?: string;
}

export interface AbandonedAutomationConfig {
  enabled: boolean;
  min_cart_value: number | null;
  quiet_hours: { start: number; end: number } | null; // hours 0-23
  steps: AbandonedAutomationStep[];
}

// Parse + sanitize a raw automation config from store_settings.
export function readAutomationConfig(raw: unknown): AbandonedAutomationConfig {
  const c = (raw ?? {}) as Partial<AbandonedAutomationConfig>;
  const steps = Array.isArray(c.steps) ? c.steps : [];
  const qh = c.quiet_hours;
  return {
    enabled: c.enabled === true,
    min_cart_value: typeof c.min_cart_value === "number" && c.min_cart_value > 0 ? c.min_cart_value : null,
    quiet_hours: qh && typeof qh.start === "number" && typeof qh.end === "number"
      ? { start: clampHour(qh.start), end: clampHour(qh.end) } : null,
    steps: steps
      .filter((s): s is AbandonedAutomationStep => !!s && (s.channel === "email" || s.channel === "sms"))
      .map((s) => ({
        id: String(s.id ?? Math.random().toString(36).slice(2)),
        delay_hours: Math.max(0, Number(s.delay_hours) || 0),
        channel: s.channel,
        message: typeof s.message === "string" && s.message.trim() ? s.message.trim() : undefined,
        discount_code: typeof s.discount_code === "string" && s.discount_code.trim() ? s.discount_code.trim() : undefined,
      })),
  };
}

function clampHour(h: number): number {
  return Math.min(23, Math.max(0, Math.floor(h)));
}

// Is `hour` within quiet hours? Handles ranges that wrap past midnight.
export function isQuietHour(quiet: { start: number; end: number } | null, hour: number): boolean {
  if (!quiet || quiet.start === quiet.end) return false;
  return quiet.start < quiet.end
    ? hour >= quiet.start && hour < quiet.end
    : hour >= quiet.start || hour < quiet.end;
}

// Build the "restore cart" link: opening it rebuilds the customer's cart and
// jumps to checkout (handled on the storefront), optionally pre-applying a code.
export function buildRecoverUrl(storeUrl: string, cartId: string, discountCode?: string | null): string {
  try {
    const u = new URL(storeUrl);
    u.searchParams.set("recover", cartId);
    if (discountCode) u.searchParams.set("code", discountCode);
    return u.toString();
  } catch {
    const sep = storeUrl.includes("?") ? "&" : "?";
    return `${storeUrl}${sep}recover=${encodeURIComponent(cartId)}${discountCode ? `&code=${encodeURIComponent(discountCode)}` : ""}`;
  }
}
