// Trendyol auth helpers. BYO credentials: each merchant generates a SupplierID +
// API Key + API Secret in their Trendyol seller panel (Integration Info) and
// pastes them into Edinio. Auth is HTTP Basic over base64(apiKey:apiSecret); the
// supplierId goes in the URL path. A `User-Agent` header is MANDATORY (missing it
// returns 403). Stage and production are separate hosts with separate credentials.

import type { TrendyolEnvironment } from "./types";

const PROD_BASE = "https://apigw.trendyol.com";
const STAGE_BASE = "https://stageapigw.trendyol.com";

// Base URL per environment. Overridable via env if Trendyol changes hosts.
export function trendyolBaseUrl(env?: TrendyolEnvironment): string {
  const raw = env === "stage"
    ? (process.env.TRENDYOL_STAGE_BASE_URL || STAGE_BASE)
    : (process.env.TRENDYOL_BASE_URL || PROD_BASE);
  return raw.replace(/\/$/, "");
}

// Global kill-switch for the whole integration (default ON; set TRENDYOL_LIVE
// ="false" to hide/disable platform-wide until stage validation is done).
export function trendyolGloballyEnabled(): boolean {
  return process.env.TRENDYOL_LIVE !== "false";
}

// Basic Auth header: base64(apiKey:apiSecret).
export function basicAuthHeader(apiKey: string, apiSecret: string): string {
  return "Basic " + Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
}

// User-Agent: "{sellerId} - {company}". Company alphanumeric, max 30 chars;
// defaults to "SelfIntegration".
export function userAgent(supplierId: string, company?: string): string {
  const c = (company || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 30) || "SelfIntegration";
  return `${supplierId} - ${c}`;
}

// The webhook URL Trendyol POSTs order events to. Must be publicly reachable and
// must NOT contain "Trendyol", "Dolap" or "localhost" (Trendyol rejects such URLs
// at registration) — hence the neutral `/api/ty/webhook` path.
export function trendyolWebhookUrl(): string {
  const base = (process.env.TRENDYOL_WEBHOOK_BASE || process.env.ABOUTYOU_WEBHOOK_BASE || "https://www.edinio.com").replace(/\/$/, "");
  return `${base}/api/ty/webhook`;
}

// Mask a secret for display (never expose the full value to the client).
export function maskSecret(secret: string): string {
  const k = (secret || "").trim();
  if (k.length <= 8) return "••••";
  return `${k.slice(0, 4)}••••${k.slice(-4)}`;
}
