export type MarketingConfig = {
  facebook_pixel_id?: string;
  tiktok_pixel_id?: string;
  google_tag_id?: string;
  google_ads_conversion_label?: string; // e.g. "abc123XYZ" — needed for Purchase conversion tracking in Google Ads
};

// ─────────────────────────────────────────────────────────────────────────
// ID parsing & validation (isomorphic — also used server-side on save).
// Merchants frequently paste the ENTIRE base-code snippet instead of the bare
// ID, so we extract the ID from a known snippet shape before validating.
// Validation is also a security control: the raw value is interpolated into an
// inline <script> on the storefront (shared edinio.com origin), so an
// unsanitized value would be a stored-XSS / cross-tenant vector.
// ─────────────────────────────────────────────────────────────────────────

/** Meta/Facebook pixel ID — 15–16 digit numeric (accept 5–20 for safety). */
export function parseMetaPixelId(raw?: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/fbq\(\s*['"]init['"]\s*,\s*['"](\d{5,20})['"]/);
  const c = (m ? m[1] : raw).trim();
  return /^\d{5,20}$/.test(c) ? c : null;
}

/** TikTok pixel ID — alphanumeric, typically 20 chars (e.g. "C4ABCDEF..."). */
export function parseTikTokPixelId(raw?: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/ttq\.load\(\s*['"]([A-Za-z0-9]{6,40})['"]/);
  const c = (m ? m[1] : raw).trim();
  return /^[A-Za-z0-9]{6,40}$/.test(c) ? c : null;
}

/** Google tag ID — GA4 (G-…), Google Ads (AW-…) or Google Tag (GT-…). */
export function parseGoogleTagId(raw?: string | null): string | null {
  if (!raw) return null;
  const c = raw.trim().toUpperCase();
  return /^(G|AW|GT)-[A-Z0-9]{4,20}$/.test(c) ? c : null;
}

/** Google Ads conversion label — bare label or full "AW-123/Label" send_to. */
export function parseGoogleAdsLabel(raw?: string | null): string | null {
  if (!raw) return null;
  const c = raw.trim();
  const label = c.includes("/") ? (c.split("/").pop() ?? "") : c;
  return /^[A-Za-z0-9_-]{3,40}$/.test(label) ? label : null;
}

/** Last-resort sanitizer for values that reach an inline script (defense-in-depth). */
export function sanitizePixelId(raw?: string | null): string {
  return (raw ?? "").replace(/[^A-Za-z0-9_-]/g, "");
}

// ─────────────────────────────────────────────────────────────────────────
// PII normalization for Advanced Matching. The browser pixels hash values with
// SHA-256 themselves; we only need to NORMALIZE first (lowercase/trim email,
// E.164-ish phone) so the hash matches what the ad platform computes.
// ─────────────────────────────────────────────────────────────────────────

export type PixelUser = {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  country?: string | null; // ISO-2, defaults to RO
};

export function normalizeEmail(email?: string | null): string | undefined {
  const e = (email ?? "").trim().toLowerCase();
  return e.includes("@") ? e : undefined;
}

/** Digits-only phone with country code, no "+" (Meta format). RO-aware. */
export function normalizePhone(phone?: string | null, country = "RO"): string | undefined {
  let d = (phone ?? "").replace(/\D/g, "");
  if (!d) return undefined;
  if ((country || "RO").toUpperCase() === "RO") {
    if (d.startsWith("0040")) d = d.slice(2);
    else if (d.startsWith("40")) { /* already prefixed */ }
    else if (d.startsWith("0")) d = "40" + d.slice(1);
    else if (d.length === 9) d = "40" + d; // "7xxxxxxxx" without leading 0
  }
  return d.length >= 8 ? d : undefined;
}

export function normalizeName(name?: string | null): string | undefined {
  const n = (name ?? "").trim().toLowerCase();
  return n || undefined;
}

/** Split a full name into first/last for Advanced Matching. */
export function splitName(full?: string | null): { firstName?: string; lastName?: string } {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { firstName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

// ─────────────────────────────────────────────────────────────────────────
// Event queue. Pixel scripts are injected lazily (behind a consent gate) and
// only execute `afterInteractive`, so a tracking helper called from an effect
// (e.g. Purchase on /confirm) can run BEFORE fbq/ttq/gtag exist. Without a
// queue the event is silently dropped — which is exactly why conversions were
// being lost. Helpers now enqueue when the library is not ready; each pixel
// bootstrap drains its own events the instant it defines the global.
// ─────────────────────────────────────────────────────────────────────────

type Vendor = "fb" | "tt" | "ga";
type QueuedCall = { vendor: Vendor; run: () => void };
const QUEUE_CAP = 50; // bound memory / replay if consent is never granted

function getQueue(): QueuedCall[] {
  const w = window as unknown as { __edinioQ?: QueuedCall[] };
  if (!w.__edinioQ) w.__edinioQ = [];
  return w.__edinioQ;
}

function ready(vendor: Vendor): boolean {
  const w = window as unknown as { fbq?: unknown; ttq?: { track?: unknown }; gtag?: unknown };
  if (vendor === "fb") return typeof w.fbq === "function";
  if (vendor === "tt") return !!w.ttq && typeof w.ttq.track === "function";
  return typeof w.gtag === "function";
}

function dispatch(vendor: Vendor, run: () => void): void {
  if (typeof window === "undefined") return;
  if (ready(vendor)) { run(); return; }
  const q = getQueue();
  if (q.length >= QUEUE_CAP) q.shift();
  q.push({ vendor, run });
}

/** Replay every queued call for a vendor whose library is now ready. */
export function flushQueue(vendor: Vendor): void {
  if (typeof window === "undefined") return;
  const all = getQueue();
  const keep: QueuedCall[] = [];
  for (const item of all) {
    if (item.vendor === vendor && ready(vendor)) item.run();
    else keep.push(item);
  }
  (window as unknown as { __edinioQ?: QueuedCall[] }).__edinioQ = keep;
}

// Expose the flusher so each pixel's inline bootstrap can drain its queue
// synchronously right after defining fbq/ttq/gtag (no React-timing dependency).
(function installFlush() {
  if (typeof window === "undefined") return;
  const w = window as unknown as { __edinioFlushQueue?: (v: Vendor) => void };
  if (!w.__edinioFlushQueue) w.__edinioFlushQueue = (v: Vendor) => flushQueue(v);
})();

// ── Safe trackers (fire now if ready, else queue) ─────────────────────────

/** Facebook Pixel — window.fbq. `eventID` enables Pixel↔CAPI deduplication. */
export function fbTrack(event: string, data?: Record<string, unknown>, opts?: { eventID?: string }) {
  dispatch("fb", () => {
    const fbq = (window as unknown as { fbq?: (...a: unknown[]) => void }).fbq;
    if (typeof fbq !== "function") return;
    if (opts?.eventID) fbq("track", event, data ?? {}, { eventID: opts.eventID });
    else fbq("track", event, data ?? {});
  });
}

/** TikTok Pixel — window.ttq. `eventID` maps to TikTok's `event_id` for dedup. */
export function ttqTrack(event: string, data?: Record<string, unknown>, opts?: { eventID?: string }) {
  dispatch("tt", () => {
    const ttq = (window as unknown as { ttq?: { track: (...a: unknown[]) => void } }).ttq;
    if (!ttq || typeof ttq.track !== "function") return;
    if (opts?.eventID) ttq.track(event, data ?? {}, { event_id: opts.eventID });
    else ttq.track(event, data ?? {});
  });
}

/** Google Tag (gtag.js) — standard event. */
export function gtagEvent(event: string, data?: Record<string, unknown>) {
  dispatch("ga", () => {
    const gtag = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag;
    if (typeof gtag === "function") gtag("event", event, data ?? {});
  });
}

/** Google Tag — raw passthrough (e.g. Google Ads `conversion` with send_to). */
export function gtagRaw(...args: unknown[]) {
  dispatch("ga", () => {
    const gtag = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag;
    if (typeof gtag === "function") gtag(...args);
  });
}

// ── Advanced Matching (improves Event Match Quality; opt-in via consent) ──

/** Re-init Meta pixel with hashed PII so later events carry Advanced Matching. */
export function fbAdvancedMatch(pixelId: string, user: PixelUser) {
  const em = normalizeEmail(user.email);
  const ph = normalizePhone(user.phone, user.country ?? "RO");
  const fn = normalizeName(user.firstName);
  const ln = normalizeName(user.lastName);
  const match: Record<string, string> = {};
  if (em) match.em = em;
  if (ph) match.ph = ph;
  if (fn) match.fn = fn;
  if (ln) match.ln = ln;
  if (Object.keys(match).length === 0) return;
  dispatch("fb", () => {
    const fbq = (window as unknown as { fbq?: (...a: unknown[]) => void }).fbq;
    if (typeof fbq === "function") fbq("init", pixelId, match);
  });
}

/** TikTok Advanced Matching — identify the visitor before firing events. */
export function ttqIdentify(user: PixelUser) {
  const email = normalizeEmail(user.email);
  const phoneDigits = normalizePhone(user.phone, user.country ?? "RO");
  const payload: Record<string, string> = {};
  if (email) payload.email = email;
  if (phoneDigits) payload.phone_number = "+" + phoneDigits; // TikTok wants E.164
  if (Object.keys(payload).length === 0) return;
  dispatch("tt", () => {
    const ttq = (window as unknown as { ttq?: { identify: (...a: unknown[]) => void } }).ttq;
    if (ttq && typeof ttq.identify === "function") ttq.identify(payload);
  });
}
