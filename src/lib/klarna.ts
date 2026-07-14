/**
 * Klarna Payments — Hosted Payment Page (HPP) flow + Order Management.
 * Refs: docs.klarna.com/acquirer/klarna/api/payments + the official
 * "Klarna Payments for WooCommerce" module (create session / HPP / place order).
 *
 * Klarna supports Romania: purchase_country=RO, purchase_currency=RON,
 * locale=ro-RO (docs.klarna.com/.../puchase-countries-currencies-locales). So it
 * plugs into Edinio's RON checkout exactly like the other redirect processors —
 * no multi-currency handling is needed.
 *
 * Auth = HTTP Basic base64(username:password), the API credentials from the
 * Klarna Merchant Portal (Settings -> API credentials). Amounts are minor units
 * (RON bani). No client-side Klarna SDK is used.
 *
 * Flow (server-side, redirect-based like iPay):
 *   createSession -> createHppSession (redirect_url) -> customer authorizes on
 *   Klarna -> browser returns with authorization_token -> placeOrder (creates the
 *   Klarna OM order) -> captureOrder (settle immediately). A status_update
 *   callback + getHppSession recover the auth token if the customer closes the tab.
 */

export type KlarnaConfig = {
  enabled: boolean;
  /** Klarna "Playground" test environment. */
  sandbox: boolean;
  username: string;
  password: string;
  /** Label shown at checkout — managed via "Metode de plata". */
  title: string;
};

export const KLARNA_PLAYGROUND_URL = "https://api.playground.klarna.com";
export const KLARNA_PRODUCTION_URL = "https://api.klarna.com";

// Romania market (EU region). Klarna requires the consumer country to match the
// currency, so these three move together and are fixed for a RON storefront.
export const KLARNA_PURCHASE_COUNTRY = "RO";
export const KLARNA_CURRENCY = "RON";
export const KLARNA_LOCALE = "ro-RO";

export function klarnaBaseUrl(sandbox: boolean): string {
  return sandbox ? KLARNA_PLAYGROUND_URL : KLARNA_PRODUCTION_URL;
}

export function klarnaReady(c: KlarnaConfig | null | undefined): boolean {
  return !!(c?.enabled && c.username && c.password);
}

function authHeader(c: KlarnaConfig): string {
  return "Basic " + Buffer.from(`${c.username}:${c.password}`).toString("base64");
}

/** amount -> minor units (bani). 12.00 RON => 1200. */
export function toMinor(amount: number): number {
  return Math.round(Number(amount) * 100);
}

// ── Low-level API call ────────────────────────────────────────────────────────

export type KlarnaResult<T> = {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
};

function extractKlarnaError(parsed: unknown, status: number): string {
  if (parsed && typeof parsed === "object") {
    const o = parsed as { error_messages?: unknown; error_code?: unknown };
    if (Array.isArray(o.error_messages) && o.error_messages.length) {
      return o.error_messages.map((m) => String(m)).join(" ");
    }
    if (typeof o.error_code === "string" && o.error_code) return o.error_code;
  }
  return `Klarna a raspuns cu eroare (HTTP ${status}).`;
}

