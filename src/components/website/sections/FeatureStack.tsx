"use client";

import { useEffect, useRef } from "react";

/**
 * Teancul de carduri: calculează cât e acoperit fiecare card de următorul.
 *
 * Scrie o singură variabilă CSS pe fiecare card, `--covered`, între 0 și 1.
 * Micșorarea și stingerea le face foaia de stil, nu codul de aici; vezi
 * `.feature-card` din `globals.css`.
 *
 * De ce nu se poate din CSS curat: cardurile sunt `sticky`, iar o cronologie
 * `view()` pusă pe un element pinat rămâne înghețată. Mutarea ei pe un container
 * din jur rupe lipirea, pentru că un element `sticky` se mișcă doar în cutia
 * părintelui. Nota lungă e în `globals.css`.
 *
 * Costul: un `requestAnimationFrame` pe derulare, care citește patru
 * dreptunghiuri. Citirile se fac toate înainte de scrieri, ca să nu forțăm
 * browserul să recalculeze aranjarea de mai multe ori într-un cadru.
 */

/** Cat de mult din inaltimea cardului trebuie acoperit pentru efect complet. */
const FULL_COVER = 0.72;

export function FeatureStack({ children }: { children: React.ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const cards = Array.from(
      root.querySelectorAll<HTMLElement>("[data-feature-card]"),
    );
    if (cards.length < 2) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) return;

    let frame = 0;

    function update() {
      frame = 0;

      /* Intai toate citirile. */
      const tops = cards.map((card) => card.getBoundingClientRect().top);
      const heights = cards.map((card) => card.offsetHeight);

      /* Apoi toate scrierile. */
      cards.forEach((card, index) => {
        const nextTop = tops[index + 1];
        if (nextTop === undefined) return;

        /* Cat a mai ramas descoperit din card, in pixeli. */
        const uncovered = nextTop - tops[index];
        const span = heights[index] * FULL_COVER;
        const progress = Math.min(Math.max(1 - uncovered / span, 0), 1);

        card.style.setProperty("--covered", progress.toFixed(3));
      });
    }

    function onScroll() {
      if (frame) return;
      frame = requestAnimationFrame(update);
    }

    /*
     * Si la revenirea pe fila. In filele din fundal browserul opreste
     * `requestAnimationFrame`, deci daca cineva deruleaza, trece pe alta fila si
     * se intoarce, cardurile ar ramane cu marimea de dinainte pana la urmatoarea
     * derulare.
     */
    function onVisible() {
      if (document.visibilityState === "visible") update();
    }

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return <div ref={rootRef}>{children}</div>;
}
