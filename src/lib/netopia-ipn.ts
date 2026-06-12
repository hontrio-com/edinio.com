import { createHmac, timingSafeEqual } from "crypto";

/**
 * Authentication for Netopia IPN (server-to-server payment notifications).
 *
 * The IPN endpoint is public and Netopia's v2 JSON IPN carries no shared secret
 * we control, so we bind a signed token to the notify URL at payment-start time.
 * Netopia calls back the exact notify URL we registered (query string included),
 * which lets us verify the callback genuinely corresponds to a payment we started
 * for that order — a spoofed POST cannot forge the token without the server secret.
 *
 * The signing key falls back to SUPABASE_SERVICE_ROLE_KEY so the protection works
 * with no extra configuration; set NETOPIA_IPN_SECRET to use a dedicated secret.
 */
function ipnSecret(): string {
  return process.env.NETOPIA_IPN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

export function signNetopiaIpn(orderId: string): string {
  return createHmac("sha256", ipnSecret()).update(orderId).digest("base64url");
}

export function verifyNetopiaIpn(orderId: string, token: string | null | undefined): boolean {
  if (!token || !orderId) return false;
  const expected = Buffer.from(signNetopiaIpn(orderId));
  const provided = Buffer.from(token);
  if (expected.length !== provided.length) return false;
  try {
    return timingSafeEqual(expected, provided);
  } catch {
    return false;
  }
}
