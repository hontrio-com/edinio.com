"use client";

import { resolveHref } from "@/lib/pages/href";
import { cdnImage } from "@/lib/cdn-image";
import { resolveHeroBanners } from "@/lib/storefront/design/hero-banners";
import { cardurileHero, type CardHero } from "@/lib/storefront/design/hero-carduri";
import { useStoreChrome } from "@/components/storefront/StorefrontProvider";
import { ArrowRight } from "lucide-react";
import { DEGRADE_PLACA } from "@/components/storefront/sections/_shared/aspect-jupiter";
import { BannerSlider } from "./HeroBanners";

/**
 * Bannerul principal cu doua carduri alaturate, varianta „carduri” (tema Jupiter, etapa 16.3), dupa dedeman.ro:
 * caruselul bannerelor in doua treimi, cu paginare in segmente, si in dreapta doua carduri cu titlu, text si imagine,
 * fiecare cu linkul lui (de la etapa 23, in degrade, cu indemn; vezi `Card`).
 *
 * Bannerele sunt ale magazinului (`page_content`, ca la celelalte variante); cardurile sunt reglajele sectiunii. Fara
 * carduri, caruselul ia toata latimea; fara bannere, raman cardurile.
 *
 * ⚠ Acelasi raport pe orice ecran, 2,14:1 (etapa 20): un banner facut la el nu se taie nicaieri. Pe telefon era 2:1,
 * deci `object-cover` taia cate 3% din fiecare margine, exact unde stau de obicei textul si sigla bannerului.
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
            wrapperClass="relative rounded-[var(--st-radius-lg)] overflow-hidden"
            slideClass="shrink-0 w-full snap-center aspect-[2.14/1] bg-[var(--st-bg)]" />
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

/**
 * Un card de langa banner (etapa 23): placa in degrade din culoarea principala, titlul ingrosat, textul, indemnul cu
 * sageata cand are link, poza mare in dreapta, care creste sub mouse.
 */
function Card({ card, basePath }: { card: CardHero; basePath: string }) {
  const href = card.link ? resolveHref(card.link, basePath) : null;
  const continut = (
    <>
      <span className="relative z-10 flex-1 min-w-0">
        <span className="block text-[19px] lg:text-[22px] font-bold leading-tight tracking-tight text-[var(--st-text)]" style={{ fontFamily: "var(--st-font-heading)" }}>{card.titlu}</span>
        {card.text && <span className="mt-2 block text-[14.5px] leading-snug text-[var(--st-muted)]">{card.text}</span>}
        {href && (
          <span className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-semibold text-[var(--st-primary)]">
            Vezi produsele
            <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" strokeWidth={2.2} />
          </span>
        )}
      </span>
      {card.imagine && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cdnImage(card.imagine, 400)} alt="" className="w-28 h-24 sm:w-40 sm:h-32 shrink-0 object-contain rounded-[var(--st-radius)] group-hover:scale-[1.06] transition-transform duration-500" />
      )}
    </>
  );
  const cls = "group h-full min-h-[150px] flex items-center gap-4 p-6 lg:p-7 rounded-[var(--st-radius-lg)] overflow-hidden transition-shadow duration-300";
  return href ? (
    <a href={href} className={`${cls} hover:shadow-[0_14px_30px_-12px_rgba(16,24,40,0.25)]`} style={{ background: DEGRADE_PLACA }}>{continut}</a>
  ) : (
    <div className={cls} style={{ background: DEGRADE_PLACA }}>{continut}</div>
  );
}
