"use client";

import { incadrareMobil, SLOT_INCADRAT_MOBIL } from "@/lib/teme/incadrare-bannere";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { cdnImage } from "@/lib/cdn-image";
import { resolveHref } from "@/lib/pages/href";
import type { MarimeBanner } from "@/lib/storefront/design/hero-banners";
import { LIMITE_RAPORT, potrivireaPozei, raportDin, raportulLocului, type LimiteRaport } from "@/lib/storefront/design/raport-bannere";

/**
 * Latimea ceruta pe telefon (etapa 25.23, 11.11.2026): 75vw, nu 100vw. Un telefon cu densitate 3 cerea 1170 px, deci
 * varianta de 1280 sau originalul (95-136 KB la temele demo, chiar elementul LCP pe 4G lent); asa ia ~880 px, adica
 * densitate ~2,5, cu ~40% mai putini octeti si fara diferenta la vedere. Pe ecranele mari ramane latimea intreaga.
 */
export const SIZES_BANNER = "(max-width: 640px) 75vw, 100vw";

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
  /** Marimile stiute de server (`resolveHeroBanners`), aliniate cu `banners`: caruselul isi ia raportul din ele. */
  marimi?: (MarimeBanner | null)[];
}

export function HeroBanners({ banners, links, alt, basePath, marimi }: HeroBannersProps) {
  if (banners.length === 0) return null;
  if (banners.length === 1) {
    const href = links?.[0] ? resolveHref(links[0], basePath) : null;
    const srcSet = bannerSrcSet(banners[0]);
    // Etapa 25.17: un banner demo cu text in poza se arata pe telefon mai inalt, incadrat pe text (`incadrare-bannere.ts`).
    const incadrare = incadrareMobil(banners[0]);
    const img = (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={cdnImage(banners[0], 1600)} srcSet={srcSet} sizes={srcSet ? SIZES_BANNER : undefined} alt={href ? alt : ""} fetchPriority="high"
        className={`block mx-auto w-full h-auto md:w-auto md:max-w-full md:max-h-[60vh] md:rounded-2xl${incadrare ? " max-sm:h-full max-sm:object-cover" : ""}`}
        style={incadrare ? { objectPosition: incadrare } : undefined} />
    );
    const cadru = incadrare ? <div className={`${SLOT_INCADRAT_MOBIL} max-sm:overflow-hidden`}>{img}</div> : img;
    return (
      <section className="relative overflow-hidden md:pt-6">
        <div className="mx-auto md:max-w-6xl md:px-4">
          {href ? <a href={href} className="block">{cadru}</a> : cadru}
        </div>
      </section>
    );
  }
  return <BannerCarousel banners={banners} links={links} alt={alt} basePath={basePath} marimi={marimi} />;
}

