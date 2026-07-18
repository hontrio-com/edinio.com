import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { FacebookPixel } from "@/components/public/FacebookPixel";
import { TikTokPixel } from "@/components/public/TikTokPixel";
import { GoogleTag } from "@/components/public/GoogleTag";
import { ConsentGate } from "@/components/public/ConsentGate";
import { CookieConsent } from "@/components/public/CookieConsent";
import { AttributionCapture } from "@/components/public/AttributionCapture";
import type { MarketingConfig } from "@/lib/marketing";
import type { GoogleAnalyticsConfig } from "@/lib/google-analytics/types";
import { detectConsentCategories, parseCookieBannerConfig } from "@/lib/cookie-consent";
import type { Metadata } from "next";

interface Props {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

/** Per-store favicon: the merchant's logo overrides the default Edinio favicon. */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { data } = await createAdminClient()
    .from("businesses")
    .select("logo_url, store_settings(page_content)")
    .eq("slug", slug)
    .single();
  if (!data) return {};
  const rawSettings = (data as unknown as { store_settings: { page_content: unknown } | { page_content: unknown }[] | null }).store_settings;
  const settings = Array.isArray(rawSettings) ? rawSettings[0] : rawSettings;
  const favicon = ((settings?.page_content ?? null) as { favicon_url?: string | null } | null)?.favicon_url || data.logo_url;
  return favicon ? { icons: { icon: favicon } } : {};
}

export default async function StoreLayout({ children, params }: Props) {
  const { slug } = await params;
  // Service role: marketing_config (public pixel IDs) lives in store_settings,
  // which is no longer anon-readable. Read it server-side and pass only pixel IDs.
  const admin = createAdminClient();

  const { data: business } = await admin
    .from("businesses")
    .select("id, slug, store_name, business_name, primary_color, custom_domain, store_settings(marketing_config, cookie_banner_config, google_analytics_config)")
    .eq("slug", slug)
    .single();

  let fbPixelId: string | null = null;
  let ttPixelId: string | null = null;
  let googleTagId: string | null = null;
  let gaMeasurementId: string | null = null;
  let mc: MarketingConfig | null = null;
  let cookieRaw: unknown = null;

  if (business) {
    const rawSettings = (business as unknown as { store_settings: { marketing_config: unknown; cookie_banner_config: unknown; google_analytics_config: unknown } | { marketing_config: unknown; cookie_banner_config: unknown; google_analytics_config: unknown }[] | null }).store_settings;
    const settings = Array.isArray(rawSettings) ? rawSettings[0] : rawSettings;
    mc = (settings?.marketing_config ?? null) as MarketingConfig | null;
    cookieRaw = settings?.cookie_banner_config ?? null;
    fbPixelId = mc?.facebook_pixel_id?.trim() || null;
    ttPixelId = mc?.tiktok_pixel_id?.trim() || null;
    googleTagId = mc?.google_tag_id?.trim() || null;
    // GA4: connected via OAuth + tracking left on -> inject its Measurement ID.
    const ga = (settings?.google_analytics_config ?? null) as GoogleAnalyticsConfig | null;
    gaMeasurementId = ga?.connected && ga.tracking_enabled !== false ? ga.measurement_id?.trim() || null : null;
  }

  // One gtag loader for all Google tags (Ads + GA4), deduplicated.
  const googleTagIds = [...new Set([googleTagId, gaMeasurementId].filter((v): v is string => !!v))];

  const cookieConfig = parseCookieBannerConfig(cookieRaw);
  const consentCategories = detectConsentCategories(mc, gaMeasurementId);
  const color = (business?.primary_color as string | null) ?? "#1AB554";
  const storeName = (business?.store_name as string | null) ?? (business?.business_name as string | null) ?? "magazin";

  // Policy link must honour custom domains (proxy rewrites customdomain.ro/x → /slug/x).
  const host = (await headers()).get("host")?.split(":")[0] ?? "";
  const customDomain = (business?.custom_domain as string | null) ?? null;
  const basePath = customDomain && host === customDomain ? "" : `/${slug}`;

  // Trackers inject AFTER the visitor consents to the matching category
  // (GDPR opt-in). marketing = FB/TikTok pixels, analytics = Google Tag.
  // When the merchant disabled the cookie banner, there is no consent flow, so
  // the gate is bypassed and trackers load unconditionally (merchant owns the
  // GDPR responsibility — a warning is shown in Settings → Banner Cookies).
  const requireConsent = cookieConfig.enabled;
  return (
    <>
      <AttributionCapture />
      {fbPixelId && (
        <ConsentGate slug={slug} category="marketing" bypass={!requireConsent}><FacebookPixel pixelId={fbPixelId} /></ConsentGate>
      )}
      {ttPixelId && (
        <ConsentGate slug={slug} category="marketing" bypass={!requireConsent}><TikTokPixel pixelId={ttPixelId} /></ConsentGate>
      )}
      {googleTagIds.length > 0 && (
        <ConsentGate slug={slug} category="analytics" bypass={!requireConsent}><GoogleTag tagIds={googleTagIds} slug={slug} requireConsent={requireConsent} /></ConsentGate>
      )}
      {children}
      {cookieConfig.enabled && (
        <CookieConsent
          slug={slug}
          color={color}
          categories={consentCategories}
          position={cookieConfig.position}
          policyHref={`${basePath}/politici/confidentialitate`}
          storeName={storeName}
        />
      )}
    </>
  );
}
