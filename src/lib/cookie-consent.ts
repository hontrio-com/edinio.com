import type { MarketingConfig } from "@/lib/marketing-config";

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

/*
 * „functional” (22.11.2026): chatul de suport al magazinului (Tidio, tawk.to, Intercom, Zendesk). Nu e
 * masuratoare si nu e reclama, dar scriptul furnizorului pune cookie-uri si afla pagina vizitatorului,
 * deci nu porneste fara acord. Apare in banner numai la magazinele cu chat. Vezi `lib/suport/config.ts`.
 */
export type ConsentCategory = "analytics" | "marketing" | "functional";

export type ConsentState = {
  necessary: true; // always granted, shown read-only
  analytics: boolean;
  marketing: boolean;
  functional: boolean;
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
  /**
   * Alt instrument de marketing pornit in vitrina, in afara pixelilor (theMarketer). ⚠ Fara el, un magazin
   * cu theMarketer si fara pixeli n-ar fi aratat categoria „Marketing” in banner, deci nimeni n-ar fi putut
   * da acordul, iar scriptul n-ar fi pornit niciodata.
   */
  altMarketing = false,
  /** Magazinul are chatul de suport pornit: bannerul primeste categoria „Functionale”. */
  areChat = false,
): ConsentCategory[] {
  const cats: ConsentCategory[] = [];
  if (mc?.google_tag_id?.trim() || gaMeasurementId) cats.push("analytics");
  if (mc?.facebook_pixel_id?.trim() || mc?.tiktok_pixel_id?.trim() || altMarketing) cats.push("marketing");
  if (areChat) cats.push("functional");
  return cats;
}

// ── Client-side consent storage ────────────────────────────────────────────
// Versioned so we can invalidate stored consent if the legal model changes.
export const CONSENT_VERSION = 1;
export const CONSENT_EVENT = "edinio-consent-change";
export const OPEN_SETTINGS_EVENT = "edinio-open-cookie-settings";

/*
 * `partial`: acordul a fost dat DOAR chatului, din cartonasul de la butonul de chat, de cineva care inca nu
 * a raspuns bannerului. Categoria „functionale” e pornita, dar bannerul ramane de raspuns: nu hotaram noi,
 * in locul omului, ca a refuzat analiza si marketingul.
 */
type StoredConsent = ConsentState & { v: number; ts: number; partial?: boolean };

function storageKey(slug: string): string {
  return `edinio_cc_${slug}`;
}

/**
 * Se poate incarca un tracker care sta sub categoriile date?
 *
 * ⚠ ORICARE, nu toate (18.09.2026). Tagul Google poarta si masuratoarea GA4 (analiza), si conversiile Google
 * Ads (marketing); cerandu-le pe amandoua, cine accepta doar marketingul nu trimitea nicio conversie. Ce are
 * voie sa faca tagul dupa ce s-a incarcat hotarasc semnalele consent mode, fiecare din categoria lui.
 */
export function areAcordPentru(consent: ConsentState | null, categorii: readonly ConsentCategory[]): boolean {
  if (!consent || categorii.length === 0) return false;
  return categorii.some((c) => consent[c]);
}

function citesteStocat(slug: string): StoredConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(slug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredConsent;
    if (!parsed || parsed.v !== CONSENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Read the visitor's saved consent for a store, or null if nothing is stored.
 *
 * ⚠ Un acord vechi, scris inainte sa existe categoria „functionale”, o are OPRITA: omul a acceptat ce i s-a
 * aratat atunci, iar chatul nu era pe lista. Il intreaba cartonasul de la butonul de chat, o singura data.
 */
export function readConsent(slug: string): ConsentState | null {
  const parsed = citesteStocat(slug);
  if (!parsed) return null;
  return { necessary: true, analytics: !!parsed.analytics, marketing: !!parsed.marketing, functional: !!parsed.functional };
}

/**
 * Vizitatorul a raspuns bannerului? Un acord dat doar chatului (`acordaFunctional`) NU e un raspuns la
 * banner: bannerul ramane deschis pentru celelalte categorii.
 */
export function bannerDecis(slug: string): boolean {
  const parsed = citesteStocat(slug);
  return parsed !== null && parsed.partial !== true;
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

/**
 * Acordul dat de la butonul de chat („Deschide chatul”): porneste categoria „functionale” si atat.
 *
 * Cine a raspuns deja bannerului isi pastreaza celelalte alegeri. Cine n-a raspuns primeste o insemnare
 * partiala: chatul are voie sa porneasca, iar bannerul il intreaba mai departe despre analiza si marketing.
 */
export function acordaFunctional(slug: string): void {
  if (typeof window === "undefined") return;
  try {
    const vechi = citesteStocat(slug);
    const state: ConsentState = {
      necessary: true,
      analytics: !!vechi?.analytics,
      marketing: !!vechi?.marketing,
      functional: true,
    };
    const payload: StoredConsent = { ...state, v: CONSENT_VERSION, ts: Date.now() };
    if (!vechi || vechi.partial === true) payload.partial = true;
    window.localStorage.setItem(storageKey(slug), JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: { slug, state } }));
  } catch {
    /* stocare blocata: chatul se deschide acum, iar intrebarea revine la pagina urmatoare */
  }
}

export const CONSENT_ALL: ConsentState = { necessary: true, analytics: true, marketing: true, functional: true };
export const CONSENT_NONE: ConsentState = { necessary: true, analytics: false, marketing: false, functional: false };
