/**
 * Revolut Merchant API — Hosted Checkout Page (redirect) flow.
 * Refs: developer.revolut.com/docs/merchant (Create order, Webhooks, Verify the
 * payload signature) + developer.revolut.com/docs/guides/merchant.
 *
 * Revolut Merchant accepts RON in Romania (card, Apple/Google Pay, Revolut Pay),
 * so it plugs into Edinio's RON checkout exactly like the other redirect
 * processors — no multi-currency handling is needed.
 *
 * Auth = `Authorization: Bearer <secret_key>` (the Merchant API Secret key, `sk_…`,
 * from Revolut Business → Merchant → API). SERVER-SIDE ONLY — never sent to the
 * storefront. Amounts are minor units (RON bani). Every request also carries the
 * dated `Revolut-Api-Version` header.
 *
 * Base URL:
 *   prod    https://merchant.revolut.com/api
 *   sandbox https://sandbox-merchant.revolut.com/api
 *
 * Flow (server-side, redirect-based like Klarna/iPay):
 *   createOrder (capture_mode=automatic) → redirect the customer to `checkout_url`
 *   → they pay on Revolut's hosted page → a signed `ORDER_COMPLETED` webhook (and
 *   the browser return) finalize the order. Automatic capture means the order is
 *   settled on payment, so there is NO separate capture call (unlike Klarna).
 */

import { createHmac, timingSafeEqual } from "crypto";

export type RevolutConfig = {
  enabled: boolean;
  /** Revolut Sandbox environment. */
  sandbox: boolean;
  /** Merchant API Secret key (`sk_…`). Server-side only. */
  secret_key: string;
  /** Label shown at checkout — managed via "Metode de plata". */
  title: string;
  /** Auto-registered webhook id (set on connect; used to delete on disconnect). */
  webhook_id?: string;
  /** Webhook signing secret (`wsk_…`) returned at webhook creation. Server-side only. */
  signing_secret?: string;
};

/** The subset of the config the merchant edits in the dashboard (no server secrets). */
export type RevolutConfigInput = {
  enabled: boolean;
  sandbox: boolean;
  secret_key: string;
  title: string;
};

export const REVOLUT_PROD_URL = "https://merchant.revolut.com/api";
export const REVOLUT_SANDBOX_URL = "https://sandbox-merchant.revolut.com/api";

// Dated API version. New enough that Create order returns `checkout_url` for the
// hosted page. Pin here; verify the latest on developer.revolut.com/docs/merchant/api-versions.
export const REVOLUT_API_VERSION = "2026-04-20";

// RON storefront: Revolut settles the RON pocket to the merchant's Business account.
export const REVOLUT_CURRENCY = "RON";

export function revolutBaseUrl(sandbox: boolean): string {
  return sandbox ? REVOLUT_SANDBOX_URL : REVOLUT_PROD_URL;
}

/** Ready to charge at checkout: enabled + a secret key present. */
export function revolutReady(c: RevolutConfig | null | undefined): boolean {
  return !!(c?.enabled && c.secret_key);
}

/** amount → minor units (bani). 12.00 RON ⇒ 1200. */
export function toMinor(amount: number): number {
  return Math.round(Number(amount) * 100);
}

// ── Low-level API call ────────────────────────────────────────────────────────

export type RevolutResult<T> = {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
};

function extractRevolutError(parsed: unknown, status: number): string {
  if (parsed && typeof parsed === "object") {
    const o = parsed as { message?: unknown; code?: unknown; error?: unknown };
    if (typeof o.message === "string" && o.message) return o.message;
    if (typeof o.error === "string" && o.error) return o.error;
    if (typeof o.code === "string" && o.code) return o.code;
  }
  return `Revolut a raspuns cu eroare (HTTP ${status}).`;
}

async function revolutCall<T = Record<string, unknown>>(
  c: Pick<RevolutConfig, "secret_key" | "sandbox">,
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
): Promise<RevolutResult<T>> {
  const url = `${revolutBaseUrl(c.sandbox)}/${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${c.secret_key}`,
        "Revolut-Api-Version": REVOLUT_API_VERSION,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    return { ok: false, status: 0, data: null, error: "Eroare la comunicarea cu Revolut." };
  }
  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try { parsed = JSON.parse(text); } catch { /* 204 / non-JSON body */ }
  }
  if (!res.ok) {
    return { ok: false, status: res.status, data: (parsed as T) ?? null, error: extractRevolutError(parsed, res.status) };
  }
  return { ok: true, status: res.status, data: (parsed as T) ?? null };
}

