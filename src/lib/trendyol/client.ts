// Thin authenticated REST wrapper over the Trendyol Partner API v3.0.
// Auth: HTTP Basic (base64 apiKey:apiSecret) + mandatory User-Agent header;
// supplierId is part of the URL path. Base URL resolved per environment
// (stage | production). Write-side is async batch (POST -> { batchRequestId },
// polled via the batch-requests endpoint).
//
// Errors are normalised into a single shape so callers branch with
// `isTrendyolError`. `cache: "no-store"` (Vercel Data Cache returned 500s at
// runtime for small upstream calls in the OLX/About You clients).

import { basicAuthHeader, trendyolBaseUrl, userAgent } from "./auth";
import type {
  TrendyolBatchAck, TrendyolBatchResult, TrendyolBrand, TrendyolCategory,
  TrendyolCategoryAttribute, TrendyolEnvironment, TrendyolProductItem, TrendyolShipmentPackage,
  TrendyolSupplierAddresses,
} from "./types";

export interface TrendyolAuth {
  supplierId: string;
  apiKey: string;
  apiSecret: string;
  environment?: TrendyolEnvironment;
  userAgentCompany?: string;
}

export type TrendyolResult<T> =
  | { data: T }
  | { error: string; status: number; details?: unknown };

export function isTrendyolError<T>(r: TrendyolResult<T>): r is { error: string; status: number; details?: unknown } {
  return "error" in r;
}

