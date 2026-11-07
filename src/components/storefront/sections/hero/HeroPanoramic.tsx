"use client";

import Image from "next/image";
import { resolveHref } from "@/lib/pages/href";
import { resolveHeroBanners } from "@/lib/storefront/design/hero-banners";
import { imagineaBannerului, textSetare } from "@/lib/storefront/design/hero-teme";
import { hrefCatreProduse } from "@/lib/storefront/category-href";
import { useStoreChrome } from "@/components/storefront/StorefrontProvider";

/**
 * Bannerul „panoramic” (tema Marte, etapa 24 din `docs/editor-magazin/PLAN.md`, dupa XStore Furniture Dark): o
 * fotografie lata, cat pagina, cu titlul mare, textul si un buton conturat peste ea, jos, pe o umbra care le tine
 * lizibile pe orice poza. Pe telefon placa e mai inalta, ca titlul sa nu acopere toata poza.
 *
 * Fara imagine: fondul in culoarea principala, inchisa. Titlul e H1-ul paginii (`providesH1`).
 */
export function HeroPanoramic({ settings }: { settings: Record<string, unknown> }) {
  const chrome = useStoreChrome();
  const { business, basePath, pageContent } = chrome;
  const nume = business.store_name ?? business.business_name;
  const { banners } = resolveHeroBanners(pageContent as Record<string, unknown>, business.cover_url);
  const imagine = imagineaBannerului(settings, banners);
  const titlu = textSetare(settings.titlu) || nume;
  const text = textSetare(settings.text) || business.tagline || "";
  const buton = textSetare(settings.buton) || "Vezi colectia";
  const link = textSetare(settings.link);
  const href = link ? resolveHref(link, basePath) : hrefCatreProduse(chrome);

  return (
    <section className="mx-auto px-4 pt-5 sm:pt-6" style={{ maxWidth: "var(--st-container)" }}>
      <div className="relative isolate overflow-hidden rounded-[var(--st-radius-lg)] min-h-[440px] sm:min-h-[520px] lg:min-h-0 lg:aspect-[2.4/1] flex items-end"
        style={{ backgroundColor: "color-mix(in srgb, var(--st-primary) 30%, #0b0b0b)" }}>
        {imagine && <Image src={imagine} alt="" fill priority sizes="100vw" className="-z-10 object-cover" />}
        <span aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/75 via-black/25 to-black/5" />
        <div className="w-full px-6 pb-10 sm:px-12 sm:pb-14 lg:pb-16 text-center text-white">
          <h1 className="text-[36px] sm:text-[54px] xl:text-[72px] font-semibold leading-[1.02] tracking-tight"
            style={{ fontFamily: "var(--st-font-heading)" }}>
            {titlu}
            {titlu !== nume && <span className="sr-only"> - {nume}</span>}
          </h1>
          {text && <p className="mt-4 mx-auto max-w-xl text-[15px] sm:text-[17px] leading-relaxed text-white/80">{text}</p>}
          <a href={href}
            className="mt-8 inline-flex items-center h-12 px-8 rounded-[var(--st-radius-btn)] border border-white/70 text-[14px] font-semibold tracking-[0.08em] uppercase text-white transition-colors hover:bg-white hover:text-black">
            {buton}
          </a>
        </div>
      </div>
    </section>
  );
}
