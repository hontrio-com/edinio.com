"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { PREVIEW_HEIGHT_MESSAGE } from "@/components/storefront/PreviewHeightReporter";
import { asezareMiniatura } from "@/lib/storefront/design/preview-layout";

export const INALTIME_IMPLICITA = 320;

/**
 * Cate miniaturi se randeaza in acelasi timp, in toata pagina.
 *
 * Fiecare miniatura e o pagina de magazin randata pe server, cu interogarile ei.
 * La header, cele opt carduri incap intr-un singur ecran, deci fara limita s-ar
 * deschide opt iframe-uri deodata si primul ar aparea la fel de tarziu ca
 * ultimul. Pe rand, cele de sus se vad imediat, iar restul vin din urma.
 *
 * Coada e a modulului, nu a componentei: limita are sens doar pe toata pagina.
 */
const MINIATURI_SIMULTAN = 2;

/** Cat asteptam o miniatura care nu se incarca, inainte sa-i luam locul. */
const ASTEPTARE_MAXIMA = 8000;

let inCurs = 0;
const laRand: (() => void)[] = [];

function porneste() {
  while (inCurs < MINIATURI_SIMULTAN && laRand.length > 0) {
    const urmatoarea = laRand.shift();
    inCurs += 1;
    urmatoarea?.();
  }
}

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
  latimeFixa,
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
  /**
   * Latime impusa de sectiune, care are prioritate peste comutatorul
   * telefon/calculator. Cosul si formularul de comanda sunt panouri inguste: pe
   * panza de desktop ar fi o fasie intr-un camp gol, oricat de lat ar fi cardul.
   */
  latimeFixa?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const rama = useRef<HTMLIFrameElement>(null);
  const [latimeCard, setLatimeCard] = useState(0);
  const [aproape, setAproape] = useState(false);
  const [vizibil, setVizibil] = useState(false);
  /** Cardul tine unul dintre locurile de randare cat timp isi incarca miniatura. */
  const locOcupat = useRef(false);
  /**
   * Inaltimea masurata, impreuna cu latimea la care s-a masurat. Cele doua merg
   * in aceeasi stare pentru ca inaltimea unei benzi randate la 390 de pixeli nu
   * spune nimic despre aceeasi banda randata la 1280 — tinute separat, ar fi
   * trebuit uitata una la schimbarea celeilalte, adica un efect care scrie
   * starea pe care tot el o citeste.
   */
  const [masurat, setMasurat] = useState<{ latime: number; inaltime: number } | null>(null);

  const { latimeRandare, scara, marginea } = asezareMiniatura({ latimeCard, peMobil, latimeFixa });
  const inaltimeRandare = masurat?.latime === latimeRandare ? masurat.inaltime : inaltime;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setLatimeCard(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const elibereaza = useCallback(() => {
    if (!locOcupat.current) return;
    locOcupat.current = false;
    inCurs -= 1;
    porneste();
  }, []);

  // Locul se da inapoi si cand cardul dispare inainte sa apuce sa randeze ceva:
  // la inchiderea galeriei, un card care tocmai si-a primit randul de la vecinul
  // care se demonteaza nu mai ajunge sa monteze efectul de mai jos. Coada e a
  // modulului si nu se reseteaza, deci un loc pierdut ramane pierdut pana la
  // reincarcarea paginii, iar dupa cateva inchideri galeria ar ramane goala.
  useEffect(() => elibereaza, [elibereaza]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([intrare]) => { if (intrare.isIntersecting) setAproape(true); },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Apropierea de ecran il pune la coada; randeaza cand ii vine randul. Asteapta
  // si scara: fara latimea cardului masurata, iframe-ul nu s-ar randa oricum,
  // deci ar tine un loc degeaba.
  useEffect(() => {
    if (!aproape || vizibil || scara <= 0) return;
    const incepe = () => {
      locOcupat.current = true;
      setVizibil(true);
    };
    laRand.push(incepe);
    porneste();
    return () => {
      const i = laRand.indexOf(incepe);
      if (i >= 0) laRand.splice(i, 1);
    };
  }, [aproape, vizibil, scara]);

  // Locul se elibereaza cand miniatura s-a incarcat (`onLoad`) sau cand cardul
  // dispare. Cronometrul e plasa de siguranta: una care nu se incarca niciodata
  // nu are voie sa tina coada pe loc.
  useEffect(() => {
    if (!vizibil) return;
    const t = setTimeout(elibereaza, ASTEPTARE_MAXIMA);
    return () => {
      clearTimeout(t);
      elibereaza();
    };
  }, [vizibil, elibereaza]);

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
            onLoad={elibereaza}
            tabIndex={-1}
            scrolling="no"
            className="absolute top-0 origin-top-left border-0 pointer-events-none"
            style={{ width: latimeRandare, height: inaltimeRandare, left: marginea, transform: `scale(${scara})` }}
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
