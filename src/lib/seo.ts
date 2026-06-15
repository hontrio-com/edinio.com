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
