"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";

/** Latimea la care se randeaza miniatura inainte de micsorare: un desktop obisnuit. */
export const LATIME_RANDARE = 1280;
export const INALTIME_IMPLICITA = 320;

/**
 * Cardul unei variante de design, cu miniatura randata live.
 *
 * Miniatura e magazinul REAL al comerciantului, intr-un iframe micsorat: logo,
 * culori, produse. Nu o captura facuta cu un magazin demonstrativ — asa se vede
 * cum ar arata la el, iar cand isi schimba logo-ul, cardul se actualizeaza
 * singur, fara sa refacem noi vreo imagine.
 *
 * Se randeaza abia cand cardul se apropie de ecran: o sectiune poate ajunge la
 * zece variante, si fiecare miniatura e o pagina intreaga.
 */
export function VariantCard({
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
