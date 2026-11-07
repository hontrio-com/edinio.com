"use client";

import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { resolveHref } from "@/lib/pages/href";
import { cardurileVitrinei } from "@/lib/storefront/design/hero-teme";
import { hrefCatreProduse } from "@/lib/storefront/category-href";
import { useStoreChrome } from "@/components/storefront/StorefrontProvider";

/**
 * Bannerul „vitrina” (temele Procyon si Canopus, lotul 5 din etapa 24 a `docs/editor-magazin/PLAN.md`, dupa evomag si
 * QwertyKey): un rand de carduri inalte, fiecare o fotografie cu eticheta sus si titlul, textul si butonul jos, peste
 * o umbra. Pe desktop se vad patru; pe telefon unul si ceva din urmatorul, iar randul se trage cu degetul.
 *
 * Fara titlu vizibil al paginii: H1-ul e ascuns, cu numele magazinului (ca la „Doar imagini”). Fara carduri, nu se
 * vede nimic in afara de el.
 */
export function HeroVitrina({ settings }: { settings: Record<string, unknown> }) {
  const chrome = useStoreChrome();
  const { business, basePath } = chrome;
  const nume = business.store_name ?? business.business_name;
  const carduri = cardurileVitrinei(settings);
  const catreProduse = hrefCatreProduse(chrome);

  return (
    <section className="mx-auto px-4 pt-5 sm:pt-6" style={{ maxWidth: "var(--st-container)" }}>
      <h1 className="sr-only">
        {nume}
        {business.tagline ? ` - ${business.tagline}` : ""}
      </h1>
      {carduri.length > 0 && (
        <div className="-mx-4 px-4 flex gap-3 sm:gap-4 overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {carduri.map((c, i) => (
            <a key={i} href={c.link ? resolveHref(c.link, basePath) : catreProduse}
              className="group relative isolate shrink-0 snap-start overflow-hidden rounded-[var(--st-radius-lg)] w-[78%] sm:w-[46%] lg:w-[calc((100%-3rem)/4)] aspect-[3/4]"
              style={{ backgroundColor: "color-mix(in srgb, var(--st-primary) 35%, #0b0b0b)" }}>
              <Image src={c.imagine} alt="" fill priority={i < 2}
                sizes="(max-width: 640px) 78vw, (max-width: 1024px) 46vw, 25vw"
                className="-z-10 object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
              <span aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
              {c.eticheta && (
                <span className="absolute left-4 top-4 rounded-full px-3 py-1 text-[13px] font-bold bg-[var(--st-accent)] text-[var(--st-accent-contrast)]">
                  {c.eticheta}
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-5 text-white">
                <span className="text-[20px] sm:text-[22px] font-bold leading-tight" style={{ fontFamily: "var(--st-font-heading)" }}>
                  {c.titlu}
                </span>
                {c.text && <span className="text-[13px] leading-snug text-white/75 line-clamp-2">{c.text}</span>}
                <span className="mt-2 inline-flex w-fit items-center gap-1.5 h-10 px-4 rounded-[var(--st-radius-btn)] text-[13px] font-semibold bg-[var(--st-primary)] text-[var(--st-primary-contrast)]">
                  Vezi oferta <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </span>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
