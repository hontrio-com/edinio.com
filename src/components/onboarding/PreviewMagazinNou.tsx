"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { PREVIEW_HEIGHT_MESSAGE } from "@/components/storefront/PreviewHeightReporter";

/*
 * Magazinul viitor, intr-o rama de browser, in timp ce omul completeaza pasii.
 *
 * Randarea e a rutei `/previzualizare-magazin-nou`, deci componentele reale ale
 * magazinului; aici e doar rama. Trei lucruri pe care le face rama:
 *
 *  1. SCALEAZA: magazinul se deseneaza la 1280 px, lat de desktop, si se
 *     micsoreaza la cat are coloana. Randat direct la 500 px, ar fi aratat
 *     versiunea de telefon, adica altceva decat ce vede un client pe calculator.
 *  2. NU CLIPESTE: la fiecare schimbare se incarca un iframe nou, ascuns, si
 *     abia cand e gata ia locul celui vechi. Altfel fiecare litera scrisa in
 *     numele magazinului ar fi albit rama o clipa.
 *  3. NU SE POATE APASA: e o poza vie, nu un magazin. Un clic pe „Cumpara acum"
 *     ar fi navigat iframe-ul intr-o pagina fara sens.
 */

const LATIME_MAGAZIN = 1280;
const INALTIME_IMPLICITA = 1400;

function adresa(nume: string, culoare: string, stil: string, telefon: string) {
  const q = new URLSearchParams({ nume, culoare, stil });
  if (telefon) q.set("telefon", telefon);
  return `/previzualizare-magazin-nou?${q.toString()}`;
}

export function PreviewMagazinNou({
  nume,
  culoare,
  stil,
  slug,
  telefon = "",
  inaltimeVizibila = 560,
}: {
  nume: string;
  culoare: string;
  stil: string;
  slug: string;
  /** Apare in antetele care arata contactul (ex. „Logo la mijloc"), ca pe magazinul real. */
  telefon?: string;
  /** Cata inaltime (in pixeli de ecran) ocupa rama. */
  inaltimeVizibila?: number;
}) {
  const ramaRef = useRef<HTMLDivElement>(null);
  const [latime, setLatime] = useState(0);
  const [inaltime, setInaltime] = useState(INALTIME_IMPLICITA);

  const tinta = adresa(nume.trim() || "Magazinul tău", culoare, stil, telefon);
  const [activ, setActiv] = useState(tinta);
  const [urmator, setUrmator] = useState<string | null>(null);
  /* Prima incarcare dureaza (se aduce tot magazinul), deci pana atunci se spune ca vine ceva, nu o rama alba. */
  const [primaGata, setPrimaGata] = useState(false);

  // O singura reincarcare dupa ce omul se opreste din scris, nu una pe litera.
  useEffect(() => {
    if (tinta === activ) return;
    const t = setTimeout(() => setUrmator(tinta), 450);
    return () => clearTimeout(t);
  }, [tinta, activ]);

  useEffect(() => {
    const el = ramaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setLatime(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const laMesaj = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const h = (e.data as Record<string, unknown> | null)?.[PREVIEW_HEIGHT_MESSAGE];
      if (typeof h === "number" && h > 200) setInaltime(Math.min(h, 4000));
    };
    window.addEventListener("message", laMesaj);
    return () => window.removeEventListener("message", laMesaj);
  }, []);

  const scara = latime > 0 ? latime / LATIME_MAGAZIN : 0;
  const cadru = (src: string, vizibil: boolean, laIncarcare?: () => void) => (
    <iframe
      key={src}
      src={src}
      title="Previzualizarea magazinului"
      tabIndex={-1}
      aria-hidden={!vizibil}
      onLoad={laIncarcare}
      className="absolute left-0 top-0 origin-top-left border-0 transition-opacity duration-300"
      style={{
        width: LATIME_MAGAZIN,
        height: inaltime,
        transform: `scale(${scara})`,
        opacity: vizibil ? 1 : 0,
        pointerEvents: "none",
      }}
    />
  );

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white shadow-[0_24px_60px_-24px_rgb(15_23_42/0.25)]">
      <div className="flex items-center gap-3 border-b border-border bg-muted/60 px-3.5 py-2.5">
        <div className="flex gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        </div>
        <div className="min-w-0 flex-1 truncate rounded-md bg-white px-3 py-1 text-center text-xs text-muted-foreground">
          edinio.com/<span className="font-medium text-foreground">{slug || "magazinul-tau"}</span>
        </div>
        <span className="w-[42px]" aria-hidden />
      </div>
      {/* Inaltimea urmeaza latimea: pe telefon rama are ~350 px, iar 560 px de inaltime ar fi aratat un magazin minuscul si lung. */}
      <div
        ref={ramaRef}
        className="relative overflow-hidden bg-background"
        style={{ height: latime > 0 ? Math.min(inaltimeVizibila, Math.round(latime * 1.1)) : inaltimeVizibila }}
      >
        {scara > 0 && (
          <>
            {cadru(activ, true, () => setPrimaGata(true))}
            {urmator && urmator !== activ && cadru(urmator, false, () => {
              setActiv(urmator);
              setUrmator(null);
            })}
          </>
        )}
        {!primaGata && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background" role="status">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Îți pregătim previzualizarea…</span>
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent" />
      </div>
    </div>
  );
}
