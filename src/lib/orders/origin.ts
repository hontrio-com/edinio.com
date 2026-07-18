// Derive a human-readable order origin from the captured attribution
// (order_source). Pure + defensive: any shape in, always a sensible label out,
// never throws. Older orders (no order_source) resolve to "Magazin online".

import type { OrderSource } from "@/lib/storefront/attribution";

export type OriginChannel =
  | "paid" | "search" | "social" | "email" | "referral" | "direct" | "store" | "unknown";

export interface OrderOrigin {
  label: string;         // e.g. "Facebook Ads", "Google (căutare)", "Direct"
  channel: OriginChannel;
  detail?: string;       // campaign / medium / referrer host
  device?: "Mobil" | "Tabletă" | "Desktop";
}

function asSource(raw: unknown): OrderSource | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as OrderSource;
}

function titleCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function deviceFromUA(ua?: string): OrderOrigin["device"] | undefined {
  if (!ua) return undefined;
  const s = ua.toLowerCase();
  if (/ipad|tablet|playbook|silk/.test(s)) return "Tabletă";
  if (/mobile|android|iphone|ipod|windows phone/.test(s)) return "Mobil";
  return "Desktop";
}

const PAID_MEDIA = /^(cpc|ppc|paid|paidsocial|paid_social|cpm|display|retargeting)$/;

// utm_source token -> {label, channel}. Paid variants handled separately.
function fromUtmSource(source: string, paid: boolean): { label: string; channel: OriginChannel } {
  const s = source.toLowerCase();
  if (/(google)/.test(s)) return paid ? { label: "Google Ads", channel: "paid" } : { label: "Google", channel: "search" };
  if (/(facebook|fb|meta)/.test(s)) return paid ? { label: "Facebook Ads", channel: "paid" } : { label: "Facebook", channel: "social" };
  if (/(instagram|^ig$)/.test(s)) return paid ? { label: "Instagram Ads", channel: "paid" } : { label: "Instagram", channel: "social" };
  if (/tiktok/.test(s)) return paid ? { label: "TikTok Ads", channel: "paid" } : { label: "TikTok", channel: "social" };
  if (/youtube/.test(s)) return { label: "YouTube", channel: paid ? "paid" : "social" };
  if (/(pinterest)/.test(s)) return { label: "Pinterest", channel: "social" };
  if (/(twitter|^x$|t\.co)/.test(s)) return { label: "X (Twitter)", channel: "social" };
  if (/(email|newsletter|mailchimp|klaviyo|brevo|sendgrid|mail)/.test(s)) return { label: "Email", channel: "email" };
  if (/(bing)/.test(s)) return { label: "Bing", channel: "search" };
  return { label: titleCase(source), channel: paid ? "paid" : "referral" };
}

function fromReferrer(host: string): { label: string; channel: OriginChannel } {
  const h = host.toLowerCase();
  if (/google\./.test(h)) return { label: "Google (căutare)", channel: "search" };
  if (/bing\./.test(h)) return { label: "Bing", channel: "search" };
  if (/(yahoo)\./.test(h)) return { label: "Yahoo", channel: "search" };
  if (/duckduckgo/.test(h)) return { label: "DuckDuckGo", channel: "search" };
  if (/(facebook|fb)\.|l\.facebook|lm\.facebook/.test(h)) return { label: "Facebook", channel: "social" };
  if (/instagram/.test(h)) return { label: "Instagram", channel: "social" };
  if (/tiktok/.test(h)) return { label: "TikTok", channel: "social" };
  if (/youtube|youtu\.be/.test(h)) return { label: "YouTube", channel: "social" };
  if (/pinterest/.test(h)) return { label: "Pinterest", channel: "social" };
  if (/(twitter|t\.co|^x\.com)/.test(h)) return { label: "X (Twitter)", channel: "social" };
  return { label: host, channel: "referral" };
}

export function deriveOrigin(raw: unknown): OrderOrigin {
  const src = asSource(raw);
  const device = deviceFromUA(src?.user_agent);

  // No attribution at all (older orders): we only know it's from the store.
  if (!src || Object.keys(src).filter((k) => k !== "user_agent").length === 0) {
    return { label: "Magazin online", channel: "store", device };
  }

  const medium = (src.utm_medium ?? "").toLowerCase();
  const hasClickId = !!(src.gclid || src.fbclid || src.ttclid);
  const paid = hasClickId || PAID_MEDIA.test(medium);

  // Recovery campaigns (abandoned-cart emails/SMS).
  const campaign = (src.utm_campaign ?? "").toLowerCase();
  if (/recover|abandon|cos-abandonat|cart/.test(campaign) || (src.utm_source ?? "").toLowerCase() === "recovery") {
    return { label: "Coș recuperat", channel: "email", detail: src.utm_campaign, device };
  }

  if (src.utm_source) {
    const { label, channel } = fromUtmSource(src.utm_source, paid);
    const detail = src.utm_campaign || src.utm_medium || undefined;
    return { label, channel, detail, device };
  }

  // Click ids without an explicit utm_source.
  if (src.gclid) return { label: "Google Ads", channel: "paid", device };
  if (src.fbclid) return { label: "Facebook Ads", channel: "paid", device };
  if (src.ttclid) return { label: "TikTok Ads", channel: "paid", device };

  if (src.referrer) {
    const { label, channel } = fromReferrer(src.referrer);
    return { label, channel, detail: src.referrer, device };
  }

  // Explicit direct touch, or attribution with only landing/device info.
  return { label: "Direct", channel: "direct", device };
}
