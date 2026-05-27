export type MarketingConfig = {
  facebook_pixel_id?: string;
};

// Call window.fbq safely from any client component — works if pixel script is loaded
export function fbTrack(event: string, data?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const fbq = (window as unknown as { fbq?: (...args: unknown[]) => void }).fbq;
  if (typeof fbq === "function") fbq("track", event, data);
}
