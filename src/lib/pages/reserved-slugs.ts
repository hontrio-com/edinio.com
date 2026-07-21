import { slugify } from "@/lib/utils/slugify";

/**
 * Route segments that already exist under /(public)/[slug] (or platform-level)
 * plus a few we keep free for the future. A custom page slug may not collide with
 * these, otherwise the static route would shadow the page (or vice-versa).
 *
 * In the App Router static segments win over the dynamic [pageSlug], so a page
 * named "product" would simply never render — we block it up-front with a clear
 * error instead.
 */
export const RESERVED_PAGE_SLUGS = new Set<string>([
  // existing public store sub-routes
  "product", "politici", "confirm",
  // cart / checkout (future-proofing)
  "cos", "cart", "checkout",
  // platform / framework
  "api", "_next", "sitemap.xml", "robots.txt", "favicon.ico", "facebook-catalog.xml",
  // app sections that live at the root path
  "dashboard", "admin", "login", "register", "forgot-password",
  "reset-password", "onboarding", "auth",
  // keep these handy as alternative prefixes
  "p", "pagina", "pages",
]);

/** Normalize free text into a URL slug (Romanian-aware, lowercase, dash-separated). */
export function normalizePageSlug(input: string): string {
  return slugify(input);
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_PAGE_SLUGS.has(slug.toLowerCase());
}

/** Validate + normalize a page slug. Returns the clean slug or a Romanian error. */
export function validatePageSlug(
  input: string,
): { ok: true; slug: string } | { ok: false; error: string } {
  const slug = normalizePageSlug(input);
  if (!slug) return { ok: false, error: "Linkul paginii nu poate fi gol." };
  if (slug.length > 60) return { ok: false, error: "Linkul paginii e prea lung (maxim 60 de caractere)." };
  if (isReservedSlug(slug)) return { ok: false, error: `Linkul "${slug}" este rezervat. Alege alt link.` };
  return { ok: true, slug };
}
