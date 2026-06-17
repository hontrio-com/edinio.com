/**
 * Resolve an author-provided link, honouring the store basePath (custom domain
 * vs /{slug}). Store-relative links (starting with "/") get the basePath prefix;
 * absolute/mailto/tel/anchor links are left untouched.
 */
export function resolveHref(href: string | undefined | null, basePath: string): string {
  const h = (href ?? "").trim();
  if (!h) return "#";
  if (h.startsWith("#")) return h;
  // Safe absolute links.
  if (/^(https?:\/\/|mailto:|tel:)/i.test(h)) return h;
  // Store-relative links honour the basePath (custom domain vs /{slug}).
  if (h.startsWith("/")) return `${basePath}${h}`;
  // Anything else that carries a URL scheme (javascript:, data:, vbscript:, file: …)
  // is rejected to prevent stored XSS through author-provided hrefs.
  if (/^[a-z][a-z0-9+.-]*:/i.test(h)) return "#";
  // Bare relative text (e.g. "contact") -> treat as a store-relative path.
  return `${basePath}/${h}`;
}

export function isExternalHref(href: string | undefined | null): boolean {
  return /^https?:\/\//i.test((href ?? "").trim());
}
