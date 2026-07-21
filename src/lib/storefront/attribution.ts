// First-party order attribution captured in the storefront (client-side) and
// attached to the order at checkout, so the merchant sees where each order came
// from. Stored in localStorage; no third-party cookies, no cross-site tracking.
//
// Model: LAST MEANINGFUL TOUCH. Every full page load that carries a real signal
// (utm_*, an external referrer, or an ad click id) overwrites the stored value;
// visits with no signal keep the previous touch (internal navigation must not
// downgrade a real source to "direct"). External traffic always arrives as a
// full page load, so capturing on mount catches every meaningful touch.

const KEY = "edinio_attribution";

export interface OrderSource {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  gclid?: string;   // Google Ads click id
  fbclid?: string;  // Meta (Facebook/Instagram) click id
  ttclid?: string;  // TikTok click id
  referrer?: string; // external referrer host only (never the store's own host)
  landing?: string;  // first landing path on this touch
  direct?: boolean;  // true when the visit had no source signal at all
  captured_at?: string;
  user_agent?: string; // filled server-side at order creation
  ga_client_id?: string; // GA4 client id from the _ga cookie, for server-side Measurement Protocol
}

function externalReferrerHost(): string | undefined {
  try {
    if (!document.referrer) return undefined;
    const r = new URL(document.referrer);
    if (r.host === window.location.host) return undefined; // internal navigation
    return r.host.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function prune(src: OrderSource): OrderSource {
  return Object.fromEntries(Object.entries(src).filter(([, v]) => v !== undefined && v !== "")) as OrderSource;
}

/** Capture the current touch (call once per full page load, e.g. from a mounted client component). */
export function captureAttribution(): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    const p = url.searchParams;
    const get = (k: string) => p.get(k)?.slice(0, 200) || undefined;

    const referrer = externalReferrerHost();
    const signal = {
      utm_source: get("utm_source"),
      utm_medium: get("utm_medium"),
      utm_campaign: get("utm_campaign"),
      utm_content: get("utm_content"),
      utm_term: get("utm_term"),
      gclid: get("gclid"),
      fbclid: get("fbclid"),
      ttclid: get("ttclid"),
      referrer,
    };
    const hasSignal = Object.values(signal).some(Boolean);

    if (hasSignal) {
      localStorage.setItem(KEY, JSON.stringify(prune({
        ...signal,
        landing: url.pathname.slice(0, 200),
        captured_at: new Date().toISOString(),
      })));
      return;
    }
    // No signal on this visit: only record a "direct" touch if we have nothing yet.
    if (!localStorage.getItem(KEY)) {
      localStorage.setItem(KEY, JSON.stringify(prune({
        direct: true,
        landing: url.pathname.slice(0, 200),
        captured_at: new Date().toISOString(),
      })));
    }
  } catch {
    // localStorage unavailable (private mode / disabled) — attribution is best-effort
  }
}

/** GA4 client id from the _ga cookie ("GA1.1.<clientId>"), for server-side MP. */
function readGaClientId(): string | undefined {
  try {
    const m = document.cookie.match(/(?:^|;\s*)_ga=GA\d\.\d\.([\d.]+)/);
    return m ? m[1] : undefined;
  } catch {
    return undefined;
  }
}

/** Read the stored attribution (+ the live GA client id) to attach to an order at checkout. */
export function getAttribution(): OrderSource | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as OrderSource) : null;
    const src: OrderSource = parsed && typeof parsed === "object" ? { ...parsed } : {};
    const gaClientId = readGaClientId();
    if (gaClientId) src.ga_client_id = gaClientId;
    return Object.keys(src).length > 0 ? src : null;
  } catch {
    return null;
  }
}
