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
  AboutYouRejectedProduct,
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

// Fara termen limita, un raspuns care nu mai vine tine functia ocupata pana o
// taie platforma, iar utilizatorul ramane cu rotita invartindu-se. Douazeci de
// secunde e mult peste orice raspuns normal al API-ului.
const TIMEOUT_MS = 20_000;

async function call<T>(
  auth: AboutYouAuth,
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
  path: string,
  body?: unknown,
): Promise<AboutYouResult<T>> {
  if (!auth?.apiKey) return { error: "Cheia API About You lipsește.", status: 0 };
  // O cheie ajunsa aici necriptata sau cu spatii ar produce un 401 pe care nimeni
  // nu l-ar lega de sursa lui. Mai bine spunem exact ce e in neregula.
  const apiKey = auth.apiKey.trim();
  if (apiKey.startsWith("enc.v1.")) {
    return { error: "Cheia API About You a fost citită criptat (eroare internă). Reconectează contul.", status: 0 };
  }
  try {
    const res = await fetch(`${aboutyouBaseUrl(auth.environment)}${path}`, {
      method,
      headers: {
        "X-API-Key": apiKey,
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
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
  } catch (e) {
    const expirat = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return {
      error: expirat ? "About You nu a răspuns la timp. Încearcă din nou." : "Eroare de rețea către About You.",
      status: 0,
    };
  }
}

/**
 * Mesaj pentru comerciant, pornind de la esecul real.
 *
 * Are voie sa arate si textul venit de la About You: fara el, „nu a mers" e tot
 * ce afla omul, iar noi nu avem cum sa aflam mai tarziu ce s-a intamplat.
 */
export function mesajEroare(ce: string, error: string, status: number): string {
  if (status === 401 || status === 403) {
    return "Cheia API About You nu mai este validă sau nu are permisiunile necesare. Reconectează contul.";
  }
  if (status === 429) return "About You a limitat temporar cererile. Încearcă din nou peste un minut.";
  if (status === 0) return error;
  return `${ce} (About You: ${error})`;
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

/*
 * Motivele de respingere au ENDPOINT PROPRIU.
 *
 * `GET /products/` intoarce statusul, dar schema lui (GetProductItemSchema) nu
 * are nici `rejection_reasons`, nici `rejection_message` — campurile alea exista
 * doar aici si in webhookul `product_master.status_updated`. Reconcilierea le
 * citea de pe `/products/`, primea `undefined` si scria peste ele lista goala,
 * la fiecare trecere: comerciantul vedea „respins" fara sa afle vreodata de ce.
 * Limita de rata e mult mai stransa decat la /products/ (50/min fata de 1000).
 */
export function getRejectedProducts(
  auth: AboutYouAuth, params: { style_key?: string; page?: number; per_page?: number } = {},
) {
  const q = new URLSearchParams();
  if (params.style_key) q.set("style_key", params.style_key);
  if (params.page != null) q.set("page", String(params.page));
  if (params.per_page != null) q.set("per_page", String(params.per_page));
  const qs = q.toString();
  return call<{ items: AboutYouRejectedProduct[]; pagination?: Record<string, unknown> }>(
    auth, "GET", `/products/rejected${qs ? `?${qs}` : ""}`);
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

// Anulare / retur pornite din Edinio. Existau in API, dar nu erau folosite:
// comerciantul trebuia sa intre in Seller Center, iar Edinio ramanea cu o comanda
// pe care o credea in lucru.
// ATENTIE la diferenta fata de retur: `CancelOrderItemSchema` cere `{ id }` — un
// articol per intrare — pe cand `ReturnItemSchema` cere `{ order_items, return_tracking_key }`.
export function cancelOrderItems(auth: AboutYouAuth, items: { id: number }[]) {
  return call<AboutYouBatchAck>(auth, "POST", "/orders/cancel", { items });
}
export function getCancelBatchResults(auth: AboutYouAuth, batchRequestId: string) {
  return call<AboutYouBatchResult>(auth, "GET", `/results/cancel-orders?batch_request_id=${encodeURIComponent(batchRequestId)}`);
}
export function returnOrderItems(
  auth: AboutYouAuth, items: { order_items: number[]; return_tracking_key: string }[],
) {
  return call<AboutYouBatchAck>(auth, "POST", "/orders/return", { items });
}
export function getReturnBatchResults(auth: AboutYouAuth, batchRequestId: string) {
  return call<AboutYouBatchResult>(auth, "GET", `/results/return-orders?batch_request_id=${encodeURIComponent(batchRequestId)}`);
}

/*
 * Documentele comenzii: factura si documentul de livrare.
 *
 * Amandouă intorc BINAR (PDF), nu JSON, deci nu trec prin `call()` — acela citeste
 * si interpreteaza corpul. Limita lor e mult mai stransa decat la restul: 10
 * cereri pe minut la facturi.
 *
 * About You e cel care emite factura catre cumparator (el detine checkout-ul si
 * incasarea), iar comerciantul are nevoie de ea pentru contabilitate. Pana acum nu
 * exista nicio cale sa o ia din Edinio.
 */
export async function getOrderDocument(
  auth: AboutYouAuth, orderNumber: string, fel: "invoices" | "delivery-document",
): Promise<AboutYouResult<{ continut: ArrayBuffer; tip: string }>> {
  const apiKey = auth?.apiKey?.trim();
  if (!apiKey) return { error: "Cheia API About You lipsește.", status: 0 };
  if (apiKey.startsWith("enc.v1.")) {
    return { error: "Cheia API About You a fost citită criptat (eroare internă). Reconectează contul.", status: 0 };
  }
  /*
   * ⚠ `delivery_document` cu UNDERSCORE, nu cu cratima.
   *
   * E singura cale din tot API-ul lor care foloseste underscore, iar tabelul lor
   * de limite o listeaza gresit, cu cratima — de acolo pare copiata. Eticheta
   * noastra ramane cu cratima (e valoare de interfata), dar calea reala se ia din
   * tabelul de mai jos. Cu cratima, raspunsul e 404, iar `getAboutYouOrderDocument`
   * traduce 404 in „nu s-a emis inca": o minciuna la fiecare apel.
   */
  const CAI = { invoices: "invoices", "delivery-document": "delivery_document" } as const;
  const cale = `/orders/${encodeURIComponent(orderNumber)}/${CAI[fel]}`;
  try {
    const res = await fetch(`${aboutyouBaseUrl(auth.environment)}${cale}`, {
      method: "GET",
      // Corpul e BINAR, deci nu cerem si nu interpretam JSON — de aceea nu trece
      // prin `call()`.
      headers: { "X-API-Key": apiKey, Accept: "application/pdf" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let detaliu = `HTTP ${res.status}`;
      try {
        const obj = JSON.parse(text) as Record<string, unknown>;
        detaliu = (typeof obj.message === "string" && obj.message)
          || (typeof obj.detail === "string" && obj.detail) || detaliu;
      } catch { /* raspuns nestructurat: ramane codul HTTP */ }
      return { error: detaliu, status: res.status };
    }
    return {
      data: {
        continut: await res.arrayBuffer(),
        tip: res.headers.get("content-type") ?? "application/pdf",
      },
    };
  } catch (e) {
    const expirat = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return {
      error: expirat ? "About You nu a răspuns la timp. Încearcă din nou." : "Eroare de rețea către About You.",
      status: 0,
    };
  }
}

// ── Webhooks (subscription management) ────────────────────────────────────────
/*
 * Introspectia abonamentelor. Existau in specificatie si nu erau folosite: puteam
 * doar sa CREAM si sa STERGEM un abonament, deci nu se putea afla daca cel din baza
 * mai traieste, nici ce evenimente acopera. Un abonament rupt tacea la nesfarsit.
 */
export interface AboutYouWebhookSubscription {
  id?: number | string | null;
  events?: string[];
  url?: string;
  /** Comutatorul LOR de activare. Oprit, abonamentul exista dar nu livreaza nimic. */
  enabled?: boolean;
  description?: string | null;
}
export function listWebhookSubscriptions(auth: AboutYouAuth) {
  return call<AboutYouWebhookSubscription[]>(auth, "GET", "/webhooks/");
}
export function getWebhookSubscription(auth: AboutYouAuth, id: string) {
  return call<AboutYouWebhookSubscription>(auth, "GET", `/webhooks/${encodeURIComponent(id)}`);
}

export function createWebhookSubscription(
  auth: AboutYouAuth,
  body: { events: string[]; url: string; description?: string },
) {
  return call<{ id?: number | string | null; client_secret?: string }>(auth, "POST", "/webhooks/", body);
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
// `per_page` implicit e 20, iar lista reala are peste atat (fiecare curier x
// fiecare tara). Fara el, jumatate din curieri lipseau din dropdown si comanda
// nu se putea expedia cu ei.
export function getCarriers(auth: AboutYouAuth, params: { page?: number; per_page?: number } = {}) {
  const q = new URLSearchParams();
  q.set("per_page", String(params.per_page ?? 100));
  if (params.page != null) q.set("page", String(params.page));
  return call<{ items: AboutYouCarrier[]; pagination?: Record<string, unknown> }>(
    auth, "GET", `/orders/carriers/?${q.toString()}`);
}
