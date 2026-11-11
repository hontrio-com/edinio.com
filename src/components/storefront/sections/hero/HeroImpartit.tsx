"use client";

import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { resolveHref } from "@/lib/pages/href";
import { resolveHeroBanners } from "@/lib/storefront/design/hero-banners";
import { imagineaBannerului, textSetare } from "@/lib/storefront/design/hero-teme";
import { hrefCatreProduse } from "@/lib/storefront/category-href";
import { useStoreChrome } from "@/components/storefront/StorefrontProvider";

const TONURI = {
  principala: { fond: "var(--st-primary)", scris: "var(--st-primary-contrast)", fondButon: "var(--st-accent)", scrisButon: "var(--st-accent-contrast)" },
  accent: { fond: "var(--st-accent)", scris: "var(--st-accent-contrast)", fondButon: "var(--st-primary)", scrisButon: "var(--st-primary-contrast)" },
  inchis: { fond: "#0F0F10", scris: "#FFFFFF", fondButon: "#FFFFFF", scrisButon: "#0F0F10" },
  deschis: { fond: "color-mix(in srgb, var(--st-text) 5%, var(--st-surface))", scris: "var(--st-text)", fondButon: "var(--st-primary)", scrisButon: "var(--st-primary-contrast)" },
} as const;

/**
 * Bannerul „impartit” (tema Mercur, etapa 24 din `docs/editor-magazin/PLAN.md`, dupa Woodmart Pets): jumatatea din stanga
 * in culoarea principala (sau de accent), cu titlul mare, textul si butonul in cealalta culoare; jumatatea din dreapta,
 * fotografia. Pe telefon, fotografia vine sub text.
 *
 * Fara titlu ales, numele magazinului; fara text, sloganul; fara link, catalogul. Titlul e H1-ul paginii (`providesH1`),
 * cu numele magazinului alaturi pentru cititoarele de ecran cand titlul e altul.
 */
export function HeroImpartit({ settings }: { settings: Record<string, unknown> }) {
  const chrome = useStoreChrome();
  const { business, basePath, pageContent } = chrome;
  const nume = business.store_name ?? business.business_name;
  const { banners } = resolveHeroBanners(pageContent as Record<string, unknown>, business.cover_url);
  const imagine = imagineaBannerului(settings, banners);
  const titlu = textSetare(settings.titlu) || nume;
  const text = textSetare(settings.text) || business.tagline || "";
  const buton = textSetare(settings.buton) || "Vezi produsele";
  const link = textSetare(settings.link);
  const href = link ? resolveHref(link, basePath) : hrefCatreProduse(chrome);
  // Fondul jumatatii cu text (etapa 24: si negru si nuanta deschisa, pentru temele de moda) si butonul care iese din el.
  const ton = TONURI[settings.fond === "accent" || settings.fond === "inchis" || settings.fond === "deschis" ? settings.fond : "principala"];
  const { fond, scris, fondButon, scrisButon } = ton;

  return (
    <section className="mx-auto px-4 pt-5 sm:pt-6" style={{ maxWidth: "var(--st-container)" }}>
      <div className="grid lg:grid-cols-2 overflow-hidden rounded-[var(--st-radius-lg)]">
        <div className="relative isolate overflow-hidden px-7 py-10 sm:px-12 sm:py-14 lg:px-16 lg:py-20 flex flex-col justify-center"
          style={{ backgroundColor: fond, color: scris }}>
          {/* Doua cercuri mari, abia vizibile, ca fondul sa nu fie o placa plata. */}
          <span aria-hidden className="absolute -z-10 -top-24 -left-20 w-72 h-72 rounded-full bg-white/[0.07]" />
          <span aria-hidden className="absolute -z-10 -bottom-32 right-[-6rem] w-96 h-96 rounded-full bg-white/[0.05]" />
          <h1 className="text-[34px] sm:text-[46px] xl:text-[58px] font-extrabold leading-[1.04] tracking-tight max-w-xl"
            style={{ fontFamily: "var(--st-font-heading)" }}>
            {titlu}
            {titlu !== nume && <span className="sr-only"> - {nume}</span>}
          </h1>
          {text && <p className="mt-5 text-[15.5px] sm:text-[17px] leading-relaxed max-w-lg">{text}</p>}
          <a href={href}
            className="mt-8 self-start inline-flex items-center gap-2 h-12 px-7 rounded-[var(--st-radius-btn)] text-[15px] font-bold shadow-[0_8px_20px_-8px_rgba(0,0,0,0.4)] transition-transform hover:-translate-y-0.5"
            style={{ backgroundColor: fondButon, color: scrisButon }}>
            {buton}
            <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2.4} />
          </a>
        </div>
        <div className="relative min-h-[260px] sm:min-h-[340px] lg:min-h-[500px]" style={{ backgroundColor: fond }}>
          {imagine && (
            <Image src={imagine} alt="" fill priority sizes="(max-width: 640px) 75vw, (max-width: 1024px) 100vw, 50vw" className="object-cover" />
          )}
        </div>
      </div>
    </section>
  );
}
