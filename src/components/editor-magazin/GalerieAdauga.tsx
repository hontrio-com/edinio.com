"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { INALTIME_IMPLICITA, VariantCard } from "@/components/store-editor/VariantCard";
import { addableKinds } from "@/lib/storefront/design/edit";
import { firstVariant, sectionMeta, variantMeta } from "@/lib/storefront/design/registry";
import type { SectionKind, StoreDesign } from "@/lib/storefront/design/types";

/**
 * „Adauga sectiune”: o galerie peste previzualizare, cu miniatura reala a
 * fiecarei sectiuni (logo-ul, culorile si produsele magazinului).
 *
 * Inlocuieste lista de nume din editorul de design: „Beneficii pe scurt” sau
 * „Prag transport gratuit” nu spun nimic cuiva care nu le-a vazut.
 */

/** Ce face fiecare sectiune, in cuvintele comerciantului. */
const DESCRIERI: Partial<Record<SectionKind, string>> = {
  hero: "O imagine mare sau un carusel de bannere, în capul paginii.",
  usp_strip: "Banda cu garanțiile magazinului: livrare, plată, retur, suport.",
  catalog_toolbar: "Căutarea, sortarea și filtrele de deasupra produselor.",
  category_nav: "Categoriile magazinului, cu imagini, către catalog.",
  shipping_progress: "Cât mai are clientul până la livrarea gratuită.",
  product_row: "Un rând de produse alese de tine, dintr-o categorie sau pachetele tale.",
  product_grid: "Toate produsele, cu căutare, filtre și paginare.",
  benefits: "De ce să cumpere de la tine, în câteva puncte.",
  reviews: "Recenziile scrise de tine, cu stele.",
  gallery: "Fotografii ale magazinului.",
  about: "Descrierea magazinului.",
  contact: "Telefonul, emailul și adresa magazinului.",
};

export function GalerieAdauga({ design, slug, onAdauga, onInchide }: {
  design: StoreDesign;
  slug: string;
  onAdauga: (kind: SectionKind) => void;
  onInchide: () => void;
}) {
  // Randul de produse nu se adauga din design (continutul lui sta in `page_content`),
  // dar se poate adauga de aici: editorul il face in continut si il salveaza.
  const tipuri: SectionKind[] = [...addableKinds(design), "product_row"];

  useEffect(() => {
    const laEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onInchide(); };
    window.addEventListener("keydown", laEsc);
    return () => window.removeEventListener("keydown", laEsc);
  }, [onInchide]);

  return (
    <div className="absolute inset-0 z-20 bg-background flex flex-col">
      <div className="px-4 sm:px-6 py-3 border-b border-border flex items-center gap-3 bg-surface">
        <div className="min-w-0">
          <h2 className="font-semibold text-foreground">Adaugă o secțiune</h2>
          <p className="text-xs text-muted-foreground">Previzualizate cu magazinul tău. Secțiunea nouă intră înaintea catalogului.</p>
        </div>
        <button type="button" onClick={onInchide} aria-label="Închide"
          className="ml-auto w-10 h-10 rounded-xl border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="grid gap-5 xl:grid-cols-2">
          {tipuri.map((kind) => {
            const variant = firstVariant(kind);
            if (!variant) return null;
            const meta = sectionMeta(kind);
            return (
              <div key={kind} className="space-y-1.5">
                <p className="text-xs text-muted-foreground px-1">{DESCRIERI[kind]}</p>
                <VariantCard slug={slug} kind={kind} variantId={variant} label={meta?.label ?? kind}
                  inaltime={variantMeta(kind, variant)?.previewHeight ?? INALTIME_IMPLICITA}
                  latimeFixa={variantMeta(kind, variant)?.previewWidth}
                  activ={false} etichetaButon="Adaugă" onPick={() => onAdauga(kind)} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