async function klarnaCall<T = Record<string, unknown>>(
  c: KlarnaConfig,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<KlarnaResult<T>> {
  const url = `${klarnaBaseUrl(c.sandbox)}/${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: authHeader(c),
        "Content-Type": "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    return { ok: false, status: 0, data: null, error: "Eroare la comunicarea cu Klarna." };
  }
  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try { parsed = JSON.parse(text); } catch { /* 204 / non-JSON body */ }
  }
  if (!res.ok) {
    return { ok: false, status: res.status, data: (parsed as T) ?? null, error: extractKlarnaError(parsed, res.status) };
  }
  return { ok: true, status: res.status, data: (parsed as T) ?? null };
}

// ── Order object (shared by create-session and place-order) ───────────────────

/** The subset of an `orders` row (+ store VAT flags) needed to build the Klarna order. */
export type KlarnaOrderInput = {
  id: string;
  order_number: string;
  total: number;
  shipping_cost: number;
  discount_amount: number;
  offer_discount_amount: number;
  card_discount_amount: number;
  /** 0 when VAT is disabled for the store. */
  vat_rate: number;
  /** Whether product prices already include VAT (store setting; default true). */
  prices_include_vat?: boolean;
  items: unknown;
  shipping_address: unknown;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string;
};

type OrderItem = { product_id?: string; name?: string; price?: number; quantity?: number };

type KlarnaLine = {
  type: string;
  name: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  tax_rate: number;
  total_tax_amount: number;
};

/** VAT portion of a tax-inclusive (gross) minor amount at a given percent rate. */
function taxOfGross(grossMinor: number, ratePct: number): { tax_rate: number; total_tax_amount: number } {
  if (!ratePct || ratePct <= 0) return { tax_rate: 0, total_tax_amount: 0 };
  return {
    tax_rate: Math.round(ratePct * 100), // 19 => 1900
    total_tax_amount: Math.round((grossMinor * ratePct) / (100 + ratePct)),
  };
}

/** Gross (tax-inclusive) minor amount. If store prices are net, gross-up by the VAT rate. */
function grossMinor(amount: number, ratePct: number, includesVat: boolean): number {
  const gross = includesVat || !ratePct ? amount : amount * (1 + ratePct / 100);
  return toMinor(gross);
}

/**
 * Itemized Klarna order lines from the order (products + shipping + a combined
 * discount line). Amounts are minor units, tax-inclusive (EU). Used for display
 * on the Klarna page; the caller reconciles the sum to `order.total`.
 */
export function buildOrderLines(order: KlarnaOrderInput): KlarnaLine[] {
  const rate = Number(order.vat_rate) || 0;
  const inclusive = order.prices_include_vat !== false;
  const items = Array.isArray(order.items) ? (order.items as OrderItem[]) : [];
  const lines: KlarnaLine[] = [];

  for (const it of items) {
    const qty = Math.max(1, Math.round(Number(it.quantity) || 1));
    const unit = grossMinor(Number(it.price) || 0, rate, inclusive);
    const total = unit * qty;
    lines.push({
      type: "physical",
      name: String(it.name || "Produs").slice(0, 255),
      quantity: qty,
      unit_price: unit,
      total_amount: total,
      ...taxOfGross(total, rate),
    });
  }

  const shipping = grossMinor(Number(order.shipping_cost) || 0, rate, inclusive);
  if (shipping > 0) {
    lines.push({
      type: "shipping_fee",
      name: "Transport",
      quantity: 1,
      unit_price: shipping,
      total_amount: shipping,
      ...taxOfGross(shipping, rate),
    });
  }

  // Promo + offer + card-payment discounts are already subtracted from
  // `orders.total`, so mirror them as a single negative line.
  const discount = toMinor(
    (Number(order.discount_amount) || 0) +
    (Number(order.offer_discount_amount) || 0) +
    (Number(order.card_discount_amount) || 0),
  );
  if (discount > 0) {
    const t = taxOfGross(discount, rate);
    lines.push({
      type: "discount",
      name: "Reducere",
      quantity: 1,
      unit_price: -discount,
      total_amount: -discount,
      tax_rate: t.tax_rate,
      total_tax_amount: -t.total_tax_amount,
    });
  }

  return lines;
}

function splitName(full: string): { given: string; family: string } {
  const parts = String(full || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    const one = parts[0] || "Client";
    return { given: one, family: one }; // Klarna requires both names
  }
  return { given: parts[0], family: parts.slice(1).join(" ") };
}

type Addr = { address?: string; city?: string; county?: string; postal_code?: string; postcode?: string; country?: string };

function buildAddress(order: KlarnaOrderInput) {
  const a = (order.shipping_address && typeof order.shipping_address === "object"
    ? order.shipping_address
    : {}) as Addr;
  const { given, family } = splitName(order.customer_name);
  return {
    given_name: given,
    family_name: family,
    email: order.customer_email || "",
    phone: order.customer_phone || "",
    street_address: a.address || "",
    postal_code: a.postal_code || a.postcode || "",
    city: a.city || "",
    region: a.county || "",
    country: String(a.country || KLARNA_PURCHASE_COUNTRY).toUpperCase().slice(0, 2),
  };
}

/**
 * Full Klarna order object. Guarantees `order_amount === Σ order_lines.total_amount`
 * (Klarna rejects any mismatch): falls back to a single summary line when items are
 * missing, and appends a tiny rounding adjustment line when needed.
 */
export function buildKlarnaOrderObject(order: KlarnaOrderInput, confirmationUrl?: string) {
  const orderAmount = toMinor(Number(order.total) || 0);
  const rate = Number(order.vat_rate) || 0;
  let lines = buildOrderLines(order);
  let sum = lines.reduce((s, l) => s + l.total_amount, 0);

  if (lines.length === 0) {
    const t = taxOfGross(orderAmount, rate);
    lines = [{
      type: "physical",
      name: `Comanda ${order.order_number}`.slice(0, 255),
      quantity: 1,
      unit_price: orderAmount,
      total_amount: orderAmount,
      tax_rate: t.tax_rate,
      total_tax_amount: t.total_tax_amount,
    }];
    sum = orderAmount;
  } else if (sum !== orderAmount) {
    // Reconcile residual rounding drift with a dedicated line so every existing
    // line keeps unit_price * quantity === total_amount.
    const delta = orderAmount - sum;
    lines.push({
      type: delta >= 0 ? "surcharge" : "discount",
      name: "Ajustare",
      quantity: 1,
      unit_price: delta,
      total_amount: delta,
      tax_rate: 0,
      total_tax_amount: 0,
    });
    sum = orderAmount;
  }

  const orderTaxAmount = lines.reduce((s, l) => s + l.total_tax_amount, 0);

  const address = buildAddress(order);
  return {
    purchase_country: KLARNA_PURCHASE_COUNTRY,
    purchase_currency: KLARNA_CURRENCY,
    locale: KLARNA_LOCALE,
    order_amount: orderAmount,
    order_tax_amount: orderTaxAmount,
    order_lines: lines,
    billing_address: address,
    shipping_address: address,
    merchant_reference1: order.order_number,
    merchant_reference2: order.id,
    ...(confirmationUrl ? { merchant_urls: { confirmation: confirmationUrl } } : {}),
  };
}

// ── Payments API ──────────────────────────────────────────────────────────────

export type KlarnaSession = { session_id?: string; client_token?: string };

/** POST /payments/v1/sessions — create a payment session for the order. */
export function createSession(c: KlarnaConfig, order: KlarnaOrderInput) {
  return klarnaCall<KlarnaSession>(c, "POST", "payments/v1/sessions", buildKlarnaOrderObject(order));
}

export type KlarnaHpp = {
  session_id?: string;
  redirect_url?: string;
  distribution_url?: string;
  qr_code_url?: string;
  expires_at?: string;
};

export type KlarnaMerchantUrls = {
  success: string;
  cancel: string;
  back: string;
  failure: string;
  error: string;
  /** Server-to-server callback fired on session status changes. */
  status_update: string;
};

/** POST /hpp/v1/sessions — wrap the payment session in a hosted page. */
export function createHppSession(c: KlarnaConfig, sessionId: string, merchantUrls: KlarnaMerchantUrls) {
  return klarnaCall<KlarnaHpp>(c, "POST", "hpp/v1/sessions", {
    payment_session_url: `${klarnaBaseUrl(c.sandbox)}/payments/v1/sessions/${sessionId}`,
    merchant_urls: merchantUrls,
  });
}

export type KlarnaHppStatus = {
  session_id?: string;
  status?: string; // WAITING | IN_PROGRESS | COMPLETED | FAILED | CANCELLED | ERROR | DISABLED
  authorization_token?: string;
  order_id?: string;
  klarna_reference?: string;
  updated_at?: string;
  expires_at?: string;
};

/** GET /hpp/v1/sessions/{id} — authoritative HPP status (+ auth token when COMPLETED). */
export function getHppSession(c: KlarnaConfig, hppSessionId: string) {
  return klarnaCall<KlarnaHppStatus>(c, "GET", `hpp/v1/sessions/${encodeURIComponent(hppSessionId)}`);
}

export type KlarnaPlaced = {
  order_id?: string;
  redirect_url?: string;
  fraud_status?: "ACCEPTED" | "PENDING" | "REJECTED" | string;
};

/**
 * POST /payments/v1/authorizations/{authorizationToken}/order — turn the
 * authorization into a Klarna OM order. `fraud_status` drives the outcome.
 */
export function placeOrder(c: KlarnaConfig, authorizationToken: string, order: KlarnaOrderInput, confirmationUrl?: string) {
  return klarnaCall<KlarnaPlaced>(
    c,
    "POST",
    `payments/v1/authorizations/${encodeURIComponent(authorizationToken)}/order`,
    buildKlarnaOrderObject(order, confirmationUrl),
  );
}

// ── Order Management API ──────────────────────────────────────────────────────

export type KlarnaOmOrder = {
  order_id?: string;
  status?: string;
  order_amount?: number;
  captured_amount?: number;
  refunded_amount?: number;
  remaining_authorized_amount?: number;
};

/** GET /ordermanagement/v1/orders/{id} — read the placed order (amount verification). */
export function getOmOrder(c: KlarnaConfig, klarnaOrderId: string) {
  return klarnaCall<KlarnaOmOrder>(c, "GET", `ordermanagement/v1/orders/${encodeURIComponent(klarnaOrderId)}`);
}

/**
 * POST /ordermanagement/v1/orders/{id}/captures — settle the order. We capture the
 * full amount immediately (merchant chose "incasare imediata la comanda").
 */
export function captureOrder(c: KlarnaConfig, klarnaOrderId: string, capturedAmountMinor: number) {
  return klarnaCall(c, "POST", `ordermanagement/v1/orders/${encodeURIComponent(klarnaOrderId)}/captures`, {
    captured_amount: capturedAmountMinor,
  });
}

/** POST /ordermanagement/v1/orders/{id}/refunds — partial or full refund (minor units). */
export function refundOrder(c: KlarnaConfig, klarnaOrderId: string, refundedAmountMinor: number) {
  return klarnaCall(c, "POST", `ordermanagement/v1/orders/${encodeURIComponent(klarnaOrderId)}/refunds`, {
    refunded_amount: refundedAmountMinor,
  });
}

/** Map a DB `orders` row (+ store `prices_include_vat`) to the Klarna order input. */
export function toKlarnaOrderInput(order: Record<string, unknown>, pricesIncludeVat: boolean): KlarnaOrderInput {
  return {
    id: String(order.id ?? ""),
    order_number: String(order.order_number ?? ""),
    total: Number(order.total) || 0,
    shipping_cost: Number(order.shipping_cost) || 0,
    discount_amount: Number(order.discount_amount) || 0,
    offer_discount_amount: Number(order.offer_discount_amount) || 0,
    card_discount_amount: Number(order.card_discount_amount) || 0,
    vat_rate: Number(order.vat_rate) || 0,
    prices_include_vat: pricesIncludeVat,
    items: order.items,
    shipping_address: order.shipping_address,
    customer_name: String(order.customer_name ?? ""),
    customer_email: (order.customer_email as string | null) ?? null,
    customer_phone: String(order.customer_phone ?? ""),
  };
}