async function call<T>(
  auth: TrendyolAuth,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<TrendyolResult<T>> {
  if (!auth?.apiKey || !auth?.apiSecret || !auth?.supplierId) {
    return { error: "Credențialele Trendyol lipsesc.", status: 0 };
  }
  try {
    const res = await fetch(`${trendyolBaseUrl(auth.environment)}${path}`, {
      method,
      headers: {
        Authorization: basicAuthHeader(auth.apiKey, auth.apiSecret),
        "User-Agent": userAgent(auth.supplierId, auth.userAgentCompany),
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
      const obj = (json ?? {}) as { errors?: { message?: string }[]; message?: string; exception?: string };
      const detail =
        (Array.isArray(obj.errors) && obj.errors[0]?.message) ||
        (typeof obj.message === "string" && obj.message) ||
        (typeof obj.exception === "string" && obj.exception) ||
        `HTTP ${res.status}`;
      return { error: detail, status: res.status, details: json };
    }
    return { data: json as T };
  } catch {
    return { error: "Eroare de rețea către Trendyol.", status: 0 };
  }
}

// ── Connection test ───────────────────────────────────────────────────────────
// getSuppliersAddresses is seller-scoped, lightweight, and validates supplierId +
// Basic auth together; the addresses are also needed for product creation.
export async function testConnection(
  auth: TrendyolAuth,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const res = await getSupplierAddresses(auth);
  if (!isTrendyolError(res)) return { ok: true };
  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: "Credențiale Trendyol invalide (SupplierID / API Key / API Secret).", status: res.status };
  }
  if (res.status === 0) {
    return { ok: false, error: "Nu am putut contacta Trendyol. Verifică rețeaua și reîncearcă.", status: 0 };
  }
  return { ok: false, error: res.error || `Eroare Trendyol (HTTP ${res.status}).`, status: res.status };
}

// ── Seller info / nomenclature ────────────────────────────────────────────────
export function getSupplierAddresses(auth: TrendyolAuth) {
  return call<TrendyolSupplierAddresses>(auth, "GET", `/integration/sellers/${auth.supplierId}/addresses`);
}
export function getCategoryTree(auth: TrendyolAuth) {
  return call<{ categories: TrendyolCategory[] } | TrendyolCategory[]>(auth, "GET", "/integration/product/product-categories");
}
export function getCategoryAttributes(auth: TrendyolAuth, categoryId: number) {
  return call<{ categoryAttributes: TrendyolCategoryAttribute[] }>(auth, "GET", `/integration/product/categories/${categoryId}/attributes`);
}
// Attribute values for a category attribute (fetched separately — NOT inline in
// getCategoryAttributes). page/size up to 1000.
export function getCategoryAttributeValues(auth: TrendyolAuth, categoryId: number, attributeId: number, page = 0, size = 1000) {
  return call<{ content: { attributeValueId: number; attributeValue: string }[]; totalElements?: number }>(
    auth, "GET", `/integration/product/categories/${categoryId}/attributes/${attributeId}/values?page=${page}&size=${size}`);
}

// Brands (min 1000/page). by-name is case-sensitive.
export function getBrands(auth: TrendyolAuth, page = 0, size = 1000) {
  return call<{ brands: TrendyolBrand[] }>(auth, "GET", `/integration/product/brands?page=${page}&size=${size}`);
}
export function getBrandsByName(auth: TrendyolAuth, name: string) {
  return call<{ brands: TrendyolBrand[] }>(auth, "GET", `/integration/product/brands/by-name?name=${encodeURIComponent(name)}`);
}

// Approved products (stock/price). Presence of a productMainId here => approved;
// used to reconcile listing approval status after batch success.
export function getApprovedProducts(
  auth: TrendyolAuth,
  params: { page?: number; size?: number; productMainId?: string; barcode?: string; status?: string } = {},
) {
  const q = new URLSearchParams();
  if (params.page != null) q.set("page", String(params.page));
  if (params.size != null) q.set("size", String(params.size));
  if (params.productMainId) q.set("productMainId", params.productMainId);
  if (params.barcode) q.set("barcode", params.barcode);
  if (params.status) q.set("status", params.status);
  const qs = q.toString();
  return call<{ content: { productMainId?: string; contentId?: number; variants?: { barcode?: string; quantity?: number; salePrice?: number; listPrice?: number }[] }[]; totalElements?: number; totalPages?: number }>(
    auth, "GET", `/integration/product/sellers/${auth.supplierId}/products/approved/inventory-and-price${qs ? `?${qs}` : ""}`);
}

// ── Products (async batch) ────────────────────────────────────────────────────
export function createProducts(auth: TrendyolAuth, items: TrendyolProductItem[]) {
  return call<TrendyolBatchAck>(auth, "POST", `/integration/product/sellers/${auth.supplierId}/v2/products`, { items });
}
export function getBatchResult(auth: TrendyolAuth, batchRequestId: string) {
  return call<TrendyolBatchResult<{ product?: { barcode?: string } }>>(
    auth, "GET", `/integration/product/sellers/${auth.supplierId}/products/batch-requests/${encodeURIComponent(batchRequestId)}`);
}

// ── Price & inventory (async batch) ───────────────────────────────────────────
export function updatePriceInventory(
  auth: TrendyolAuth,
  items: { barcode: string; quantity: number; salePrice: number; listPrice: number }[],
) {
  return call<TrendyolBatchAck>(auth, "POST", `/integration/inventory/sellers/${auth.supplierId}/products/price-and-inventory`, { items });
}

// ── Orders (shipment packages) & fulfillment ──────────────────────────────────
export function getOrders(
  auth: TrendyolAuth,
  params: { status?: string; startDate?: number; endDate?: number; page?: number; size?: number; orderNumber?: string; orderByField?: string; orderByDirection?: string } = {},
) {
  const q = new URLSearchParams();
  if (params.status) q.set("status", params.status);
  if (params.startDate != null) q.set("startDate", String(params.startDate));
  if (params.endDate != null) q.set("endDate", String(params.endDate));
  if (params.page != null) q.set("page", String(params.page));
  if (params.size != null) q.set("size", String(params.size));
  if (params.orderNumber) q.set("orderNumber", params.orderNumber);
  if (params.orderByField) q.set("orderByField", params.orderByField);
  if (params.orderByDirection) q.set("orderByDirection", params.orderByDirection);
  const qs = q.toString();
  return call<{ content: TrendyolShipmentPackage[]; totalElements?: number; totalPages?: number; page?: number; size?: number }>(
    auth, "GET", `/integration/order/sellers/${auth.supplierId}/orders${qs ? `?${qs}` : ""}`);
}
// Move a package Picking -> Invoiced. Trendyol's contracted cargo handles the
// actual shipment (tracking is assigned by Trendyol).
export function updatePackage(
  auth: TrendyolAuth,
  packageId: number,
  body: { lines: { lineId: number; quantity: number }[]; params?: Record<string, unknown>; status: "Picking" | "Invoiced" },
) {
  return call<undefined>(auth, "PUT", `/integration/order/sellers/${auth.supplierId}/shipment-packages/${packageId}`, body);
}

// ── Webhooks ──────────────────────────────────────────────────────────────────
export function createWebhook(
  auth: TrendyolAuth,
  body: { url: string; authenticationType: "BASIC_AUTHENTICATION" | "API_KEY"; username?: string; password?: string; apiKey?: string; subscribedStatuses?: string[] },
) {
  return call<{ id?: string }>(auth, "POST", `/integration/webhook/sellers/${auth.supplierId}/webhooks`, body);
}
export function deleteWebhook(auth: TrendyolAuth, webhookId: string) {
  return call<undefined>(auth, "DELETE", `/integration/webhook/sellers/${auth.supplierId}/webhooks/${encodeURIComponent(webhookId)}`);
}
export function getWebhooks(auth: TrendyolAuth) {
  return call<{ id?: string; url?: string }[]>(auth, "GET", `/integration/webhook/sellers/${auth.supplierId}/webhooks`);
}
