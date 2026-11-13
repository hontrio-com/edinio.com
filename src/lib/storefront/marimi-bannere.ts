import { createAdminClient } from "@/lib/supabase/admin";
import { CacheScurt } from "@/lib/utils/cache-scurt";
import { CHEIE_MARIMI_BANNERE, resolveHeroBanners, type MarimeBanner } from "@/lib/storefront/design/hero-banners";
import type { SectionInstance } from "@/lib/storefront/design/types";

/*
  ═══════════════════════════════════════════════════════════════════════════
  MARIMILE BANNERELOR, DE PE SERVER (13.11.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Locul bannerului ia raportul primului banner (`raport-bannere.ts`). Masurat doar in browser, la incarcarea pozei, hero-ul
  ar fi pornit pe raportul designului si ar fi sarit dupa (la eSafe: ~90 px, tot ce e dedesubt mutat, adica CLS). Asa ca
  marimea se ia de aici, din Biblioteca Media: incarcarea (`/api/upload`) ii scrie latimea si inaltimea, citite cu `sharp`.

  O interogare pe cheia unica `(business_id, r2_key)`, doar pe pagina principala, doar cand hero-ul e unul care isi
  potriveste locul. Adresa unei poze nu se schimba niciodata (numele e un UUID nou la fiecare incarcare), deci marimea ei
  se tine in memoria instantei o zi; o poza negasita, cinci minute (poate abia se inregistreaza).

  Cheia se scoate din CALEA adresei, nu dupa domeniile din configurare: aceeasi poza poate fi ceruta de pe CDN sau de pe
  domeniul brut al depozitului (`r2-url.ts`), iar cheia e aceeasi. Ce nu e in Biblioteca (pozele temelor din `/teme/`,
  adresele externe) ramane fara marime si se masoara in browser; pozele temelor sunt facute pe masura locului lor.
*/

/** Variantele de hero cu loc care isi ia raportul din banner (`limiteRaport` in componenta lor). */
export const VARIANTE_CU_LOC_POTRIVIT: ReadonlySet<string> = new Set(["carduri", "banners", "categories"]);

const ZI = 24 * 60 * 60 * 1000;
const NEGASITA = 5 * 60 * 1000;
const cache = new CacheScurt<MarimeBanner | null>(ZI, 2000);

/**
 * Cheia obiectului din depozit (`media_library.r2_key`) pentru o adresa de poza: calea, fara `/` de la inceput si fara
 * prefixul de redimensionare al CDN-ului (`cdn-cgi/image/<optiuni>/`). `null` pentru adresele relative si cele stricate.
 */
export function cheiaDinAdresa(adresa: string): string | null {
  if (!/^https?:\/\//i.test(adresa)) return null;
  try {
    const cale = new URL(adresa).pathname.replace(/^\/+/, "").replace(/^cdn-cgi\/image\/[^/]*\//, "");
    return cale && cale.length <= 500 ? cale : null;
  } catch {
    return null;
  }
}

/** Marimile pozelor din Biblioteca Media a magazinului, pe adresa; cele negasite lipsesc din raspuns. */
export async function marimiDinBiblioteca(businessId: string, adrese: string[]): Promise<Record<string, MarimeBanner>> {
  const out: Record<string, MarimeBanner> = {};
  const deCautat = new Map<string, string[]>();
  for (const adresa of new Set(adrese)) {
    const dinCache = cache.get(`${businessId}|${adresa}`);
    if (dinCache !== undefined) {
      if (dinCache) out[adresa] = dinCache;
      continue;
    }
    const cheie = cheiaDinAdresa(adresa);
    if (cheie) deCautat.set(cheie, [...(deCautat.get(cheie) ?? []), adresa]);
  }
  if (deCautat.size === 0) return out;

  const { data, error } = await createAdminClient()
    .from("media_library")
    .select("r2_key, width, height")
    .eq("business_id", businessId)
    .in("r2_key", [...deCautat.keys()]);
  // O citire cazuta nu se tine minte: data viitoare se incearca din nou, iar pana atunci masoara browserul.
  if (error) return out;

  const gasite = new Map((data ?? []).map((r) => [r.r2_key, r]));
  for (const [cheie, adreseCheii] of deCautat) {
    const r = gasite.get(cheie);
    const marime: MarimeBanner | null = r && r.width && r.height && r.width > 0 && r.height > 0 ? [r.width, r.height] : null;
    for (const adresa of adreseCheii) {
      cache.set(`${businessId}|${adresa}`, marime, marime ? undefined : NEGASITA);
      if (marime) out[adresa] = marime;
    }
  }
  return out;
}

/** `page_content` cu marimile bannerelor alaturi, cand s-au gasit. */
export type CuMarimiBannere<T> = T & { [CHEIE_MARIMI_BANNERE]?: Record<string, MarimeBanner> };

/**
 * `page_content` de trimis browserului, cu marimile bannerelor alaturi (`CHEIE_MARIMI_BANNERE`), cand pagina are un hero
 * care le foloseste. Altfel, exact obiectul primit: nicio citire in plus.
 *
 * ⚠ Rezultatul pleaca DOAR spre randare; nu se scrie niciodata inapoi in baza.
 */
export async function cuMarimileBannerelor<T extends Record<string, unknown>>(
  businessId: string,
  pageContent: T,
  home: SectionInstance[],
  coverUrl: string | null | undefined,
): Promise<CuMarimiBannere<T>> {
  const neatins = pageContent as CuMarimiBannere<T>;
  const hero = home.find((s) => s.kind === "hero" && s.enabled);
  if (!hero || !VARIANTE_CU_LOC_POTRIVIT.has(hero.variant)) return neatins;
  const { banners } = resolveHeroBanners(pageContent, coverUrl);
  if (banners.length === 0) return neatins;
  const marimi = await marimiDinBiblioteca(businessId, banners);
  return Object.keys(marimi).length === 0 ? neatins : { ...pageContent, [CHEIE_MARIMI_BANNERE]: marimi };
}
