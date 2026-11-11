"use client";

import { ArrowRight } from "lucide-react";
import { cdnImage } from "@/lib/cdn-image";
import { resolveHref } from "@/lib/pages/href";
import { ETICHETA_PLACA_IMPLICITA, placileDinSetari } from "@/lib/storefront/design/placi-promo";
import { useStoreChrome } from "@/components/storefront/StorefrontProvider";
import { DEGRADE_PLACA, TITLU_SECTIUNE } from "@/components/storefront/sections/_shared/aspect-jupiter";

/**
 * „Plăci de recomandare”, varianta „rotunde” (tema Jupiter, etapa 16.3): patru pe rand.
 *
 * Aspectul de la etapa 23 („sa nu fie identica 1 la 1 cu Dedeman”), in locul pozei pe cerc alb: o placa inalta, in
 * degrade din culoarea principala, cu titlul si indemnul sus si poza mare jos, care creste sub mouse. Pozele temei sunt
 * decupate pe transparent, deci stau pe placa fara chenar; o poza cu fond se vede rotunjita, la fel de curat. Cheia
 * variantei ramane „rotunde”: e salvata in design, deci nu se redenumeste.
 *
 * Fara placi, in magazin nu apare nimic; in editor, un indemn, ca sectiunea sa poata fi gasita si umpluta.
 */
export function PlaciPromo({ settings, varianta }: { settings: Record<string, unknown>; varianta?: string }) {
  const { basePath, esteEditorDesign } = useStoreChrome();
  const placi = placileDinSetari(settings);
  const titlu = typeof settings.titlu === "string" ? settings.titlu.trim() : "";

  if (placi.length === 0) {
    return esteEditorDesign ? (
      <p className="mb-10 rounded-[var(--st-radius)] border border-dashed border-[var(--st-border)] px-4 py-6 text-center text-sm text-[var(--st-muted)]">
        Plăci de recomandare: adaugă-le din panoul secțiunii.
      </p>
    ) : null;
  }

  /*
   * Varianta „imagine” (tema Venus, etapa 24, dupa placile de sub bannerul Altex): fotografia pe toata placa, titlul alb
   * jos, peste o umbra. Cinci pe rand pe calculator; pe telefon se deruleaza orizontal, cate doua si ceva, ca pe model.
   */
  if (varianta === "imagine") {
    return (
      <section className="mb-12">
        {titlu && <h2 className={TITLU_SECTIUNE} style={{ fontFamily: "var(--st-font-heading)" }}>{titlu}</h2>}
        <ul className={`flex lg:grid ${placi.length % 4 === 0 ? "lg:grid-cols-4" : "lg:grid-cols-5"} gap-3 lg:gap-4 overflow-x-auto lg:overflow-visible snap-x snap-mandatory -mx-4 px-4 lg:mx-0 lg:px-0 [scrollbar-width:none]`}>
          {placi.map((p, i) => {
            const continut = (
              <span className="relative block aspect-[4/5] overflow-hidden rounded-[var(--st-radius-lg)] bg-[var(--st-border)]">
                {p.imagine && (
                  // Etapa 25.24: 384 sau 640 dupa latimea placii (pe telefon ~150 px), nu mereu 640.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cdnImage(p.imagine, 640)} srcSet={`${cdnImage(p.imagine, 384)} 384w, ${cdnImage(p.imagine, 640)} 640w`}
                    sizes="(max-width: 1024px) 32vw, 300px" alt="" loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.06] transition-transform duration-700" />
                )}
                <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />
                <span className="absolute inset-x-0 bottom-0 p-3.5 sm:p-4 text-[14.5px] sm:text-[16px] font-bold leading-snug text-white text-center"
                  style={{ fontFamily: "var(--st-font-heading)" }}>
                  {p.titlu}
                </span>
              </span>
            );
            return (
              <li key={i} className="shrink-0 w-[42%] sm:w-[30%] lg:w-auto snap-start">
                {p.link ? <a href={resolveHref(p.link, basePath)} className="group block">{continut}</a> : <div className="group">{continut}</div>}
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  return (
    <section className="mb-12">
      {titlu && <h2 className={TITLU_SECTIUNE} style={{ fontFamily: "var(--st-font-heading)" }}>{titlu}</h2>}
      <ul className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-5">
        {placi.map((p, i) => {
          const continut = (
            <span className="relative h-full flex flex-col overflow-hidden rounded-[var(--st-radius-lg)] p-3.5 sm:p-6 aspect-[4/5.4] sm:aspect-[4/3.5]"
              style={{ background: DEGRADE_PLACA }}>
              <span className="relative z-10 block text-[16px] sm:text-[20px] font-bold leading-tight tracking-tight text-[var(--st-text)]"
                style={{ fontFamily: "var(--st-font-heading)" }}>
                {p.titlu}
              </span>
              {p.link && (
                <span className="relative z-10 mt-1.5 sm:mt-3 inline-flex items-center gap-1 sm:gap-1.5 text-[12.5px] sm:text-[14px] leading-snug font-semibold text-[var(--st-primary)]">
                  {p.eticheta || ETICHETA_PLACA_IMPLICITA}
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" strokeWidth={2.2} />
                </span>
              )}
              {p.imagine && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cdnImage(p.imagine, 640)} srcSet={`${cdnImage(p.imagine, 384)} 384w, ${cdnImage(p.imagine, 640)} 640w`}
                  sizes="(max-width: 1024px) 32vw, 240px" alt="" loading="lazy"
                  className="absolute right-2 bottom-2 sm:right-3 sm:bottom-3 w-[84%] h-[54%] sm:w-[78%] sm:h-[66%] object-contain object-right-bottom rounded-[var(--st-radius)] group-hover:scale-[1.05] origin-bottom-right transition-transform duration-500" />
              )}
            </span>
          );
          return (
            <li key={i}>
              {p.link ? (
                <a href={resolveHref(p.link, basePath)} className="group block h-full rounded-[var(--st-radius-lg)] hover:shadow-[0_14px_30px_-12px_rgba(16,24,40,0.25)] transition-shadow duration-300">{continut}</a>
              ) : <div className="group h-full">{continut}</div>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
