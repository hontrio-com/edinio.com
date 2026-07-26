"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { sectionMeta } from "@/lib/storefront/design/registry";
import type { SectionInstance } from "@/lib/storefront/design/types";
import { INALTIME_IMPLICITA, VariantCard } from "./VariantCard";

/**
 * Galeria de design-uri a unei sectiuni.
 *
 * Se deschide peste zona de preview, pe toata latimea, ca fiecare varianta sa
 * poata fi vazuta mare. Fiecare card randeaza varianta REALA, cu logo-ul,
 * culorile si produsele magazinului acestuia — nu o captura facuta cu un magazin
 * demonstrativ. Asa se vede cum ar arata la el, iar cand isi schimba logo-ul sau
 * culoarea, galeria se actualizeaza singura.
 *
 * Miniaturile se incarca doar cand ajung in dreptul ochilor: o sectiune poate
 * ajunge la zece variante, si n-are rost sa se randeze toate deodata.
 */
export function DesignGallery({
  section,
  slug,
  onPick,
  onClose,
}: {
  section: SectionInstance;
  slug: string;
  onPick: (variant: string) => void;
  onClose: () => void;
}) {
  const meta = sectionMeta(section.kind);
  const variante = Object.entries(meta?.variants ?? {});

  // Escape inchide galeria: e o suprapunere, nu o pagina.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="absolute inset-0 z-20 bg-background flex flex-col">
      <div className="px-4 sm:px-6 py-3 border-b border-border flex items-center gap-3 bg-surface">
        <div className="min-w-0">
          <h2 className="font-semibold text-foreground truncate">Design pentru {meta?.label ?? section.kind}</h2>
          <p className="text-xs text-muted-foreground">
            {variante.length} {variante.length === 1 ? "varianta" : "variante"} - previzualizate cu magazinul tau
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Inchide galeria"
          className="ml-auto w-10 h-10 rounded-xl border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="grid gap-5 xl:grid-cols-2">
          {variante.map(([id, v]) => (
            <VariantCard
              key={id}
              slug={slug}
              kind={section.kind}
              variantId={id}
              label={v.label}
              tags={v.tags}
              inaltime={v.previewHeight ?? INALTIME_IMPLICITA}
              activ={id === section.variant}
              onPick={() => onPick(id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
