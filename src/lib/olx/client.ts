// Thin authenticated REST wrapper over the OLX Partner API v2.
// Base: https://www.olx.ro/api/partner — every call needs `Version: 2.0` +
// `Authorization: Bearer`. Most responses are wrapped in `{ data: ... }`, some
// nomenclature endpoints return bare arrays — unwrap both.

import type {
  OlxAccountBalance, OlxAdvert, OlxAttributeDef, OlxBoughtPacket, OlxCategory,
  OlxCategorySuggestion, OlxCity, OlxDistrict, OlxMessage, OlxPacket,
  OlxPaidFeature, OlxPaymentMethod, OlxThread, OlxUser,
} from "./types";

const BASE = "https://www.olx.ro/api/partner";

export interface OlxValidationIssue { field?: string; title?: string; detail?: string }
export type OlxResult<T> =
  | { data: T }
  | { error: string; status: number; validation?: OlxValidationIssue[] };

export function isOlxError<T>(r: OlxResult<T>): r is { error: string; status: number; validation?: OlxValidationIssue[] } {
  return "error" in r;
}

async function call<T>(
  token: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<OlxResult<T>> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Version: "2.0",
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      // Nomenclatoare mici pe Vercel = no-store (Data Cache dadea 500 la runtime).
      cache: "no-store",
    });
    if (res.status === 204) return { data: undefined as T };
    const text = await res.text();
    let json: unknown = {};
    try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
    if (!res.ok) {
      const err = (json as { error?: { title?: string; detail?: string; validation?: OlxValidationIssue[] } })?.error;
      const validation = Array.isArray(err?.validation) ? err.validation : undefined;
      const detail = err?.detail ?? err?.title ?? `HTTP ${res.status}`;
      const msg = validation?.length
        ? `${detail}: ${validation.map((v) => v.detail ?? v.title ?? v.field).filter(Boolean).join("; ")}`
        : detail;
      return { error: msg, status: res.status, validation };
    }
    const unwrapped = (json !== null && typeof json === "object" && "data" in (json as Record<string, unknown>))
      ? (json as { data: T }).data
      : (json as T);
    return { data: unwrapped };
  } catch {
    return { error: "Eroare de retea catre OLX.", status: 0 };
  }
}

// ── Users ───────────────────────────────────────────────────────────────────────
export function getMe(token: string) {
  return call<OlxUser>(token, "GET", "/users/me");
}

export function getUser(token: string, userId: number) {
  return call<OlxUser>(token, "GET", `/users/${userId}`);
}

export function getAccountBalance(token: string) {
  return call<OlxAccountBalance>(token, "GET", "/users/me/account-balance");
}

export function getPaymentMethods(token: string) {
  return call<OlxPaymentMethod[]>(token, "GET", "/users/me/payment-methods");
}

// ── Adverts ─────────────────────────────────────────────────────────────────────
export function listAdverts(token: string, params: { offset?: number; limit?: number; external_id?: string } = {}) {
  const q = new URLSearchParams();
  if (params.offset != null) q.set("offset", String(params.offset));
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.external_id) q.set("external_id", params.external_id);
  const qs = q.toString();
  return call<OlxAdvert[]>(token, "GET", `/adverts${qs ? `?${qs}` : ""}`);
}

export function getAdvert(token: string, advertId: number) {
  return call<OlxAdvert>(token, "GET", `/adverts/${advertId}`);
}

export function createAdvert(token: string, body: Record<string, unknown>) {
  return call<OlxAdvert>(token, "POST", "/adverts", body);
}

export function updateAdvert(token: string, advertId: number, body: Record<string, unknown>) {
  return call<OlxAdvert>(token, "PUT", `/adverts/${advertId}`, body);
}

// Advert MUST NOT be `active` — deactivate first.
export function deleteAdvert(token: string, advertId: number) {
  return call<undefined>(token, "DELETE", `/adverts/${advertId}`);
}

// `is_success` is required by the API for the `deactivate` command.
export function advertCommand(token: string, advertId: number, command: "activate" | "deactivate" | "finish" | "extend") {
  const body: Record<string, unknown> = { command };
  if (command === "deactivate") body.is_success = true;
  return call<undefined>(token, "POST", `/adverts/${advertId}/commands`, body);
}

