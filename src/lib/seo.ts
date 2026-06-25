// Canonical-domain helpers for the public storefront (multi-tenant).
//
// A store is reachable at www.edinio.com/{slug} AND, if configured, at its own
// custom domain. To index each correctly we always point canonical/sitemap URLs
// at ONE address per store: the custom domain when set, otherwise edinio.com.

export const PLATFORM_ORIGIN = "https://www.edinio.com";

const PLATFORM_HOSTS = new Set(["localhost", "edinio.com", "www.edinio.com"]);

/** True for the platform's own hostnames (not a merchant's custom domain). */
export function isPlatformHost(host: string | null | undefined): boolean {
  const bare = (host ?? "").split(":")[0].toLowerCase();
  if (!bare) return true; // unknown host -> treat as platform (safe default)
  if (PLATFORM_HOSTS.has(bare)) return true;
  if (bare.endsWith(".vercel.app")) return true;
  return false;
}

/** Canonical base URL for a store: its custom domain if set, else edinio.com/{slug}. */
export function storeBaseUrl(business: { slug: string; custom_domain?: string | null }): string {
  return business.custom_domain
    ? `https://${business.custom_domain}`
    : `${PLATFORM_ORIGIN}/${business.slug}`;
}

/* ─── Store-level SEO overrides ──────────────────────────────────────────────
 *
 * Live in `store_settings.page_content.seo`. The merchant sets these in
 * Settings > SEO; when a field is empty we fall back to the auto-derived
 * defaults below. Both the Settings placeholders and the public page metadata
 * use the same derive helpers, so the live preview matches what actually ships.
 */

export interface StoreSeo {
  title?: string;
  description?: string;
  ogImage?: string | null;
  /** Advanced opt-in: hide the store homepage from search engines. */
  noindex?: boolean;
}

/** Recommended lengths — counters turn green inside [ideal_min, max], red past max. */
export const SEO_TITLE_IDEAL_MIN = 50;
export const SEO_TITLE_MAX = 60;
export const SEO_DESCRIPTION_IDEAL_MIN = 140;
export const SEO_DESCRIPTION_MAX = 160;

/** Read & normalize the SEO overrides out of a `page_content` JSON blob. */
export function parseStoreSeo(pageContent: unknown): StoreSeo {
  const seo = (pageContent as { seo?: unknown } | null)?.seo;
  if (!seo || typeof seo !== "object") return {};
  const s = seo as Record<string, unknown>;
  const out: StoreSeo = {};
  if (typeof s.title === "string" && s.title.trim()) out.title = s.title.trim();
  if (typeof s.description === "string" && s.description.trim()) out.description = s.description.trim();
  if (typeof s.ogImage === "string" && s.ogImage.trim()) out.ogImage = s.ogImage.trim();
  if (s.noindex === true) out.noindex = true;
  return out;
}

/**
 * Default meta title for a store homepage when the merchant hasn't set one.
 * e.g. "Floraria Mea - Cluj-Napoca" or just "Floraria Mea".
 */
export function deriveStoreTitle(displayName: string, city?: string | null): string {
  const c = city?.trim();
  return c ? `${displayName} - ${c}` : displayName;
}

/** Default meta description for a store homepage when the merchant hasn't set one. */
export function deriveStoreDescription(opts: {
  tagline?: string | null;
  description?: string | null;
  displayName: string;
}): string {
  return (
    opts.tagline?.trim() ||
    opts.description?.trim().slice(0, 155) ||
    `Cumpara din ${opts.displayName} online.`
  );
}
