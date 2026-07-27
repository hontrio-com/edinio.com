"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Banda orizontala de categorii, cu afordante de desktop: tragere cu mouse-ul
 * (limitata la `pointerType === "mouse"`, ca pe mobil sa ramana derularea nativa)
 * si sageti inainte/inapoi afisate de la md in sus, cand mai e ce derula.
 *
 * Extrasa din `MiniStoreRenderer` fara schimbari de comportament.
 */
export function CategoryScroller({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({ down: false, startX: 0, startLeft: 0, moved: false });
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [update]);

  // Banda isi schimba latimea si fara scroll si fara resize: la intrarea intr-o
  // subcategorie cu doua intrari, sagetile ar fi ramas afisate si inactive pana
  // la primul scroll. Observatorul sta pe continut, nu pe containerul derulabil,
  // fiindca al doilea isi pastreaza latimea.
  useEffect(() => {
    const continut = ref.current?.firstElementChild;
    if (!continut) return;
    const obs = new ResizeObserver(() => update());
    obs.observe(continut);
    return () => obs.disconnect();
  }, [update]);

  // Sagetile apar doar cand banda depaseste latimea; cat timp o depaseste, ambele
  // sloturi raman prezente (cea inactiva doar se estompeaza), ca derularea sa nu
  // mute layout-ul.
  const hasOverflow = canLeft || canRight;
  const arrowBtn =
    "hidden md:flex shrink-0 w-8 h-8 rounded-full items-center justify-center border border-border bg-surface transition-opacity";

  return (
    <div className={className}>
      <div className="flex items-center md:gap-1.5">
        {hasOverflow && (
          <button type="button" aria-label="Categorii anterioare" disabled={!canLeft}
            onClick={() => ref.current?.scrollBy({ left: -240, behavior: "smooth" })}
            className={`${arrowBtn} ${canLeft ? "opacity-100 hover:bg-muted" : "opacity-30 pointer-events-none"}`}>
            <ChevronLeft className="h-4 w-4 text-foreground" />
          </button>
        )}
        <div
          ref={ref}
          className="flex-1 min-w-0 overflow-x-auto scrollbar-hide select-none -mx-4 px-4 md:mx-0 md:px-0 md:cursor-grab"
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
          onClickCapture={(e) => {
            if (drag.current.moved) { e.preventDefault(); e.stopPropagation(); drag.current.moved = false; }
          }}
        >
          {children}
        </div>
        {hasOverflow && (
          <button type="button" aria-label="Categorii urmatoare" disabled={!canRight}
            onClick={() => ref.current?.scrollBy({ left: 240, behavior: "smooth" })}
            className={`${arrowBtn} ${canRight ? "opacity-100 hover:bg-muted" : "opacity-30 pointer-events-none"}`}>
            <ChevronRight className="h-4 w-4 text-foreground" />
          </button>
        )}
      </div>
    </div>
  );
}
