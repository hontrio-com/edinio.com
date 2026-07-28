"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { cdnImage } from "@/lib/cdn-image";
import { resolveHref } from "@/lib/pages/href";

/** Treptele de latime cerute CDN-ului pentru bannere. */
const LATIMI_BANNER = [640, 960, 1280, 1600];

/**
 * `srcset` pentru un banner, sau nimic cand CDN-ul nu redimensioneaza.
 *
 * Fara el, un telefon de 390 px descarca imaginea de 1600 px — de patru ori mai
 * multi pixeli decat afiseaza, exact pe elementul dupa care se masoara LCP. Iar
 * fara verificarea de mai jos, un magazin fara CDN ar primi patru trepte care
 * trimit toate la acelasi fisier, adica o minciuna pentru browser.
 */
function bannerSrcSet(src: string): string | undefined {
  if (cdnImage(src, LATIMI_BANNER[0]) === cdnImage(src, 1600)) return undefined;
  return LATIMI_BANNER.map((w) => `${cdnImage(src, w)} ${w}w`).join(", ");
}

/**
 * Hero-ul „bannere", varianta classic — identica cu ce randa `MiniStoreRenderer`.
 *
 * Un singur banner pastreaza aspectul turnat: imaginea completa, la orice raport,
 * fara decupare. Doua pana la cinci devin carusel cu puncte, avans automat la 5
 * secunde, sageti pe desktop si tragere cu mouse-ul.
 */
export interface HeroBannersProps {
  banners: string[];
  links?: (string | undefined)[];
  alt: string;
  basePath: string;
}

export function HeroBanners({ banners, links, alt, basePath }: HeroBannersProps) {
  if (banners.length === 0) return null;
  if (banners.length === 1) {
    const href = links?.[0] ? resolveHref(links[0], basePath) : null;
    const srcSet = bannerSrcSet(banners[0]);
    const img = (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={cdnImage(banners[0], 1600)} srcSet={srcSet} sizes={srcSet ? "100vw" : undefined} alt={href ? alt : ""} fetchPriority="high"
        className="block mx-auto w-full h-auto md:w-auto md:max-w-full md:max-h-[60vh] md:rounded-2xl" />
    );
    return (
      <section className="relative overflow-hidden md:pt-6">
        <div className="mx-auto md:max-w-6xl md:px-4">
          {href ? <a href={href} className="block">{img}</a> : img}
        </div>
      </section>
    );
  }
  return <BannerCarousel banners={banners} links={links} alt={alt} basePath={basePath} />;
}

export function BannerCarousel({ banners, links, alt, basePath }: HeroBannersProps) {
  return (
    <section className="relative overflow-hidden md:pt-6">
      <div className="mx-auto md:max-w-6xl md:px-4">
        <BannerSlider banners={banners} links={links} alt={alt} basePath={basePath} />
      </div>
    </section>
  );
}

/**
 * Caruselul propriu-zis, fara sectiune si fara container.
 *
 * Separat de `BannerCarousel` ca sa poata fi asezat si in alta parte — de
 * exemplu langa o bara de categorii, unde inaltimea nu mai vine dintr-un raport
 * fix, ci din coloana de alaturi.
 */
