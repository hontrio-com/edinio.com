export type MarketingConfig = {
  facebook_pixel_id?: string;
  tiktok_pixel_id?: string;
  google_tag_id?: string;
  google_ads_conversion_label?: string; // e.g. "abc123XYZ" — needed for Purchase conversion tracking in Google Ads
};

// Facebook Pixel — call window.fbq safely
export function fbTrack(event: string, data?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const fbq = (window as unknown as { fbq?: (...args: unknown[]) => void }).fbq;
  if (typeof fbq === "function") fbq("track", event, data);
}

// TikTok Pixel — call window.ttq safely
export function ttqTrack(event: string, data?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const ttq = (window as unknown as { ttq?: { track: (...args: unknown[]) => void } }).ttq;
  if (ttq && typeof ttq.track === "function") ttq.track(event, data);
}

// Google Tag (gtag.js) — call window.gtag safely
export function gtagEvent(event: string, data?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
  if (typeof gtag === "function") gtag("event", event, data);
}
