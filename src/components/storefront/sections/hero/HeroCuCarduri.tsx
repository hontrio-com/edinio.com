"use client";

import { resolveHref } from "@/lib/pages/href";
import { cdnImage } from "@/lib/cdn-image";
import { resolveHeroBanners } from "@/lib/storefront/design/hero-banners";
import { cardurileHero, type CardHero } from "@/lib/storefront/design/hero-carduri";
import { useStoreChrome } from "@/components/storefront/StorefrontProvider";
import { BannerSlider } from "./HeroBanners";

/** Fondul cardurilor: o tenta din culoarea principala peste fond, ca banda randurilor de produse. */
const GRI = "color-mix(in srgb, var(--st-primary) 4%, var(--st-bg))";

/**
 * Bannerul principal cu doua carduri alaturate, varianta „carduri” (tema Jupiter, etapa 16.3), dupa dedeman.ro:
 * caruselul bannerelor in doua treimi, cu paginare in segmente, si in dreapta doua carduri gri cu titlu, text si
 * imagine, fiecare cu linkul lui.
 *
 * Bannerele sunt ale magazinului (`page_content`, ca la celelalte variante); cardurile sunt reglajele sectiunii. Fara
 * carduri, caruselul ia toata latimea; fara bannere, raman cardurile.
 */
export function HeroCuCarduri({ settings }: { settings: Record<string, unknown> }) {
  const { business, basePath, pageContent } = useStoreChrome();
  const nume = business.store_name ?? business.business_name;
  const { banners, links } = resolveHeroBanners(pageContent as Record<string, unknown>, business.cover_url);
  const carduri = cardurileHero(settings);
  if (banners.length === 0 && carduri.length === 0) return <h1 className="sr-only">{nume}</h1>;

  return (
    <section className="mx-auto px-4 pt-5 sm:pt-6" style={{ maxWidth: "var(--st-container)" }}>
      <h1 className="sr-only">
        {nume}
        {business.tagline ? ` - ${business.tagline}` : ""}
      </h1>
      <div className={`grid gap-4 ${banners.length > 0 && carduri.length > 0 ? "lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : ""}`}>
        {banners.length > 0 && (
          <BannerSlider banners={banners} links={links} alt={nume} basePath={basePath} paginare="segmente"
            wrapperClass="relative rounded-[3px] overflow-hidden"
            slideClass="shrink-0 w-full snap-center aspect-[2/1] lg:aspect-[2.14/1] bg-[var(--st-bg)]" />
        )}
        {carduri.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 lg:grid-rows-2">
            {carduri.map((c, i) => <Card key={i} card={c} basePath={basePath} />)}
          </div>
        )}
      </div>
    </section>
  );
}

function Card({ card, basePath }: { card: CardHero; basePath: string }) {
  const href = card.link ? resolveHref(card.link, basePath) : null;
  const continut = (
    <>
      <span className="flex-1 min-w-0">
        <span className="block text-[20px] lg:text-[22px] leading-tight text-[var(--st-text)]" style={{ fontFamily: "var(--st-font-heading)" }}>{card.titlu}</span>
        {card.text && <span className="mt-2.5 block text-[15px] leading-snug text-[var(--st-text)]/85">{card.text}</span>}
      </span>
      {card.imagine && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cdnImage(card.imagine, 400)} alt="" className="w-28 h-24 sm:w-36 sm:h-28 shrink-0 object-cover rounded-[3px]" />
      )}
    </>
  );
  const cls = "h-full min-h-[150px] flex items-center gap-4 p-6 lg:p-7 rounded-[3px] transition-shadow";
  return href ? (
    <a href={href} className={`${cls} hover:shadow-[0_4px_14px_rgba(0,0,0,0.08)]`} style={{ backgroundColor: GRI }}>{continut}</a>
  ) : (
    <div className={cls} style={{ backgroundColor: GRI }}>{continut}</div>
  );
}
