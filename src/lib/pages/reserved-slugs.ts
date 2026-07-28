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
/**
 * Segmentul rutei paginii de catalog.
 *
 * Sta AICI, nu langa gate-ul din `design/commerce.ts`, fiindca il citesc si
 * ecrane de dashboard: importat de acolo, ar fi tras in bundle-ul lor de client
 * intreg catalogul de sectiuni pentru opt caractere. `commerce.ts` il reexporta
 * pentru consumatorii de storefront.
 */
export const SEGMENT_MAGAZIN = "magazin";

export const RESERVED_PAGE_SLUGS = new Set<string>([
  // existing public store sub-routes
  "product", "politici", "confirm", "retur",
  // cos si finalizarea comenzii: rute proprii pentru magazinele care le aleg ca
  // pagini. Sinonimele stau langa ele ca sa nu apara o pagina custom „comanda"
  // pe care comerciantul o crede legata de checkout.
  "cos", "cart", "checkout", "finalizare", "comanda",
  // pagina de catalog: ruta exista pentru magazinele care o aleg. Rezervarea nu
  // repara retroactiv o pagina care poarta deja numele — blocheaza doar creari
  // noi — deci a intrat in acelasi commit cu ruta, nu dupa.
  //
  // Doar segmentul REAL si perechea lui in engleza. „produse" si „catalog" au
  // fost scoase: sunt nume plauzibile de pagina proprie in romana, nicio ruta nu
  // le foloseste, si rezervate ar fi luat comerciantilor un nume bun fara sa
  // apere nimic.
  SEGMENT_MAGAZIN, "shop",
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
