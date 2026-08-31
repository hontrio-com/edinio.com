import "../../globals.css";
import { headers } from "next/headers";
import { incarcaAntetMagazin, setarileDin } from "@/lib/storefront/antet-magazin";
import { FacebookPixel } from "@/components/public/FacebookPixel";
import { TikTokPixel } from "@/components/public/TikTokPixel";
import { GoogleTag } from "@/components/public/GoogleTag";
import { ConsentGate } from "@/components/public/ConsentGate";
import { CookieConsent } from "@/components/public/CookieConsent";
import { AttributionCapture } from "@/components/public/AttributionCapture";
import { DoarInMagazinReal } from "@/components/public/DoarInMagazinReal";
import type { MarketingConfig } from "@/lib/marketing";
import type { GoogleAnalyticsConfig } from "@/lib/google-analytics/types";
import { detectConsentCategories, parseCookieBannerConfig } from "@/lib/cookie-consent";
import { deriveStoreDescription, deriveStoreTitle, parseStoreSeo } from "@/lib/seo";
import type { Metadata } from "next";

interface Props {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

/**
 * Identitatea magazinului, pusa pe TOT ce se randeaza sub `/[slug]`.
 *
 * Favicon si verificarea Search Console au stat aici de la inceput. Titlul,
 * descrierea si OpenGraph sunt noi, si sunt aici dintr-un motiv precis: paginile
 * si le pun singure, dar 404-ul NU poate. `not-found.tsx` nu accepta
 * `generateMetadata` — antetul lui vine de la cel mai apropiat layout — asa ca
 * orice adresa gresita de pe domeniul unui comerciant servea titlul, descrierea
 * si og:title ale platformei: „Creare magazin online rapid | Edinio", pe
 * caian-textile.ro.
 *
 * Sunt IMPLICITE, nu impuse: orice pagina care isi declara titlul sau OpenGraph
 * il pastreaza, fiindca segmentul mai adanc castiga. Umplu doar golul.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await incarcaAntetMagazin(slug);
  if (!data) return {};
  const settings = setarileDin<{ page_content: unknown }>(data);
  const favicon = ((settings?.page_content ?? null) as { favicon_url?: string | null } | null)?.favicon_url || data.logo_url;
  // Google Search Console "HTML tag" verification, set in Settings > SEO.
  const seo = parseStoreSeo(settings?.page_content ?? null);

  const numeAfisat = data.store_name ?? data.business_name;
  const titlu = seo.title || deriveStoreTitle(numeAfisat, data.store_city);
  const descriere = seo.description || deriveStoreDescription({
    tagline: data.tagline,
    description: data.description,
    displayName: numeAfisat,
  });
  const imagini = seo.ogImage || data.cover_url ? [seo.ogImage || data.cover_url!] : [];

  const meta: Metadata = {
    /*
     * `absolute`, nu `default`, si iata de ce.
     *
     * `default` e tot un titlu, deci sablonul radacinii („%s | Edinio") se
     * aplica peste el: pe 404-ul de la caian-textile.ro a iesit „Caian Textile |
     * Prosoape Hotel & HoReCa Romania | Edinio" — numele platformei se
     * intorsese pe alta usa. `absolute` opreste sablonul de deasupra, iar
     * paginile de dedesubt care nu-si declara titlul il mostenesc ca atare.
     *
     * `template` ramane, pentru copiii care si-ar declara titlul ca sir simplu:
     * acolo se lipeste numele magazinului, nu al platformei. Azi toate il declara
     * `absolute`, deci e doar plasa de siguranta.
     */
    title: { absolute: titlu, template: `%s | ${numeAfisat}` },
    description: descriere,
    openGraph: { type: "website", locale: "ro_RO", siteName: numeAfisat, title: titlu, description: descriere, images: imagini },
    twitter: { card: imagini.length ? "summary_large_image" : "summary", title: titlu, description: descriere, ...(imagini.length ? { images: imagini } : {}) },
  };
  if (favicon) meta.icons = { icon: favicon };
  if (seo.googleVerification) meta.verification = { google: seo.googleVerification };
  return meta;
}

export default async function StoreLayout({ children, params }: Props) {
  const { slug } = await params;
  // Service role: marketing_config (public pixel IDs) lives in store_settings,
  // which is no longer anon-readable. Read it server-side and pass only pixel IDs.
  // Acelasi rand pe care l-a citit deja `generateMetadata` in aceasta randare:
  // `incarcaAntetMagazin` e invelit in `cache` din React, deci al doilea apel nu
  // mai atinge baza.
  const business = await incarcaAntetMagazin(slug);

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
  /*
   * Tot ce nu e magazinul propriu-zis sta sub `DoarInMagazinReal`.
   *
   * In previzualizarea din editor, bannerul de cookie-uri acoperea cadrul si
   * fiecare reincarcare a iframe-ului trimitea un `PageView` fals in Facebook
   * Pixel, TikTok si Google — iar iframe-ul se reincarca la fiecare salvare.
   * Vezi componenta pentru intreaga poveste.
   */
  return (
    <>
      <DoarInMagazinReal>
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
      </DoarInMagazinReal>
      {children}
      {cookieConfig.enabled && (
        <DoarInMagazinReal>
          <CookieConsent
            slug={slug}
            color={color}
            categories={consentCategories}
            position={cookieConfig.position}
            policyHref={`${basePath}/politici/confidentialitate`}
            storeName={storeName}
          />
        </DoarInMagazinReal>
      )}
    </>
  );
}
