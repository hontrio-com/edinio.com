// Google OAuth 2.0 for the Merchant API (multi-tenant: one Edinio app, many
// merchant accounts). Scope `content` lets us manage the merchant's Merchant
// Center account on their behalf. We store the refresh token per store.

import crypto from "node:crypto";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CONTENT_SCOPE = "https://www.googleapis.com/auth/content";

function clientId(): string { return process.env.GOOGLE_MERCHANT_CLIENT_ID ?? ""; }
function clientSecret(): string { return process.env.GOOGLE_MERCHANT_CLIENT_SECRET ?? ""; }

export function redirectUri(): string {
  // Canonical www host (the proxy 301-redirects non-www -> www, and Google OAuth
  // redirect URIs must resolve without a redirect). Override only if needed.
  const base = process.env.GOOGLE_MERCHANT_REDIRECT_BASE || "https://www.edinio.com";
  return `${base.replace(/\/$/, "")}/api/google-merchant/oauth/callback`;
}

export function googleMerchantConfigured(): boolean {
  return !!(clientId() && clientSecret());
}

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: `openid email ${CONTENT_SCOPE}`,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

export async function exchangeCode(
  code: string,
): Promise<{ accessToken: string; refreshToken: string | null; email: string | null } | { error: string }> {
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId(),
        client_secret: clientSecret(),
        redirect_uri: redirectUri(),
        grant_type: "authorization_code",
      }),
    });
    const data = (await res.json()) as TokenResponse;
    if (!res.ok || !data.access_token) {
      return { error: data.error_description ?? data.error ?? "Schimbul de token a esuat." };
    }
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      email: decodeEmail(data.id_token),
    };
  } catch {
    return { error: "Eroare de retea la conectarea Google." };
  }
}

// Short-lived in-process cache (best-effort across a warm lambda).
const tokenCache = new Map<string, { token: string; exp: number }>();

export async function getAccessToken(refreshToken: string): Promise<string | null> {
  const cached = tokenCache.get(refreshToken);
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId(),
        client_secret: clientSecret(),
        grant_type: "refresh_token",
      }),
    });
    const data = (await res.json()) as TokenResponse;
    if (!res.ok || !data.access_token) return null;
    tokenCache.set(refreshToken, { token: data.access_token, exp: Date.now() + (Number(data.expires_in) || 3600) * 1000 });
    return data.access_token;
  } catch {
    return null;
  }
}

// Signed OAuth `state` — ties the callback to a business + prevents forgery/CSRF.
function stateSecret(): string {
  return process.env.GOOGLE_MERCHANT_CLIENT_SECRET || process.env.CRON_SECRET || "edinio-gmc-state";
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

function decodeEmail(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64").toString("utf8"));
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}
