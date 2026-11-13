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

/**
 * Marimile bannerelor, cand serverul le stie din Biblioteca Media (13.11.2026, vezi `marimi-bannere.ts`): adresa ->
 * [latime, inaltime]. Locul bannerului ia raportul primului, deci cu ele pagina se aseaza corect de la primul cadru.
 *
 * ⚠ Cheia NU se salveaza niciodata in baza: o pune pagina principala in `page_content`-ul trimis browserului, la fiecare
 * randare. Lipsa ei nu strica nimic: raportul se masoara atunci in browser, la incarcarea pozei.
 */
export const CHEIE_MARIMI_BANNERE = "hero_banners_marimi";

/** Latimea si inaltimea unui banner, in pixeli. */
export type MarimeBanner = readonly [latime: number, inaltime: number];

export interface HeroBanners {
  banners: string[];
  links: (string | undefined)[];
  /** Aliniate pe index cu `banners`; `null` unde nu se stie marimea. */
  marimi: (MarimeBanner | null)[];
}

/** O marime folosibila (doua numere intregi pozitive, rezonabile), sau `null`. */
export function marimeBanner(v: unknown): MarimeBanner | null {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const [l, i] = v;
  const bun = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n > 0 && n <= 20000;
  return bun(l) && bun(i) ? [l, i] : null;
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

  const harta = pageContent[CHEIE_MARIMI_BANNERE];
  const marimeA = (url: string): MarimeBanner | null =>
    harta && typeof harta === "object" && !Array.isArray(harta) && Object.hasOwn(harta, url)
      ? marimeBanner((harta as Record<string, unknown>)[url])
      : null;

  if (pairs.length === 0 && coverUrl) {
    return { banners: [coverUrl], links: [undefined], marimi: [marimeA(coverUrl)] };
  }
  return { banners: pairs.map((p) => p.url), links: pairs.map((p) => p.link), marimi: pairs.map((p) => marimeA(p.url)) };
}
