"use client";

import Image from "next/image";
import { ShoppingCart } from "lucide-react";
import { resolveHeroBanners } from "@/lib/storefront/design/hero-banners";
import { useStoreChrome } from "@/components/storefront/StorefrontProvider";
import { hrefCatreProduse } from "@/lib/storefront/category-href";

/**
 * Hero cu imagine si text peste ea, varianta „overlay".
 *
 * Numele magazinului, sloganul si un buton, asezate peste prima imagine, sub un
 * gradient care le tine lizibile indiferent cat de deschisa e fotografia. Fara
 * imagine, fundalul e culoarea magazinului.
 *
 * H1-ul e vizibil aici, deci varianta il declara in registry (`providesH1`) si
 * nu se mai adauga unul ascuns.
 */
export function HeroOverlay() {
  const chrome = useStoreChrome();
  const { business, pageContent } = chrome;

  const nume = business.store_name ?? business.business_name;
  const { banners } = resolveHeroBanners(pageContent as Record<string, unknown>, business.cover_url);
  const catreProduse = hrefCatreProduse(chrome);

  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0" style={{ backgroundColor: "var(--st-primary)" }} />
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
        <a href={catreProduse}
          className="inline-flex items-center gap-2 px-8 py-3.5 text-sm font-bold rounded-2xl shadow-lg transition-all hover:scale-105 active:scale-[0.98]"
          style={{
            backgroundColor: "var(--st-primary)",
            color: "var(--st-primary-contrast)",
            // `${color}88` presupunea notatie hex si s-ar fi rupt la orice alta
            // notatie de culoare acceptata de parser.
            boxShadow: "0 4px 20px color-mix(in srgb, var(--st-primary) 53%, transparent)",
          }}>
          <ShoppingCart className="h-4 w-4" />
          Cumpara acum
        </a>
      </div>
    </section>
  );
}
