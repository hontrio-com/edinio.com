import { NextRequest } from "next/server";

/**
 * Lightweight in-memory sliding-window rate limiter.
 *
 * NOTE: state lives per server instance. On serverless this is a best-effort
 * throttle (the effective limit scales with the number of warm instances), not a
 * hard global cap. For strict global limits, back this with Upstash/Vercel KV.
 * It still meaningfully blunts single-instance bursts and abuse of public endpoints.
 */
const buckets = new Map<string, number[]>();

/** Best-effort client IP from a Headers object (works in routes and server actions). */
export function clientIpFromHeaders(h: Headers): string {
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}

export function clientIp(req: NextRequest): string {
  return clientIpFromHeaders(req.headers);
}

/**
 * Returns true if the request is allowed, false if it exceeds `limit` within
 * `windowMs`. Keyed by an arbitrary string (e.g. `${route}:${ip}`).
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  const hits = (buckets.get(key) ?? []).filter((t) => t > cutoff);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);

  // Opportunistic cleanup to bound memory growth.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      const fresh = v.filter((t) => t > cutoff);
      if (fresh.length === 0) buckets.delete(k);
      else buckets.set(k, fresh);
    }
  }
  return true;
}