export function BannerCarousel({ banners, links, alt, basePath, marimi }: HeroBannersProps) {
  return (
    <section className="relative overflow-hidden md:pt-6">
      <div className="mx-auto md:max-w-6xl md:px-4">
        <BannerSlider banners={banners} links={links} alt={alt} basePath={basePath} marimi={marimi} limiteRaport={LIMITE_RAPORT.carusel} />
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
  paginare = "puncte",
  marimi,
  limiteRaport,
}: HeroBannersProps & {
  wrapperClass?: string;
  slideClass?: string;
  /** `segmente`: bare subtiri, cea curenta in culoarea de accent (tema Jupiter, etapa 16.3). */
  paginare?: "puncte" | "segmente";
  /**
   * Intre ce rapoarte poate lua locul raportul primului banner (13.11.2026, `raport-bannere.ts`). Fara ele, locul ramane
   * cel din `slideClass`, ca pana atunci.
   */
  limiteRaport?: LimiteRaport;
}) {
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
  // Etapa 25.17-25.18: bannerele demo cu incadrare pe telefon; una singura face tot caruselul mai inalt acolo (`max-sm`).
  const incadrari = banners.map((b) => incadrareMobil(b));
  const slot = incadrari.some(Boolean) ? `${slideClass} ${SLOT_INCADRAT_MOBIL}` : slideClass;

  /*
   * Locul ia raportul primului banner (13.11.2026: la eSafe, bannerele 16:9 se taiau in locul de 2,14:1 al temei). Marimea
   * vine de pe server cand poza e in Biblioteca Media, deci pagina se aseaza corect de la primul cadru; altfel se masoara
   * aici, la incarcarea pozei. Bannerele demo incadrate pe telefon raman pe locul lor: sunt facute pe masura lui.
   */
  const adaptiv = !!limiteRaport && !incadrari.some(Boolean);
  // Pe adresa, nu pe pozitie: o ordine noua a bannerelor nu muta un raport pe alt banner.
  const [masurate, setMasurate] = useState<Record<string, number>>({});
  const rapoarte = banners.map((src, i) => raportDin(marimi?.[i]) ?? masurate[src] ?? null);
  const raportLoc = adaptiv && limiteRaport ? raportulLocului(rapoarte[0], limiteRaport) : null;
  const noteaza = useCallback((img: HTMLImageElement) => {
    const src = img.dataset.banner;
    if (!src || !img.naturalWidth || !img.naturalHeight) return;
    const r = img.naturalWidth / img.naturalHeight;
    setMasurate((m) => (m[src] !== undefined && Math.abs(m[src] - r) < 0.001 ? m : { ...m, [src]: r }));
  }, []);
  // Pozele incarcate inainte de hidratare nu mai trimit `load`: se citesc o data, dupa montare.
  const cheieBannere = banners.join("\n");
  useEffect(() => {
    if (!adaptiv) return;
    ref.current?.querySelectorAll<HTMLImageElement>("img[data-banner]").forEach((img) => {
      if (img.complete) noteaza(img);
    });
  }, [adaptiv, noteaza, cheieBannere]);

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
                <img src={cdnImage(src, 1600)} srcSet={srcSet} sizes={srcSet ? SIZES_BANNER : undefined} alt={href ? alt : ""} draggable={false} fetchPriority={i === 0 ? "high" : "low"} loading={i === 0 ? "eager" : "lazy"}
                  // Cu alt raport decat locul, poza se arata intreaga (`contain`), nu taiata (`raport-bannere.ts`).
                  className={`w-full h-full ${potrivireaPozei(rapoarte[i], raportLoc) === "contain" ? "object-contain" : "object-cover"}`}
                  data-banner={src} onLoad={adaptiv ? (e) => noteaza(e.currentTarget) : undefined}
                  style={incadrari[i] ? { objectPosition: incadrari[i]! } : undefined} />
              );
              return (
                <div key={i} className={slot} style={raportLoc ? { aspectRatio: String(raportLoc) } : undefined}>
                  {href ? (
                    <a href={href} className="block w-full h-full" onClick={(e) => { if (drag.current.moved) e.preventDefault(); }}>{img}</a>
                  ) : img}
                </div>
              );
            })}
          </div>

          {/* Etapa 25.22: cu un singur banner (Deneb, Antares), nici sageti, nici puncte, nici pauza: n-au ce face. */}
          {count > 1 && (<>
          <button type="button" aria-label="Banner anterior" onClick={() => goTo(index - 1)} className={`${arrow} left-2`}>
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button type="button" aria-label="Banner urmator" onClick={() => goTo(index + 1)} className={`${arrow} right-2`}>
            <ChevronRight className="h-5 w-5" />
          </button>

          {/*
            Etapa 25.16 (11.11.2026): butonul e tinta de atins, de cel putin 24x24 px (WCAG 2.5.8); punctul sau segmentul
            se deseneaza inauntru. Pana atunci butonul era chiar desenul: 40x3 px, prea mic pentru deget.
          */}
          <div className={`absolute left-1/2 -translate-x-1/2 z-10 flex ${paginare === "segmente" ? "bottom-2.5 gap-1.5" : "bottom-1.5 gap-0"}`}>
            {banners.map((_, i) => (
              <button key={i} type="button" aria-label={`Mergi la banner ${i + 1}`} aria-current={i === index ? "true" : undefined} onClick={() => goTo(i)}
                className="group/punct flex h-6 min-w-6 items-center justify-center">
                <span aria-hidden="true"
                  className={paginare === "segmente"
                    ? `block h-[3px] w-10 sm:w-14 rounded-full transition-colors ${i === index ? "" : "bg-white/75 group-hover/punct:bg-white"}`
                    : `block h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-surface" : "w-1.5 bg-surface/60 group-hover/punct:bg-surface/80"}`}
                  style={paginare === "segmente" && i === index ? { backgroundColor: "var(--st-accent)" } : undefined} />
              </button>
            ))}
          </div>

          {/* Oprirea prin hover exista doar pe desktop; pe telefon bannerele s-ar
              schimba la nesfarsit fara nicio scapare (WCAG 2.2.2). De aceea
              butonul e vizibil pe orice ecran, in coltul opus punctelor. Cand
              sistemul cere miscare redusa nu porneste nimic, deci nici butonul
              n-are ce opri. */}
          </>)}

          {!miscareRedusa && count > 1 && (
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
