"use client";

import { cdnImage } from "@/lib/cdn-image";
import { resolveHref } from "@/lib/pages/href";
import { ETICHETA_PLACA_IMPLICITA, placileDinSetari } from "@/lib/storefront/design/placi-promo";
import { useStoreChrome } from "@/components/storefront/StorefrontProvider";

/** Fondul placii: aceeasi tenta ca restul sectiunilor temei. */
const GRI = "color-mix(in srgb, var(--st-primary) 4%, var(--st-bg))";

/**
 * „Plăci de recomandare”, varianta „rotunde” (tema Jupiter, etapa 16.3): patru pe rand, fiecare cu imaginea pe un cerc
 * alb, titlul si linkul subliniat in culoarea principala, ca sectiunea „Recomandări” de pe modelul temei.
 *
 * Fara placi, in magazin nu apare nimic; in editor, un indemn, ca sectiunea sa poata fi gasita si umpluta.
 */
export function PlaciPromo({ settings }: { settings: Record<string, unknown> }) {
  const { basePath, esteEditorDesign } = useStoreChrome();
  const placi = placileDinSetari(settings);
  const titlu = typeof settings.titlu === "string" ? settings.titlu.trim() : "";

  if (placi.length === 0) {
    return esteEditorDesign ? (
      <p className="mb-10 rounded-[3px] border border-dashed border-[var(--st-border)] px-4 py-6 text-center text-sm text-[var(--st-muted)]">
        Plăci de recomandare: adaugă-le din panoul secțiunii.
      </p>
    ) : null;
  }

  return (
    <section className="mb-10">
      {titlu && <h2 className="text-[24px] leading-tight text-[var(--st-text)] mb-4" style={{ fontFamily: "var(--st-font-heading)" }}>{titlu}</h2>}
      <ul className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {placi.map((p, i) => {
          const continut = (
            <>
              <span className="relative block aspect-[4/3.6] rounded-[3px] overflow-hidden" style={{ backgroundColor: GRI }}>
                <span aria-hidden className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[86%] aspect-square rounded-full bg-[var(--st-surface)]" />
                {p.imagine && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cdnImage(p.imagine, 600)} alt="" loading="lazy"
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[78%] aspect-square rounded-full object-cover group-hover:scale-[1.03] transition-transform duration-500" />
                )}
              </span>
              <span className="mt-3 block text-[16px] leading-snug text-[var(--st-text)]">{p.titlu}</span>
              {p.link && (
                <span className="mt-1 block text-[14px] underline underline-offset-2" style={{ color: "var(--st-primary)" }}>
                  {p.eticheta || ETICHETA_PLACA_IMPLICITA} ›
                </span>
              )}
            </>
          );
          return (
            <li key={i}>
              {p.link ? <a href={resolveHref(p.link, basePath)} className="group block">{continut}</a> : <div className="group">{continut}</div>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