// ── Orders ────────────────────────────────────────────────────────────────────

export type RevolutOrder = {
  id?: string;
  token?: string;
  /** pending | processing | authorised | completed | cancelled | failed */
  state?: string;
  amount?: number;
  currency?: string;
  /** Hosted checkout page URL — redirect the customer here. */
  checkout_url?: string;
  outstanding_amount?: number;
};

/**
 * POST /api/orders — create an order and get the hosted `checkout_url`.
 * `capture_mode: automatic` settles the payment immediately (no separate capture).
 * `merchant_order_data.ext_ref` carries our order id for traceability; the browser
 * is returned to `redirectUrl` after payment.
 */
export function createOrder(
  c: RevolutConfig,
  params: { amountMinor: number; extRef: string; redirectUrl: string; description?: string },
) {
  return revolutCall<RevolutOrder>(c, "POST", "orders", {
    amount: params.amountMinor,
    currency: REVOLUT_CURRENCY,
    capture_mode: "automatic",
    merchant_order_data: { ext_ref: params.extRef },
    redirect_url: params.redirectUrl,
    ...(params.description ? { description: params.description.slice(0, 1024) } : {}),
  });
}

/** GET /api/orders/{id} — authoritative order state + captured amount. */
export function getOrder(c: RevolutConfig, orderId: string) {
  return revolutCall<RevolutOrder>(c, "GET", `orders/${encodeURIComponent(orderId)}`);
}

/** POST /api/orders/{id}/refund — partial or full refund (minor units). Parity helper. */
export function refundOrder(c: RevolutConfig, orderId: string, amountMinor: number) {
  return revolutCall(c, "POST", `orders/${encodeURIComponent(orderId)}/refund`, {
    amount: amountMinor,
    currency: REVOLUT_CURRENCY,
  });
}

// ── Webhooks (auto-registered per merchant) ───────────────────────────────────

export type RevolutWebhook = {
  id?: string;
  url?: string;
  events?: string[];
  signing_secret?: string;
};

/**
 * POST /api/1.0/webhooks — register the signed webhook. Returns a `signing_secret`
 * (`wsk_…`) used to verify every delivery. We register one per merchant pointing at
 * our shared handler with `?businessId=…`.
 */
export function createWebhook(c: RevolutConfig, url: string, events: string[] = ["ORDER_COMPLETED"]) {
  return revolutCall<RevolutWebhook>(c, "POST", "1.0/webhooks", { url, events });
}

/** DELETE /api/1.0/webhooks/{id} — remove the webhook (on disconnect / key change). */
export function deleteWebhook(c: Pick<RevolutConfig, "secret_key" | "sandbox">, webhookId: string) {
  return revolutCall(c, "DELETE", `1.0/webhooks/${encodeURIComponent(webhookId)}`);
}

/**
 * Verify a Merchant API webhook signature (HMAC-SHA256).
 * payload_to_sign = "v1.{Revolut-Request-Timestamp}.{raw-body}"
 * expected        = "v1=" + hex(HMAC_SHA256(signing_secret, payload_to_sign))
 * The `Revolut-Signature` header may carry several space-separated signatures while
 * a signing secret is being rotated — accept if any matches. The timestamp is bound
 * into the signature (tamper-proof); we do NOT age-check it, so Revolut's retries
 * (up to 3× over 30 min, possibly reusing the original timestamp) are not dropped.
 */
export function verifyWebhookSignature(
  signingSecret: string | undefined | null,
  signatureHeader: string | null,
  timestampHeader: string | null,
  rawBody: string,
): boolean {
  if (!signingSecret || !signatureHeader || !timestampHeader) return false;

  // Replay is harmless here (finalize re-reads the order from Revolut and is
  // idempotent), so we don't reject on timestamp age — only authenticity matters.
  const payloadToSign = `v1.${timestampHeader}.${rawBody}`;
  const expected = "v1=" + createHmac("sha256", signingSecret).update(payloadToSign).digest("hex");
  const expectedBuf = Buffer.from(expected);

  return signatureHeader
    .split(/[\s,]+/)
    .filter(Boolean)
    .some((sig) => {
      const sigBuf = Buffer.from(sig);
      if (sigBuf.length !== expectedBuf.length) return false;
      try { return timingSafeEqual(sigBuf, expectedBuf); } catch { return false; }
    });
}
