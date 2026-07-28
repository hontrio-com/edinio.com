/**
 * Sursa bannerelor de hero, intr-un singur loc.
 *
 * Regula exista de dinaintea sistemului de design si e imperfecta din
 * constructie: pana la 5 imagini din `page_content.hero_banners`, fiecare cu un
 * link optional aliniat pe index in `hero_banner_links`, iar daca nu exista
 * niciuna se cade pe vechiul `businesses.cover_url`. Imaginile si linkurile se
 * filtreaza IMPREUNA, altfel indexii se decaleaza si un banner primeste linkul
 * altuia.
 *
 * Derivarea designului classic are nevoie de ea la fel de mult ca randarea:
 * varianta de hero depinde de existenta bannerelor, nu doar de flag-ul salvat.
 */

export const MAX_HERO_BANNERS = 5;

export interface HeroBanners {
  banners: string[];
  links: (string | undefined)[];
}

export function resolveHeroBanners(
  pageContent: Record<string, unknown>,
  coverUrl?: string | null,
): HeroBanners {
  const raw = pageContent.hero_banners;
  const linksRaw = pageContent.hero_banner_links;
  const pairs = (Array.isArray(raw) ? raw : [])
    .map((url, i) => ({ url, link: Array.isArray(linksRaw) ? linksRaw[i] : undefined }))
    .filter((p): p is { url: string; link: string | undefined } => typeof p.url === "string" && !!p.url)
    .slice(0, MAX_HERO_BANNERS);

  if (pairs.length === 0 && coverUrl) {
    return { banners: [coverUrl], links: [undefined] };
  }
  return { banners: pairs.map((p) => p.url), links: pairs.map((p) => p.link) };
}