// ── Categories & attributes ─────────────────────────────────────────────────────
export function getCategories(token: string, parentId?: number) {
  return call<OlxCategory[]>(token, "GET", `/categories${parentId != null ? `?parent_id=${parentId}` : ""}`);
}

export function getCategory(token: string, categoryId: number) {
  return call<OlxCategory>(token, "GET", `/categories/${categoryId}`);
}

export function getCategoryAttributes(token: string, categoryId: number) {
  return call<OlxAttributeDef[]>(token, "GET", `/categories/${categoryId}/attributes`);
}

export function suggestCategories(token: string, q: string) {
  return call<OlxCategorySuggestion[]>(token, "GET", `/categories/suggestion?q=${encodeURIComponent(q)}`);
}

// ── Cities & districts ──────────────────────────────────────────────────────────
export function getCities(token: string, offset: number, limit: number) {
  return call<OlxCity[]>(token, "GET", `/cities?offset=${offset}&limit=${limit}`);
}

export function getCityDistricts(token: string, cityId: number) {
  return call<OlxDistrict[]>(token, "GET", `/cities/${cityId}/districts`);
}

// ── Packets & paid features (monetization) ──────────────────────────────────────
export function getAvailablePackets(token: string, params: { category_id?: number; payment_method?: OlxPaymentMethod; type?: "base" | "all" } = {}) {
  const q = new URLSearchParams();
  if (params.category_id != null) q.set("category_id", String(params.category_id));
  if (params.payment_method) q.set("payment_method", params.payment_method);
  if (params.type) q.set("type", params.type);
  const qs = q.toString();
  return call<OlxPacket[]>(token, "GET", `/packets${qs ? `?${qs}` : ""}`);
}

export function getBoughtPackets(token: string, availability?: "active" | "inactive") {
  const qs = availability ? `?availability=${availability}` : "";
  return call<OlxBoughtPacket[]>(token, "GET", `/users/me/packets${qs}`);
}

// Packet for a whole category. `size` must match an available packet variant.
export function purchaseCategoryPacket(
  token: string,
  body: { category_id: number; size: number; payment_method: OlxPaymentMethod; type?: "base" | "mega" },
) {
  return call<undefined>(token, "POST", "/users/me/packets", body);
}

// Packet for a single advert (used to activate a `limited` advert).
export function purchaseAdvertPacket(
  token: string,
  advertId: number,
  body: { payment_method: OlxPaymentMethod; is_premium?: boolean },
) {
  return call<undefined>(token, "POST", `/adverts/${advertId}/packets`, body);
}

export function getPaidFeatures(token: string) {
  return call<OlxPaidFeature[]>(token, "GET", "/paid-features");
}

export function getAdvertPaidFeatures(token: string, advertId: number) {
  return call<OlxPaidFeature[]>(token, "GET", `/adverts/${advertId}/paid-features`);
}

export function purchasePaidFeature(
  token: string,
  advertId: number,
  body: { code: string; payment_method: OlxPaymentMethod },
) {
  return call<undefined>(token, "POST", `/adverts/${advertId}/paid-features`, body);
}

// ── Threads & messages (buyer leads) ────────────────────────────────────────────
export function getThreads(token: string, params: { offset?: number; limit?: number; advert_id?: number } = {}) {
  const q = new URLSearchParams();
  if (params.offset != null) q.set("offset", String(params.offset));
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.advert_id != null) q.set("advert_id", String(params.advert_id));
  const qs = q.toString();
  return call<OlxThread[]>(token, "GET", `/threads${qs ? `?${qs}` : ""}`);
}

export function getThreadMessages(token: string, threadId: number) {
  return call<OlxMessage[]>(token, "GET", `/threads/${threadId}/messages`);
}

export function postThreadMessage(token: string, threadId: number, text: string) {
  return call<undefined>(token, "POST", `/threads/${threadId}/messages`, { text });
}

export function markThreadRead(token: string, threadId: number) {
  return call<undefined>(token, "POST", `/threads/${threadId}/commands`, { command: "mark-as-read" });
}
