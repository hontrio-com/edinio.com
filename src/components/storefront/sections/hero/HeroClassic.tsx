"use client";

import Image from "next/image";
import { ShoppingCart } from "lucide-react";
import { resolveHeroBanners } from "@/lib/storefront/design/hero-banners";
import { useStorefront } from "@/components/storefront/StorefrontProvider";
import { HeroBanners } from "./HeroBanners";

/**
 * Hero-ul paginii de magazin, varianta classic.
 *
 * Implicit bannerul se afiseaza singur, turnat, fara nimic peste el. Cand
 * comerciantul cere continut (`hero_show_content`), sau cand nu exista nicio
 * imagine dar exista un slogan, se randeaza varianta cu gradient si overlay.
 *
 * H1-ul face parte din aceeasi componenta pentru ca cele doua se conditioneaza
 * reciproc: pagina trebuie sa aiba exact un H1, iar overlay-ul afiseaza deja
 * unul vizibil. Cand nu il afiseaza, se pune unul ascuns, inaintea sectiunii.
 */
export function HeroClassic() {
  const { business, basePath, color, pageContent } = useStorefront();

  const nume = business.store_name ?? business.business_name;
  const { banners, links } = resolveHeroBanners(pageContent as Record<string, unknown>, business.cover_url);
  const doarImagine = banners.length > 0 && pageContent.hero_show_content !== true;
  const areHero = banners.length > 0 || !!business.tagline;

  return (
    <>
      {(doarImagine || !areHero) && (
        <h1 className="sr-only">
          {nume}
          {business.tagline ? ` - ${business.tagline}` : ""}
        </h1>
      )}

      {doarImagine ? (
        <HeroBanners banners={banners} links={links} alt={nume} basePath={basePath} />
      ) : areHero ? (
        <section className="relative overflow-hidden">
          <div className="absolute inset-0" style={{ backgroundColor: color }} />
          {banners[0] && (
            <Image src={banners[0]} alt="" fill className="object-cover" sizes="100vw" priority />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/40 to-black/70" />
          <div className="relative z-10 max-w-3xl mx-auto px-4 py-20 sm:py-28 text-center text-white">
            {business.logo_url && (
              <Image src={business.logo_url} alt={nume} width={72} height={72}
                className="rounded-2xl object-cover mx-auto mb-5 border-2 border-white/20 shadow-2xl" />
            )}
            <h1 className="text-3xl sm:text-4xl font-bold mb-3 drop-shadow-sm tracking-tight">{nume}</h1>
            {business.tagline && (
              <p className="text-lg text-white/85 mb-8 leading-relaxed max-w-xl mx-auto">{business.tagline}</p>
            )}
            <a href="#produse"
              className="inline-flex items-center gap-2 px-8 py-3.5 text-sm font-bold rounded-2xl shadow-lg transition-all hover:scale-105 active:scale-[0.98]"
              style={{ backgroundColor: color, color: "white", boxShadow: `0 4px 20px ${color}88` }}>
              <ShoppingCart className="h-4 w-4" />
              Cumpara acum
            </a>
          </div>
        </section>
      ) : null}
    </>
  );
}