export function BannerSlider({
  banners,
  links,
  alt,
  basePath,
  wrapperClass = "relative md:rounded-2xl md:overflow-hidden",
  // Sirul intreg, nu doar raportul: compus din parte fixa plus parte variabila,
  // ordinea claselor s-ar schimba fata de marcajul de dinainte, iar comparatia
  // cu productia ar semnala o diferenta acolo unde CSS-ul e identic.
  slideClass = "shrink-0 w-full snap-center aspect-[16/9] bg-muted",
}: HeroBannersProps & { wrapperClass?: string; slideClass?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const invelis = useRef<HTMLDivElement>(null);
  const drag = useRef({ down: false, startX: 0, startLeft: 0, moved: false });
  const paused = useRef(false);
  const vizibil = useRef(true);
  const [index, setIndex] = useState(0);
  const [ruleaza, setRuleaza] = useState(true);
  // Se afla abia pe client; pornind pe `false`, marcajul de server ramane cel de
  // dinainte si hidratarea nu se plange.
  const [miscareRedusa, setMiscareRedusa] = useState(false);
  const count = banners.length;

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
  }, []);

  const goTo = useCallback((i: number) => {
    const el = ref.current;
    if (!el) return;
    const target = ((i % count) + count) % count;
    el.scrollTo({ left: el.clientWidth * target, behavior: "smooth" });
  }, [count]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const aplica = () => setMiscareRedusa(mq.matches);
    aplica();
    mq.addEventListener("change", aplica);
    return () => mq.removeEventListener("change", aplica);
  }, []);

  // Caruselul iesit din ecran nu mai avanseaza: altfel vizitatorul ajuns in
  // catalog plateste, la fiecare 5 secunde si la nesfarsit, o derulare lina si o
  // randare React pe un element pe care nu-l vede.
  useEffect(() => {
    const el = invelis.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { vizibil.current = e.isIntersecting; });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!ruleaza || miscareRedusa) return;
    const id = setInterval(() => {
      if (paused.current || !vizibil.current) return;
      const el = ref.current;
      if (!el) return;
      const cur = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
      el.scrollTo({ left: el.clientWidth * ((cur + 1) % count), behavior: "smooth" });
    }, 5000);
    return () => clearInterval(id);
  }, [count, ruleaza, miscareRedusa]);

  const arrow =
    "hidden md:flex absolute top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full items-center justify-center bg-black/35 text-white hover:bg-black/55 transition-colors";

  return (
    <div
      ref={invelis}
      className={wrapperClass}
      onPointerEnter={() => { paused.current = true; }}
      onPointerLeave={() => { paused.current = false; }}
      // Pe langa hover: cu tastatura, focusul pe o sageata sau pe un punct
      // opreste avansul, altfel continutul se schimba sub degetele vizitatorului.
      onFocusCapture={() => { paused.current = true; }}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) paused.current = false;
      }}
    >
          <div
            ref={ref}
            onScroll={onScroll}
            className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide select-none md:cursor-grab"
            onPointerDown={(e) => {
              if (e.pointerType !== "mouse") return;
              const el = ref.current;
              if (!el) return;
              drag.current = { down: true, startX: e.clientX, startLeft: el.scrollLeft, moved: false };
            }}
            onPointerMove={(e) => {
              if (e.pointerType !== "mouse" || !drag.current.down) return;
              const el = ref.current;
              if (!el) return;
              const dx = e.clientX - drag.current.startX;
              if (Math.abs(dx) > 4) drag.current.moved = true;
              el.scrollLeft = drag.current.startLeft - dx;
            }}
            onPointerUp={(e) => { if (e.pointerType === "mouse") drag.current.down = false; }}
            onPointerLeave={(e) => { if (e.pointerType === "mouse") drag.current.down = false; }}
          >
            {banners.map((src, i) => {
              const href = links?.[i] ? resolveHref(links[i], basePath) : null;
              const srcSet = bannerSrcSet(src);
              const img = (
                // Bannerul fara link e decorativ: mesajul lui e pictat in imagine
                // si nu ajunge la cititorul de ecran oricum, iar `alt` era numele
                // magazinului — acelasi pentru toate slide-urile, deja citit ca H1.
                // Cel cu link ramane cu nume, altfel linkul n-ar avea niciunul.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cdnImage(src, 1600)} srcSet={srcSet} sizes={srcSet ? "100vw" : undefined} alt={href ? alt : ""} draggable={false} fetchPriority={i === 0 ? "high" : "low"} loading={i === 0 ? "eager" : "lazy"} className="w-full h-full object-cover" />
              );
              return (
                <div key={i} className={slideClass}>
                  {href ? (
                    <a href={href} className="block w-full h-full" onClick={(e) => { if (drag.current.moved) e.preventDefault(); }}>{img}</a>
                  ) : img}
                </div>
              );
            })}
          </div>

          <button type="button" aria-label="Banner anterior" onClick={() => goTo(index - 1)} className={`${arrow} left-2`}>
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button type="button" aria-label="Banner urmator" onClick={() => goTo(index + 1)} className={`${arrow} right-2`}>
            <ChevronRight className="h-5 w-5" />
          </button>

          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex gap-1.5">
            {banners.map((_, i) => (
              <button key={i} type="button" aria-label={`Mergi la banner ${i + 1}`} aria-current={i === index ? "true" : undefined} onClick={() => goTo(i)}
                className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-surface" : "w-1.5 bg-surface/60 hover:bg-surface/80"}`} />
            ))}
          </div>

          {/* Oprirea prin hover exista doar pe desktop; pe telefon bannerele s-ar
              schimba la nesfarsit fara nicio scapare (WCAG 2.2.2). De aceea
              butonul e vizibil pe orice ecran, in coltul opus punctelor. Cand
              sistemul cere miscare redusa nu porneste nimic, deci nici butonul
              n-are ce opri. */}
          {!miscareRedusa && (
            <button type="button"
              onClick={() => {
                // Butonul ramane focusat dupa click, iar focusul e el insusi o
                // pauza: fara linia asta, „porneste" n-ar reporni nimic.
                if (!ruleaza) paused.current = false;
                setRuleaza(!ruleaza);
              }}
              aria-label={ruleaza ? "Opreste derularea automata a bannerelor" : "Porneste derularea automata a bannerelor"}
              className="absolute bottom-3 right-3 z-10 w-7 h-7 rounded-full flex items-center justify-center bg-black/35 text-white hover:bg-black/55 transition-colors">
              {ruleaza ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </button>
          )}
    </div>
  );
}
