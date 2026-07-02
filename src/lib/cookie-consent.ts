import type { MarketingConfig } from "@/lib/marketing";

/**
 * Cookie consent system (GDPR / ePrivacy).
 *
 * Non-essential tracking (analytics + marketing pixels) must NOT load until the
 * visitor consents. The banner content auto-adapts to the store's active
 * integrations: only categories that actually have a tracker are shown.
 *
 * - Consent is stored per-visitor in localStorage (not the DB), keyed by store
 *   slug so different stores on the same browser keep independent choices.
 * - The merchant only configures the banner's appearance (enabled + position)
 *   via Settings → Banner Cookies; the categories themselves are derived.
 */

export type ConsentCategory = "analytics" | "marketing";

export type ConsentState = {
  necessary: true; // always granted, shown read-only
  analytics: boolean;
  marketing: boolean;
};

export type CookieBannerPosition =
  | "bottom-bar" // subtle slim bar across the bottom (default)
  | "bottom-left" // compact card, bottom-left
  | "bottom-right" // compact card, bottom-right
  | "center"; // centered modal with backdrop (max compliance)

export type CookieBannerConfig = {
  enabled: boolean;
  position: CookieBannerPosition;
};

export const DEFAULT_COOKIE_BANNER_CONFIG: CookieBannerConfig = {
  enabled: true,
  position: "bottom-bar",
};

const VALID_POSITIONS: CookieBannerPosition[] = ["bottom-bar", "bottom-left", "bottom-right", "center"];

/** Parse/sanitize the merchant's stored banner config (jsonb) into a safe object. */
export function parseCookieBannerConfig(raw: unknown): CookieBannerConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_COOKIE_BANNER_CONFIG };
  const r = raw as Record<string, unknown>;
  const position = VALID_POSITIONS.includes(r.position as CookieBannerPosition)
    ? (r.position as CookieBannerPosition)
    : DEFAULT_COOKIE_BANNER_CONFIG.position;
  return {
    enabled: r.enabled !== false, // default true
    position,
  };
}

/** Which consent categories are relevant for this store, based on active trackers. */
export function detectConsentCategories(
  mc: MarketingConfig | null | undefined,
  gaMeasurementId?: string | null,
): ConsentCategory[] {
  const cats: ConsentCategory[] = [];
  if (mc?.google_tag_id?.trim() || gaMeasurementId) cats.push("analytics");
  if (mc?.facebook_pixel_id?.trim() || mc?.tiktok_pixel_id?.trim()) cats.push("marketing");
  return cats;
}

// ── Client-side consent storage ────────────────────────────────────────────
// Versioned so we can invalidate stored consent if the legal model changes.
export const CONSENT_VERSION = 1;
export const CONSENT_EVENT = "edinio-consent-change";
export const OPEN_SETTINGS_EVENT = "edinio-open-cookie-settings";

type StoredConsent = ConsentState & { v: number; ts: number };

function storageKey(slug: string): string {
  return `edinio_cc_${slug}`;
}

/** Read the visitor's saved consent for a store, or null if not yet decided. */
export function readConsent(slug: string): ConsentState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(slug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredConsent;
    if (parsed.v !== CONSENT_VERSION) return null;
    return { necessary: true, analytics: !!parsed.analytics, marketing: !!parsed.marketing };
  } catch {
    return null;
  }
}

/** Persist the visitor's consent and notify listeners (gates re-evaluate immediately). */
export function writeConsent(slug: string, state: ConsentState): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredConsent = { ...state, necessary: true, v: CONSENT_VERSION, ts: Date.now() };
    window.localStorage.setItem(storageKey(slug), JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: { slug, state } }));
  } catch {
    /* storage blocked — banner stays, nothing tracked */
  }
}

export const CONSENT_ALL: ConsentState = { necessary: true, analytics: true, marketing: true };
export const CONSENT_NONE: ConsentState = { necessary: true, analytics: false, marketing: false };
