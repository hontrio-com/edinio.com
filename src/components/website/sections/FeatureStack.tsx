"use client";

import { useEffect, useRef } from "react";
import { liniiRand, randUrmator } from "@/lib/website/feature-rand";

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

/**
 * De unde in sus exista teanc.
 *
 * Trebuie sa fie ACEEASI valoare cu pragul `lg` al lui Tailwind, fiindca acolo se
 * aprinde `lg:sticky` pe sloturi. Fara lipire nu exista acoperire, deci n-ar avea
 * ce sa calculeze bucata asta: pe telefon ar citi cinci dreptunghiuri la fiecare
 * cadru ca sa scrie de fiecare data zero. Motivul pentru care teancul nu merge pe
 * telefon e scris la `STACK_TOP`, in `Features.tsx`.
 */
const STACK_FROM = "(min-width: 1024px)";

/**
 * Antetul lipit: `h-18` plus bordura. Vezi `site-header/SiteHeader.tsx`.
 *
 * Nu se masoara la rulare dinadins. Antetul isi schimba fondul la derulare, dar
 * nu si inaltimea, iar o citire in plus pe cadru pentru un numar care nu se misca
 * ar fi risipa. Daca vreodata se schimba `h-18`, se schimba si aici.
 */
const HEADER_H = 73;

/**
 * Unde se schimba randul, ca fractie din banda LIBERA de sub antet.
 *
 * Nu un procent din fereastra: sus sta antetul lipit, jos stau butoanele
 * plutitoare de contact (`StickyContact` e `fixed bottom-6`, deci ocupa de la
 * 24 pana pe la 130px de baza) si bara browserului. Banda libera e ce ramane.
 *
 * DOUA praguri, nu unul, si asta conteaza: cu unul singur, un card care sta cu
 * varful fix pe linie ar clipi intre stari la fiecare pixel de tremurat al
 * degetului. Distanta dintre ele e histereza — pe un ecran de 800 inseamna vreo
 * 100px de liniste, mult peste orice tremurat.
 */
const LINE_UP = 0.48;
const LINE_DOWN = 0.62;

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

    const wide = window.matchMedia(STACK_FROM);

    /*
     * Pe telefon se citeste LOCASUL, nu cardul. Cardul la rand e ridicat cu 16px,
     * iar `getBoundingClientRect` include transformarile — deci raspunsul ar
     * depinde de propria lui stare. Locasul nu se transforma niciodata.
     */
    const slots = cards.map(
      (card) => card.closest<HTMLElement>(".feature-slot") ?? card,
    );

    /* Inaltimile: citite acum si la redimensionare, nu la fiecare cadru. */
    let heights = cards.map((card) => card.offsetHeight);
    /* Ultima valoare scrisa pe fiecare card, ca sa nu rescriem aceeasi. */
    const written = cards.map(() => -1);
    const hidden = cards.map(() => false);

    /* Starea caii de telefon. `activ` e indicele cardului la rand, -1 inainte de
       primul. `pictat` deosebeste „inca n-am scris nimic" de „am scris -1". */
    let activ = -1;
    let pictat = false;
    let viu = false;
    let cadruViu = 0;

    let frame = 0;
    let listening = false;

    function updateStack() {

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

    /**
     * Calea de telefon: cine e la rand.
     *
     * Un prag cu histereza peste cele cinci carduri. Nu scrie nimic in afara de un
     * atribut; ridicarea si umbra le face foaia de stil, pe compozitor.
     *
     * Liniile se recalculeaza la fiecare cadru din `window.innerHeight`, nu o data
     * la montare: pe iOS inaltimea vizibila se schimba cat derulezi, cand se
     * strange bara de adrese. Citirile se fac TOATE inaintea scrierilor.
     */
    function updateRand() {
      /* Intai toate citirile. */
      const { lineUp, lineDown } = liniiRand(
        window.innerHeight,
        HEADER_H,
        LINE_UP,
        LINE_DOWN,
      );
      const tops = slots.map((slot) => slot.getBoundingClientRect().top);

      /* Decizia e in `lib/website/feature-rand.ts`, ca sa poata fi probata: aici
         e inchisa intr-un efect care nu porneste decat la derulare reala. */
      const next = randUrmator(tops, activ, lineUp, lineDown);

      /* Apoi toate scrierile, si numai daca s-a schimbat ceva. */
      if (next !== activ || !pictat) {
        activ = next;
        pictat = true;
        cards.forEach((card, index) => {
          const stare = index === activ ? "activ" : "inert";
          if (card.dataset.rand !== stare) card.dataset.rand = stare;
        });
      }

      /*
       * Tranzitiile se aprind abia dupa prima asezare, ca o reincarcare in mijlocul
       * sectiunii sa nu produca o batere gratuita. Doua cadre, nu unul: o clasa
       * pusa in primul cadru ar intra in acelasi recalcul de stil cu atributele de
       * mai sus, si browserul ar porni totusi tranzitia.
       */
      if (viu || cadruViu) return;
      cadruViu = requestAnimationFrame(() => {
        cadruViu = requestAnimationFrame(() => {
          cadruViu = 0;
          viu = true;
          root!.classList.add("rand-live");
        });
      });
    }

    function update() {
      frame = 0;
      if (wide.matches) updateStack();
      else updateRand();
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

    /*
     * Urmele teancului de pe desktop. Se sterg la trecerea pe telefon: un card
     * lasat `visibility: hidden` ar disparea de tot, iar un `--covered` ramas l-ar
     * face invizibil prin regula de opacitate.
     */
    function teardownCards() {
      cards.forEach((card, index) => {
        card.style.removeProperty("--covered");
        card.style.visibility = "";
        written[index] = -1;
        hidden[index] = false;
      });
    }

    /*
     * Urmele randului de pe telefon. Se sterg la trecerea pe desktop — prin
     * redimensionarea ferestrei sau prin rotirea unei tablete. Un card lasat cu
     * `data-rand="inert"` ar ramane cu umbra stinsa in teanc. Si cadrul programat
     * trebuie anulat, altfel `rand-live` s-ar pune inapoi dupa ce am plecat.
     */
    function teardownRand() {
      if (cadruViu) {
        cancelAnimationFrame(cadruViu);
        cadruViu = 0;
      }
      viu = false;
      pictat = false;
      activ = -1;
      root!.classList.remove("rand-live");
      for (const card of cards) delete card.dataset.rand;
    }

    const watcher =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            (entries) => {
              for (const entry of entries) {
                if (entry.isIntersecting) startListening();
                else stopListening();
              }
            },
            { rootMargin: WATCH_MARGIN },
          );

    function applyWidth() {
      /* Fiecare cale isi curata urmele celeilalte INAINTE ca cealalta sa porneasca. */
      if (wide.matches) teardownRand();
      else teardownCards();

      /* Ascultatorul merge acum pe amandoua latimile, dar tot pornit si oprit de
         `IntersectionObserver` cat e sectiunea pe ecran. Fara el (browsere foarte
         vechi) ascultam tot timpul: nimic nu se strica, doar se lucreaza si cand
         n-ar trebui. */
      if (watcher) watcher.observe(root!);
      else startListening();
    }

    applyWidth();
    wide.addEventListener("change", applyWidth);

    return () => {
      wide.removeEventListener("change", applyWidth);
      watcher?.disconnect();
      stopListening();
      teardownRand();
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <div ref={rootRef}>{children}</div>;
}
