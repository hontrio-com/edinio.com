"use client";

import { resolveHeroBanners } from "@/lib/storefront/design/hero-banners";
import { useStoreChrome } from "@/components/storefront/StorefrontProvider";
import { HeroBanners } from "./HeroBanners";

/**
 * Hero doar cu imagini, varianta „banners".
 *
 * Bannerul se afiseaza turnat, fara nimic peste el: cine si-a facut o imagine cu
 * mesajul deja in ea nu vrea alt titlu suprapus.
 *
 * Fiindca nu are titlu vizibil, adauga unul ascuns — o pagina fara H1 isi pierde
 * titlul in rezultatele cautarii.
 */
export function HeroBannersOnly() {
  const { business, basePath, pageContent } = useStoreChrome();

  const nume = business.store_name ?? business.business_name;
  const { banners, links } = resolveHeroBanners(pageContent as Record<string, unknown>, business.cover_url);

  return (
    <>
      <h1 className="sr-only">
        {nume}
        {business.tagline ? ` - ${business.tagline}` : ""}
      </h1>
      {banners.length > 0 && (
        <HeroBanners banners={banners} links={links} alt={nume} basePath={basePath} />
      )}
    </>
  );
}
