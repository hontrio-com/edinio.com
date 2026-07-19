// Thin authenticated REST wrapper over the About You Partner API v1.
// Auth: `X-API-Key` header (per-merchant BYO key). Base URL resolved per
// environment (production | sandbox). Everything write-side is async batch:
// POST/PUT return `{ batchRequestId }`, which is polled via `/results/*`.
//
// Responses are JSON; errors are normalised into a single shape so callers can
// branch with `isAboutYouError`. `cache: "no-store"` mirrors the OLX client
// (Vercel Data Cache returned 500s at runtime for small upstream calls).

import { aboutyouBaseUrl } from "./auth";
import type {
  AboutYouAttributeGroup, AboutYouBatchAck, AboutYouBatchResult, AboutYouBrand,
  AboutYouCarrier, AboutYouCategory, AboutYouCountriesResponse, AboutYouEnvironment,
  AboutYouGetProductItem, AboutYouOrder, AboutYouOrderStatus, AboutYouProductItem,
} from "./types";

export interface AboutYouAuth {
  apiKey: string;
  environment?: AboutYouEnvironment;
}

export type AboutYouResult<T> =
  | { data: T }
  | { error: string; status: number; details?: unknown };

export function isAboutYouError<T>(r: AboutYouResult<T>): r is { error: string; status: number; details?: unknown } {
  return "error" in r;
}

