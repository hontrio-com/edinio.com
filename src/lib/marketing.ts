/*
  ═══════════════════════════════════════════════════════════════════════════════
  MARKETINGUL COMERCIANTULUI — RUNTIME. NUMAI IN MAGAZIN.
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ FISIERUL ASTA ARE UN EFECT LA INCARCARE (`installFlush`, mai jos). Importat
  oriunde, instaleaza `window.__edinioFlushQueue` si aduce cu el toata coada si
  toate trackerele. De aceea n-are ce cauta in afara magazinelor.

  ⚠ DACA VREI DOAR UN ANALIZOR DE ID sau o normalizare, ia-le din
  `@/lib/marketing-config` — sunt curate si nu aduc nimic dupa ele.

  ⚠ SI NU E RUNTIME-UL PLATFORMEI. Pixelii cu care ne masuram NOI stau in
  `src/components/platform/`. Cele doua sisteme n-au voie sa se atinga: vezi
  `src/lib/granita-tracking.test.ts`.
*/

import {
  normalizeEmail,
  normalizeName,
  normalizePhone,
  type PixelUser,
} from "@/lib/marketing-config";

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
