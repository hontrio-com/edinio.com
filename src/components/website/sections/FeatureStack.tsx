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
 * ═══ CE FACE CA SĂ NU SE SIMTĂ LA DERULARE ═══
 *
 * Cerința a fost „perfect fluent pe orice dispozitiv", deci fiecare lucru pe care
 * îl face bucata asta la derulare a fost pus la îndoială:
 *
 * 1. **Nu ascultă derularea decât cât e secțiunea pe ecran.** Înainte, ascultătorul
 *    era pornit de la montare până la demontare: derulai prin hero, prin Problema,
 *    prin preturi, prin FAQ — și la fiecare cadru se citeau cinci dreptunghiuri
 *    degeaba. Acum un `IntersectionObserver` pornește și oprește ascultătorul.
 * 2. **Înălțimile se citesc o dată, nu la fiecare cadru.** `offsetHeight` obligă
 *    browserul să recalculeze aranjarea dacă ceva s-a schimbat între timp; era
 *    apelat de cinci ori pe cadru pentru niște valori care se schimbă doar la
 *    redimensionare.
 * 3. **Nu scrie dacă valoarea n-a mișcat.** Rotunjit la trei zecimale, `--covered`
 *    rămâne adesea același între două cadre. Fiecare scriere invalidează stilul
 *    cardului degeaba.
 * 4. **Cardul complet acoperit iese din pictură** (`visibility: hidden`). La
 *    opacitate zero, compozitorul tot îi ține stratul; ascuns, nu. Sunt patru
 *    straturi de dimensiunea unui card, ceea ce pe un telefon contează.
 *
 * Ce a rămas: la fiecare cadru, cinci citiri de `getBoundingClientRect` și cel
 * mult cinci scrieri de proprietate. Citirile se fac TOATE înaintea scrierilor,
 * ca browserul să nu recalculeze aranjarea de mai multe ori în același cadru.
 */

/** Cat de mult din inaltimea cardului trebuie acoperit pentru efect complet. */
const FULL_COVER = 0.72;

/**
 * Cat de devreme pornim ascultatorul, fata de marginea ferestrei.
 *
 * O jumatate de ecran in fiecare parte: destul cat pozitiile sa fie deja corecte
 * cand sectiunea intra in campul vizual, si nu atat cat sa lucram pe degeaba
 * jumatate de pagina mai devreme.
 */
const WATCH_MARGIN = "50% 0px";

export function FeatureStack({ children }: { children: React.ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const cards = Array.from(
      root.querySelectorAll<HTMLElement>("[data-feature-card]"),
    );
    if (cards.length < 2) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    /* Inaltimile: citite acum si la redimensionare, nu la fiecare cadru. */
    let heights = cards.map((card) => card.offsetHeight);
    /* Ultima valoare scrisa pe fiecare card, ca sa nu rescriem aceeasi. */
    const written = cards.map(() => -1);
    const hidden = cards.map(() => false);

    let frame = 0;
    let listening = false;

    function update() {
      frame = 0;

      /* Intai toate citirile. */
      const tops = cards.map((card) => card.getBoundingClientRect().top);

      /* Apoi toate scrierile. */
      cards.forEach((card, index) => {
        const nextTop = tops[index + 1];
        if (nextTop === undefined) return;

        /* Cat a mai ramas descoperit din card, in pixeli. */
        const uncovered = nextTop - tops[index];
        const span = heights[index] * FULL_COVER;
        const progress = Math.min(Math.max(1 - uncovered / span, 0), 1);
        const rounded = Math.round(progress * 1000) / 1000;

        if (rounded !== written[index]) {
          written[index] = rounded;
          card.style.setProperty("--covered", rounded.toFixed(3));
        }

        /* Acoperit de tot: scos din pictura. Vezi nota 4. */
        const shouldHide = rounded >= 1;
        if (shouldHide !== hidden[index]) {
          hidden[index] = shouldHide;
          card.style.visibility = shouldHide ? "hidden" : "";
        }
      });
    }

    function onScroll() {
      if (frame) return;
      frame = requestAnimationFrame(update);
    }

    function onResize() {
      heights = cards.map((card) => card.offsetHeight);
      onScroll();
    }

    /*
     * In filele din fundal browserul opreste `requestAnimationFrame`, deci daca
     * cineva deruleaza, trece pe alta fila si se intoarce, cardurile ar ramane cu
     * marimea de dinainte pana la urmatoarea derulare.
     */
    function onVisible() {
      if (document.visibilityState === "visible") update();
    }

    function startListening() {
      if (listening) return;
      listening = true;
      window.addEventListener("scroll", onScroll, { passive: true });
      document.addEventListener("visibilitychange", onVisible);
      update();
    }

    function stopListening() {
      if (!listening) return;
      listening = false;
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisible);
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    }

    /* Redimensionarea se urmareste mereu: inaltimile se schimba si cand sectiunea
       nu e pe ecran, iar la intoarcere trebuie sa fie deja bune. */
    window.addEventListener("resize", onResize, { passive: true });

    /* Fara `IntersectionObserver` (browsere foarte vechi) ascultam tot timpul,
       adica exact comportamentul de dinainte. Nimic nu se strica, doar ca se
       lucreaza si cand n-ar trebui. */
    if (typeof IntersectionObserver === "undefined") {
      startListening();
      return () => {
        stopListening();
        window.removeEventListener("resize", onResize);
      };
    }

    const watcher = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) startListening();
          else stopListening();
        }
      },
      { rootMargin: WATCH_MARGIN },
    );
    watcher.observe(root);

    return () => {
      watcher.disconnect();
      stopListening();
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <div ref={rootRef}>{children}</div>;
}
