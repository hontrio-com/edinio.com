"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { PREVIEW_HEIGHT_MESSAGE } from "@/components/storefront/PreviewHeightReporter";

/**
 * Latimea la care se randeaza miniatura inainte de micsorare.
 *
 * Pe un card ingust nu micsoram desktopul si mai tare — la 350 de pixeli, un
 * desktop de 1280 ajunge la un sfert si nu se mai citeste nimic. Randam direct
 * varianta de telefon, aproape la marime reala: cine alege designul de pe
 * telefon vede exact ce vor vedea clientii lui de pe telefon.
 */
export const LATIME_DESKTOP = 1280;
export const LATIME_MOBIL = 390;
const PRAG_MOBIL = 560;
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
  motivIndisponibil,
  peMobil = false,
}: {
  slug: string;
  kind: string;
  variantId: string;
  label: string;
  tags: string[];
  inaltime: number;
  activ: boolean;
  onPick: () => void;
  /** Scris cand designul nu poate fi ales inca; cardul ramane vizibil, dar stins. */
  motivIndisponibil?: string | null;
  /** Randeaza la latime de telefon, indiferent cat de lat e cardul. */
  peMobil?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const rama = useRef<HTMLIFrameElement>(null);
  const [latimeCard, setLatimeCard] = useState(0);
  const [vizibil, setVizibil] = useState(false);
  /**
   * Inaltimea masurata, impreuna cu latimea la care s-a masurat. Cele doua merg
   * in aceeasi stare pentru ca inaltimea unei benzi randate la 390 de pixeli nu
   * spune nimic despre aceeasi banda randata la 1280 — tinute separat, ar fi
   * trebuit uitata una la schimbarea celeilalte, adica un efect care scrie
   * starea pe care tot el o citeste.
   */
  const [masurat, setMasurat] = useState<{ latime: number; inaltime: number } | null>(null);

  const latimeDupa = (l: number) => (peMobil || (l > 0 && l < PRAG_MOBIL) ? LATIME_MOBIL : LATIME_DESKTOP);
  const latimeRandare = latimeDupa(latimeCard);
  const scara = latimeCard > 0 ? latimeCard / latimeRandare : 0;
  const inaltimeRandare = masurat?.latime === latimeRandare ? masurat.inaltime : inaltime;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setLatimeCard(el.clientWidth));
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

  // Miniatura isi anunta singura inaltimea. Numarul din registry ramane doar ca
  // estimare pana se incarca, altfel cardul ar sari cand apare continutul.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin || e.source !== rama.current?.contentWindow) return;
      const h = (e.data as Record<string, unknown>)?.[PREVIEW_HEIGHT_MESSAGE];
      // Latimea se citeste din DOM in momentul mesajului, nu din starea de la
      // montare: intre timp cardul poate fi trecut de la telefon la desktop.
      // Latimea ceruta acum, nu cea de la montare: cardul poate fi trecut
      // intre telefon si desktop intre timp.
      const l = latimeRandare;
      if (typeof h === "number" && h > 0) setMasurat({ latime: l, inaltime: h });
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [latimeRandare]);

  return (
    <div className={`rounded-2xl border overflow-hidden bg-surface transition-shadow ${activ ? "border-primary ring-1 ring-primary/20" : "border-border hover:shadow-md"}`}>
      <div ref={box} className={`relative bg-muted/30 overflow-hidden ${motivIndisponibil ? "opacity-45 grayscale" : ""}`}
        style={{ height: scara ? inaltimeRandare * scara : inaltime / 3 }}>
        {vizibil && scara > 0 && (
          <iframe
            ref={rama}
            src={`/preview-sectiune/${slug}?kind=${encodeURIComponent(kind)}&variant=${encodeURIComponent(variantId)}`}
            title={`Previzualizare ${label}`}
            tabIndex={-1}
            scrolling="no"
            className="absolute top-0 left-0 origin-top-left border-0 pointer-events-none"
            style={{ width: latimeRandare, height: inaltimeRandare, transform: `scale(${scara})` }}
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
        {motivIndisponibil ? (
          <span className="shrink-0 max-w-[60%] text-right text-[11px] leading-snug text-muted-foreground">
            {motivIndisponibil}
          </span>
        ) : activ ? (
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
