export type MarketingConfig = {
  facebook_pixel_id?: string;
  tiktok_pixel_id?: string;
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
