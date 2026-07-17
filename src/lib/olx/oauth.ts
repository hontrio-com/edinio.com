// OAuth 2.0 for the OLX Partner API (multi-tenant: one Edinio app, many
// merchant OLX accounts). Two grant flows:
//  - authorization_code + refresh_token: per-merchant (required to manage adverts)
//  - client_credentials: config data only (categories, cities) — no user context
//
// CRITICAL (differs from Google): OLX refresh tokens ROTATE — the token
// response may contain a NEW refresh_token, and the old one expires after one
// month. Every refresh must persist the returned tokens back into olx_config,
// otherwise the connection silently dies within a month.

import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { OlxConfig } from "./types";

type Db = SupabaseClient<Database>;

const AUTH_URL = "https://www.olx.ro/oauth/authorize/";
const TOKEN_URL = "https://www.olx.ro/api/open/oauth/token";
const SCOPE = "v2 read write";

function clientId(): string { return process.env.OLX_CLIENT_ID ?? ""; }
function clientSecret(): string { return process.env.OLX_CLIENT_SECRET ?? ""; }

export function redirectUri(): string {
  // MUST match the Callback/Redirect URI registered on developer.olx.ro
  // character-for-character (registered with www — the proxy 301s non-www).
  const base = process.env.OLX_REDIRECT_BASE || "https://www.edinio.com";
  return `${base.replace(/\/$/, "")}/api/olx/oauth/callback`;
}

export function olxConfigured(): boolean {
  return !!(clientId() && clientSecret());
}

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    response_type: "code",
    state,
    scope: SCOPE,
    redirect_uri: redirectUri(),
  });
  return `${AUTH_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

export interface OlxTokens {
  accessToken: string;
  expiresAt: string;          // ISO
  refreshToken: string | null;
}

async function tokenRequest(body: Record<string, string>): Promise<OlxTokens | { error: string; invalidGrant?: boolean }> {
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as TokenResponse;
    if (!res.ok || !data.access_token) {
      return {
        error: data.error_description ?? data.error ?? `HTTP ${res.status}`,
        invalidGrant: data.error === "invalid_grant" || res.status === 400 || res.status === 401,
      };
    }
    const expiresAt = new Date(Date.now() + (Number(data.expires_in) || 86400) * 1000).toISOString();
    return { accessToken: data.access_token, expiresAt, refreshToken: data.refresh_token ?? null };
  } catch {
    return { error: "Eroare de retea la conectarea OLX." };
  }
}

export function exchangeCode(code: string) {
  return tokenRequest({
    grant_type: "authorization_code",
    client_id: clientId(),
    client_secret: clientSecret(),
    code,
    scope: SCOPE,
    // Mandatory here because the auth URL included redirect_uri (must match exactly).
    redirect_uri: redirectUri(),
  });
}

function refreshTokens(refreshToken: string) {
  return tokenRequest({
    grant_type: "refresh_token",
    client_id: clientId(),
    client_secret: clientSecret(),
    refresh_token: refreshToken,
  });
}

// ── Per-merchant token with rotation persistence ────────────────────────────────
// `db` must be able to update store_settings for this business (admin client, or
// the owner's server client). Returns a usable access token, refreshing +
// persisting rotated tokens when needed.
export async function ensureMerchantToken(
  db: Db,
  businessId: string,
  config: OlxConfig,
): Promise<{ token: string; config: OlxConfig } | { error: string; needsReconnect: boolean }> {
  const now = Date.now();
  const exp = config.access_token_expires_at ? Date.parse(config.access_token_expires_at) : 0;
  if (config.access_token && exp > now + 120_000) {
    return { token: config.access_token, config };
  }
  if (!config.refresh_token) return { error: "Contul OLX nu este conectat.", needsReconnect: true };

  const res = await refreshTokens(config.refresh_token);
  if ("error" in res) {
    if (res.invalidGrant) {
      const patched: OlxConfig = { ...config, needs_reconnect: true };
      await persistConfig(db, businessId, patched);
      return { error: "Sesiunea OLX a expirat. Reconecteaza contul OLX.", needsReconnect: true };
    }
    return { error: res.error, needsReconnect: false };
  }

  const patched: OlxConfig = {
    ...config,
    access_token: res.accessToken,
    access_token_expires_at: res.expiresAt,
    // Rotation: keep the new refresh token when one is issued.
    refresh_token: res.refreshToken ?? config.refresh_token,
    token_updated_at: new Date().toISOString(),
    needs_reconnect: false,
  };
  await persistConfig(db, businessId, patched);
  return { token: res.accessToken, config: patched };
}

async function persistConfig(db: Db, businessId: string, config: OlxConfig): Promise<void> {
  try {
    await db
      .from("store_settings")
      .update({ olx_config: config as never, updated_at: new Date().toISOString() })
      .eq("business_id", businessId);
  } catch {
    // best-effort — next call refreshes again
  }
}

// ── App-level token for config data (categories, cities) ────────────────────────
let appToken: { token: string; exp: number } | null = null;

export async function getAppToken(): Promise<string | null> {
  if (appToken && appToken.exp > Date.now() + 60_000) return appToken.token;
  const res = await tokenRequest({
    grant_type: "client_credentials",
    client_id: clientId(),
    client_secret: clientSecret(),
    scope: "v2 read",
  });
  if ("error" in res) return null;
  appToken = { token: res.accessToken, exp: Date.parse(res.expiresAt) };
  return res.accessToken;
}

// ── Signed OAuth `state` — ties the callback to a business + prevents CSRF ──────
function stateSecret(): string {
  return process.env.OLX_CLIENT_SECRET || process.env.CRON_SECRET || "edinio-olx-state";
}

export function signState(businessId: string): string {
  const payload = `${businessId}.${Date.now()}`;
  const sig = crypto.createHmac("sha256", stateSecret()).update(payload).digest("hex").slice(0, 32);
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export function verifyState(state: string): string | null {
  try {
    const [businessId, ts, sig] = Buffer.from(state, "base64url").toString("utf8").split(".");
    if (!businessId || !ts || !sig) return null;
    const expected = crypto.createHmac("sha256", stateSecret()).update(`${businessId}.${ts}`).digest("hex").slice(0, 32);
    if (sig !== expected) return null;
    if (Date.now() - Number(ts) > 15 * 60_000) return null; // 15 min validity
    return businessId;
  } catch {
    return null;
  }
}