async function call<T>(
  auth: AboutYouAuth,
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
  path: string,
  body?: unknown,
): Promise<AboutYouResult<T>> {
  if (!auth?.apiKey) return { error: "Cheia API About You lipsește.", status: 0 };
  try {
    const res = await fetch(`${aboutyouBaseUrl(auth.environment)}${path}`, {
      method,
      headers: {
        "X-API-Key": auth.apiKey,
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    if (res.status === 204) return { data: undefined as T };
    const text = await res.text();
    let json: unknown = {};
    try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
    if (!res.ok) {
      const obj = (json ?? {}) as Record<string, unknown>;
      const detail =
        (typeof obj.message === "string" && obj.message) ||
        (typeof obj.error === "string" && obj.error) ||
        (typeof obj.detail === "string" && obj.detail) ||
        `HTTP ${res.status}`;
      return { error: detail, status: res.status, details: json };
    }
    return { data: json as T };
  } catch {
    return { error: "Eroare de rețea către About You.", status: 0 };
  }
}

// ── Connection test ───────────────────────────────────────────────────────────
// The lightest documented authenticated read: GET the product list. A 2xx means
// the key is valid; 401/403 means it is not.
export async function testConnection(
  auth: AboutYouAuth,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const res = await call<unknown>(auth, "GET", "/products/");
  if (!isAboutYouError(res)) return { ok: true };
  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: "Cheia API About You este invalidă sau nu are permisiuni.", status: res.status };
  }
  if (res.status === 0) {
    return { ok: false, error: "Nu am putut contacta About You. Verifică rețeaua și reîncearcă.", status: 0 };
  }
  return { ok: false, error: res.error || `Eroare About You (HTTP ${res.status}).`, status: res.status };
}

// ── Products (async batch) ────────────────────────────────────────────────────
export function upsertProducts(auth: AboutYouAuth, items: AboutYouProductItem[]) {
  return call<AboutYouBatchAck>(auth, "POST", "/products/", { items });
}
export function getProductBatchResults(auth: AboutYouAuth, batchRequestId: string) {
  return call<AboutYouBatchResult<AboutYouProductItem>>(
    auth, "GET", `/results/products?batch_request_id=${encodeURIComponent(batchRequestId)}`);
}
// Read products back for status reconciliation + rejection reasons.
export function getProducts(
  auth: AboutYouAuth,
  params: { status?: string; style_key?: string; sku?: string; page?: number; per_page?: number } = {},
) {
  const q = new URLSearchParams();
  if (params.status) q.set("status", params.status);
  if (params.style_key) q.set("style_key", params.style_key);
  if (params.sku) q.set("sku", params.sku);
  if (params.page != null) q.set("page", String(params.page));
  if (params.per_page != null) q.set("per_page", String(params.per_page));
  const qs = q.toString();
  return call<{ items: AboutYouGetProductItem[]; pagination?: Record<string, unknown> }>(auth, "GET", `/products/${qs ? `?${qs}` : ""}`);
}

// Update Product Status (and publish). Settable statuses: published | inactive | draft.
export function updateProductStatus(auth: AboutYouAuth, items: { style_key: string; status: "published" | "inactive" | "draft" }[]) {
  return call<AboutYouBatchAck>(auth, "PUT", "/products/status", { items });
}
export function getStatusBatchResults(auth: AboutYouAuth, batchRequestId: string) {
  return call<AboutYouBatchResult>(auth, "GET", `/results/status?batch_request_id=${encodeURIComponent(batchRequestId)}`);
}

// ── Stock & prices (async batch) ──────────────────────────────────────────────
export function updateStock(auth: AboutYouAuth, items: { sku: string; quantity: number; valid_at?: string | null }[]) {
  return call<AboutYouBatchAck>(auth, "PUT", "/products/stocks", { items });
}
export function getStockBatchResults(auth: AboutYouAuth, batchRequestId: string) {
  return call<AboutYouBatchResult>(auth, "GET", `/results/stocks?batch_request_id=${encodeURIComponent(batchRequestId)}`);
}
export function updatePrice(
  auth: AboutYouAuth,
  items: { sku: string; price: { country_code: string; retail_price?: number | null; sale_price?: number | null }; valid_at?: string | null }[],
) {
  return call<AboutYouBatchAck>(auth, "PUT", "/products/prices", { items });
}
export function getPriceBatchResults(auth: AboutYouAuth, batchRequestId: string) {
  return call<AboutYouBatchResult>(auth, "GET", `/results/prices?batch_request_id=${encodeURIComponent(batchRequestId)}`);
}

// ── Orders & shipment ─────────────────────────────────────────────────────────
export function getOrders(
  auth: AboutYouAuth,
  params: { order_number?: string; order_status?: AboutYouOrderStatus; orders_from?: string; orders_to?: string; page?: number; per_page?: number; cursor?: string } = {},
) {
  const q = new URLSearchParams();
  if (params.order_number) q.set("order_number", params.order_number);
  if (params.order_status) q.set("order_status", params.order_status);
  if (params.orders_from) q.set("orders_from", params.orders_from);
  if (params.orders_to) q.set("orders_to", params.orders_to);
  if (params.page != null) q.set("page", String(params.page));
  if (params.per_page != null) q.set("per_page", String(params.per_page));
  if (params.cursor) q.set("cursor", params.cursor);
  const qs = q.toString();
  return call<{ items: AboutYouOrder[]; pagination?: Record<string, unknown> }>(auth, "GET", `/orders/${qs ? `?${qs}` : ""}`);
}
export function shipOrderItems(
  auth: AboutYouAuth,
  items: { order_items: number[]; carrier_key: string; shipment_tracking_key: string; return_tracking_key?: string }[],
) {
  return call<AboutYouBatchAck>(auth, "POST", "/orders/ship", { items });
}
export function getShipBatchResults(auth: AboutYouAuth, batchRequestId: string) {
  return call<AboutYouBatchResult>(auth, "GET", `/results/ship-orders?batch_request_id=${encodeURIComponent(batchRequestId)}`);
}

// ── Webhooks (subscription management) ────────────────────────────────────────
export function createWebhookSubscription(
  auth: AboutYouAuth,
  body: { events: string[]; url: string; description?: string },
) {
  return call<{ id?: string; client_secret?: string }>(auth, "POST", "/webhooks/", body);
}
export function deleteWebhookSubscription(auth: AboutYouAuth, id: string) {
  return call<undefined>(auth, "DELETE", `/webhooks/${encodeURIComponent(id)}`);
}

// ── Nomenclature (countries / brands / categories / attribute groups) ─────────
export function listCountries(auth: AboutYouAuth) {
  return call<AboutYouCountriesResponse>(auth, "GET", "/countries/");
}
export function listBrands(auth: AboutYouAuth) {
  return call<AboutYouBrand[]>(auth, "GET", "/brands/");
}
export function listCategories(
  auth: AboutYouAuth,
  params: { query?: string; parent_category?: number; page?: number; per_page?: number } = {},
) {
  const q = new URLSearchParams();
  if (params.query) q.set("query", params.query);
  if (params.parent_category != null) q.set("parent_category", String(params.parent_category));
  if (params.page != null) q.set("page", String(params.page));
  if (params.per_page != null) q.set("per_page", String(params.per_page));
  const qs = q.toString();
  return call<{ items: AboutYouCategory[]; pagination?: Record<string, unknown> }>(auth, "GET", `/categories/${qs ? `?${qs}` : ""}`);
}
export function listAttributeGroups(auth: AboutYouAuth, categoryId: number) {
  return call<AboutYouAttributeGroup[]>(auth, "GET", `/categories/${categoryId}/attribute-groups`);
}
export function getCarriers(auth: AboutYouAuth) {
  return call<{ items: AboutYouCarrier[]; pagination?: Record<string, unknown> }>(auth, "GET", "/orders/carriers/");
}
