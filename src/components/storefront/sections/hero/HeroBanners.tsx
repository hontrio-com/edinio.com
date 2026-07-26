"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cdnImage } from "@/lib/cdn-image";
import { resolveHref } from "@/lib/pages/href";

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
    const img = (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={cdnImage(banners[0], 1600)} alt={alt} fetchPriority="high"
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
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({ down: false, startX: 0, startLeft: 0, moved: false });
  const paused = useRef(false);
  const [index, setIndex] = useState(0);
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
    const id = setInterval(() => {
      if (paused.current) return;
      const el = ref.current;
      if (!el) return;
      const cur = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
      el.scrollTo({ left: el.clientWidth * ((cur + 1) % count), behavior: "smooth" });
    }, 5000);
    return () => clearInterval(id);
  }, [count]);

  const arrow =
    "hidden md:flex absolute top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full items-center justify-center bg-black/35 text-white hover:bg-black/55 transition-colors";

  return (
    <section
      className="relative overflow-hidden md:pt-6"
      onPointerEnter={() => { paused.current = true; }}
      onPointerLeave={() => { paused.current = false; }}
    >
      <div className="mx-auto md:max-w-6xl md:px-4">
        <div className="relative md:rounded-2xl md:overflow-hidden">
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
              const img = (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cdnImage(src, 1600)} alt={alt} draggable={false} fetchPriority={i === 0 ? "high" : "low"} loading={i === 0 ? "eager" : "lazy"} className="w-full h-full object-cover" />
              );
              return (
                <div key={i} className="shrink-0 w-full snap-center aspect-[16/9] bg-muted">
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
              <button key={i} type="button" aria-label={`Mergi la banner ${i + 1}`} onClick={() => goTo(i)}
                className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-surface" : "w-1.5 bg-surface/60 hover:bg-surface/80"}`} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
