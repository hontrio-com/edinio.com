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
export function PlaciPromo({ settings }: { settings: Record<string, unknown> }) {
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

  return (
    <section className="mb-12">
      {titlu && <h2 className={TITLU_SECTIUNE} style={{ fontFamily: "var(--st-font-heading)" }}>{titlu}</h2>}
      <ul className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-5">
        {placi.map((p, i) => {
          const continut = (
            <span className="relative h-full flex flex-col overflow-hidden rounded-[var(--st-radius-lg)] p-4 sm:p-6 aspect-[4/4.6] sm:aspect-[4/4.2]"
              style={{ background: DEGRADE_PLACA }}>
              <span className="relative z-10 block text-[16px] sm:text-[20px] font-bold leading-tight tracking-tight text-[var(--st-text)]"
                style={{ fontFamily: "var(--st-font-heading)" }}>
                {p.titlu}
              </span>
              {p.link && (
                <span className="relative z-10 mt-2 sm:mt-3 inline-flex items-center gap-1.5 text-[13px] sm:text-[14px] font-semibold text-[var(--st-primary)]">
                  {p.eticheta || ETICHETA_PLACA_IMPLICITA}
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" strokeWidth={2.2} />
                </span>
              )}
              {p.imagine && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cdnImage(p.imagine, 600)} alt="" loading="lazy"
                  className="absolute right-0 bottom-0 w-[82%] h-[62%] object-contain object-right-bottom rounded-[var(--st-radius)] group-hover:scale-[1.05] origin-bottom-right transition-transform duration-500" />
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
