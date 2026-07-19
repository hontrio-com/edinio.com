// About You Partner API auth helpers. Unlike OLX (server-side OAuth app), About
// You is BYO API key: each merchant generates a key in their own Seller Center
// (Settings > API Keys) and pastes it into Edinio. There is no server-side client
// id/secret. The key is scoped to the merchant's own seller account.
//
// Environments are fully separate: production and sandbox each have their own key
// and isolated data. The sandbox base URL is not published in the docs, so both
// hosts are overridable via env; production is the documented default.

import type { AboutYouEnvironment } from "./types";

const PROD_BASE = "https://partner.aboutyou.com/api/v1";

// Base URL per environment. Overridable via env so we can point the sandbox at the
// correct host once confirmed, without a code change.
export function aboutyouBaseUrl(env?: AboutYouEnvironment): string {
  const raw = env === "sandbox"
    ? (process.env.ABOUTYOU_SANDBOX_BASE_URL || process.env.ABOUTYOU_BASE_URL || PROD_BASE)
    : (process.env.ABOUTYOU_BASE_URL || PROD_BASE);
  return raw.replace(/\/$/, "");
}

// Global kill-switch for the whole integration. Enabled by default; set
// ABOUTYOU_LIVE="false" in the environment to hide/disable it platform-wide
// (used to gate it off if the sandbox validation surfaces a blocker).
export function aboutyouGloballyEnabled(): boolean {
  return process.env.ABOUTYOU_LIVE !== "false";
}

// The redirect base used when subscribing webhooks (must be publicly reachable).
export function aboutyouWebhookUrl(): string {
  const base = (process.env.ABOUTYOU_WEBHOOK_BASE || process.env.OLX_REDIRECT_BASE || "https://www.edinio.com").replace(/\/$/, "");
  return `${base}/api/aboutyou/webhook`;
}

// Mask a key for display (never expose the full value to the client).
export function maskApiKey(key: string): string {
  const k = (key || "").trim();
  if (k.length <= 8) return "••••";
  return `${k.slice(0, 4)}••••${k.slice(-4)}`;
}
