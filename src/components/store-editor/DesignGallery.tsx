"use client";

import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { sectionMeta } from "@/lib/storefront/design/registry";
import type { SectionInstance } from "@/lib/storefront/design/types";

/** Latimea la care se randeaza miniatura inainte de micsorare: un desktop obisnuit. */
const LATIME_RANDARE = 1280;
const INALTIME_IMPLICITA = 320;

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
            <CardVarianta
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

function CardVarianta({
  slug,
  kind,
  variantId,
  label,
  tags,
  inaltime,
  activ,
  onPick,
}: {
  slug: string;
  kind: string;
  variantId: string;
  label: string;
  tags: string[];
  inaltime: number;
  activ: boolean;
  onPick: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [scara, setScara] = useState(0);
  const [vizibil, setVizibil] = useState(false);

  // Scara se calculeaza din latimea reala a cardului, ca miniatura sa umple
  // exact spatiul disponibil indiferent de ecran.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScara(el.clientWidth / LATIME_RANDARE));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Randam abia cand cardul se apropie de ecran.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([intrare]) => { if (intrare.isIntersecting) setVizibil(true); },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className={`rounded-2xl border overflow-hidden bg-surface transition-shadow ${activ ? "border-primary ring-1 ring-primary/20" : "border-border hover:shadow-md"}`}>
      <div ref={box} className="relative bg-muted/30 overflow-hidden"
        style={{ height: scara ? inaltime * scara : inaltime / 3 }}>
        {vizibil && scara > 0 && (
          <iframe
            src={`/preview-sectiune/${slug}?kind=${encodeURIComponent(kind)}&variant=${encodeURIComponent(variantId)}`}
            title={`Previzualizare ${label}`}
            tabIndex={-1}
            scrolling="no"
            className="absolute top-0 left-0 origin-top-left border-0 pointer-events-none"
            style={{ width: LATIME_RANDARE, height: inaltime, transform: `scale(${scara})` }}
          />
        )}
      </div>

      <div className="px-4 py-3 flex items-center gap-3 border-t border-border">
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold truncate ${activ ? "text-primary" : "text-foreground"}`}>{label}</p>
          {tags.length > 0 && (
            <p className="text-[11px] text-muted-foreground truncate">{tags.join(" - ")}</p>
          )}
        </div>
        {activ ? (
          <span className="shrink-0 h-9 px-3 rounded-xl bg-primary/10 text-primary text-sm font-semibold inline-flex items-center gap-1.5">
            <Check className="h-4 w-4" />
            Activ
          </span>
        ) : (
          <button type="button" onClick={onPick}
            className="shrink-0 h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity">
            Alege
          </button>
        )}
      </div>
    </div>
  );
}
