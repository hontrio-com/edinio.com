"use client";

import {
  useEffect,
  useId,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils/cn";

/**
 * Un fascicul care curge pe o curbă, de la un element la altul.
 *
 * Componentă adusă din afară: e „AnimatedBeam" de la MagicUI, cerută de client
 * cap-coadă (19.08), împreună cu așezarea din captură — cercuri cu sigle pe
 * margini, semnul nostru la mijloc.
 *
 * ═══ CE S-A SCHIMBAT FAȚĂ DE ORIGINAL, ȘI DE CE ═══
 *
 * 1. **`framer-motion`, nu `motion/react`.** Pachetul `motion` nu e instalat;
 *    `framer-motion@12` e, cu aceeași API. Un pachet nou pentru același lucru ar
 *    fi însemnat două biblioteci de animație în același depozit.
 * 2. **`cn` din `@/lib/utils/cn`**, calea proiectului.
 * 3. **Paza pentru mișcare redusă**, care lipsea cu totul din original. Vezi mai
 *    jos — e singura schimbare de comportament.
 *
 * ⚠ ADUCE `framer-motion` PE PAGINA /migrare. Până acum pagina n-avea în corp
 * decât un `IntersectionObserver` de cincisprezece rânduri (`LaIntrareInEcran`).
 * E al doilea loc de pe site care încarcă biblioteca — primul e cadranul de pe
 * „Optimizare", tot o componentă venită din afară. Se plătește pentru un singur
 * lucru: animarea coordonatelor unui gradient SVG.
 *
 * ═══ MIȘCAREA REDUSĂ SE CITEȘTE DE MÂNĂ ═══
 *
 * ⚠ Paza automată din `framer-motion` NU acoperă cazul ăsta, verificat în sursa
 * pachetului instalat: filtrul se aplică doar unei liste închise de chei de
 * poziție (`x`, `y`, `scale`, …), iar `x1`/`x2`/`y1`/`y2` ale unui gradient nu
 * sunt printre ele. Nici `MotionConfig reducedMotion="user"` n-ar opri nimic.
 *
 * Deci se citește direct `matchMedia`, ca peste tot în proiect, iar când omul a
 * cerut mai puțină mișcare NU se randează deloc partea animată: rămân curba
 * stinsă, cercurile și siglele. Desenul spune același lucru — de unde vin datele
 * și unde ajung — doar că stă pe loc.
 */
export interface FasciculAnimatProps {
  className?: string;
  /** Cutia față de care se socotesc toate pozițiile. */
  containerRef: RefObject<HTMLElement | null>;
  fromRef: RefObject<HTMLElement | null>;
  toRef: RefObject<HTMLElement | null>;
  /** Cât de mult se arcuiește. Pozitiv = curba urcă. */
  curvature?: number;
  /** Fasciculul curge de la dreapta la stânga. */
  reverse?: boolean;
  pathColor?: string;
  pathWidth?: number;
  pathOpacity?: number;
  gradientStartColor?: string;
  gradientStopColor?: string;
  delay?: number;
  duration?: number;
  startXOffset?: number;
  startYOffset?: number;
  endXOffset?: number;
  endYOffset?: number;
}

export function FasciculAnimat({
  className,
  containerRef,
  fromRef,
  toRef,
  curvature = 0,
  reverse = false,
  duration = 5,
  delay = 0,
  pathColor = "gray",
  pathWidth = 2,
  pathOpacity = 0.2,
  gradientStartColor = "#ffaa40",
  gradientStopColor = "#9c40ff",
  startXOffset = 0,
  startYOffset = 0,
  endXOffset = 0,
  endYOffset = 0,
}: FasciculAnimatProps) {
  const id = useId();
  const [pathD, setPathD] = useState("");
  const [dimensiuni, setDimensiuni] = useState({ width: 0, height: 0 });
  const faraMiscare = useFaraMiscare();

  const capeteGradient = reverse
    ? { x1: ["90%", "-10%"], x2: ["100%", "0%"], y1: ["0%", "0%"], y2: ["0%", "0%"] }
    : { x1: ["10%", "110%"], x2: ["0%", "100%"], y1: ["0%", "0%"], y2: ["0%", "0%"] };

  useEffect(() => {
    const cutie = containerRef.current;
    if (!cutie) return;

    const recalculeaza = () => {
      if (!containerRef.current || !fromRef.current || !toRef.current) return;

      const aCutiei = containerRef.current.getBoundingClientRect();
      const aPlecarii = fromRef.current.getBoundingClientRect();
      const aSosirii = toRef.current.getBoundingClientRect();

      setDimensiuni({ width: aCutiei.width, height: aCutiei.height });

      const xStart = aPlecarii.left - aCutiei.left + aPlecarii.width / 2 + startXOffset;
      const yStart = aPlecarii.top - aCutiei.top + aPlecarii.height / 2 + startYOffset;
      const xEnd = aSosirii.left - aCutiei.left + aSosirii.width / 2 + endXOffset;
      const yEnd = aSosirii.top - aCutiei.top + aSosirii.height / 2 + endYOffset;

      const yControl = yStart - curvature;
      setPathD(`M ${xStart},${yStart} Q ${(xStart + xEnd) / 2},${yControl} ${xEnd},${yEnd}`);
    };

    /*
     * ⚠ Se urmăresc ȘI capetele, nu doar cutia. Originalul observă doar
     * containerul, ceea ce ajunge cât timp cercurile se mișcă odată cu el — dar
     * siglele sunt imagini, iar o imagine care sosește mai târziu poate schimba
     * înălțimea cercului fără ca al cutiei să se clintească. Atunci curba ar fi
     * rămas trasă la pozițiile de dinainte, cu capătul lângă cerc, nu în el.
     */
    const observator = new ResizeObserver(recalculeaza);
    observator.observe(cutie);
    if (fromRef.current) observator.observe(fromRef.current);
    if (toRef.current) observator.observe(toRef.current);

    recalculeaza();
    return () => observator.disconnect();
  }, [containerRef, fromRef, toRef, curvature, startXOffset, startYOffset, endXOffset, endYOffset]);

  return (
    <svg
      fill="none"
      width={dimensiuni.width}
      height={dimensiuni.height}
      xmlns="http://www.w3.org/2000/svg"
      className={cn("pointer-events-none absolute left-0 top-0 transform-gpu stroke-2", className)}
      viewBox={`0 0 ${dimensiuni.width} ${dimensiuni.height}`}
      aria-hidden="true"
    >
      {/* Curba stinsă, mereu acolo: ea e drumul. Fasciculul doar îl parcurge. */}
      <path d={pathD} stroke={pathColor} strokeWidth={pathWidth} strokeOpacity={pathOpacity} strokeLinecap="round" />
      <path d={pathD} strokeWidth={pathWidth} stroke={`url(#${id})`} strokeOpacity="1" strokeLinecap="round" />
      <defs>
        <motion.linearGradient
          className="transform-gpu"
          id={id}
          gradientUnits="userSpaceOnUse"
          initial={{ x1: "0%", x2: "0%", y1: "0%", y2: "0%" }}
          /*
            Fără `animate` când s-a cerut mai puțină mișcare: gradientul rămâne la
            coordonatele de pornire, adică fasciculul stă nemișcat pe curbă. Nu se
            ascunde nimic — curba, cercurile și siglele sunt toate acolo.
          */
          {...(faraMiscare
            ? {}
            : {
                animate: capeteGradient,
                transition: {
                  delay,
                  duration,
                  ease: [0.16, 1, 0.3, 1] as const,
                  repeat: Infinity,
                },
              })}
        >
          <stop stopColor={gradientStartColor} stopOpacity="0" />
          <stop stopColor={gradientStartColor} />
          <stop offset="32.5%" stopColor={gradientStopColor} />
          <stop offset="100%" stopColor={gradientStopColor} stopOpacity="0" />
        </motion.linearGradient>
      </defs>
    </svg>
  );
}

/* Interogarea, scrisă o dată: se cere și la abonare, și la citire. */
const INTREBARE = "(prefers-reduced-motion: reduce)";

/*
  Abonarea, scoasă în afara componentei fiindcă `useSyncExternalStore` cere o
  funcție STABILĂ: una creată la fiecare randare ar dezabona și reabona la
  fiecare trecere.
*/
function asculta(schimbat: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const q = window.matchMedia(INTREBARE);
  q.addEventListener("change", schimbat);
  return () => q.removeEventListener("change", schimbat);
}

const citesteDinBrowser = () =>
  typeof window.matchMedia === "function" && window.matchMedia(INTREBARE).matches;

/* Pe server nu se știe nimic despre om, deci se presupune că mișcarea e bună. */
const citesteDePeServer = () => false;

/**
 * „A cerut omul mai puțină mișcare?"
 *
 * ⚠ `useSyncExternalStore`, nu `useState` + `useEffect`, din două motive. Întâi,
 * ăsta e chiar felul în care React vrea citită o sursă din afară — starea plus
 * efect ar fi însemnat `setState` direct în efect, ceea ce regula
 * `react-hooks/set-state-in-effect` oprește, și pe bună dreptate: e o randare în
 * plus la fiecare montare. Al doilea, aici vine gratis și instantaneul de server,
 * deci hidratarea nu are ce să nu potrivească.
 *
 * Și ASCULTĂ, nu citește o dată: cine schimbă setarea din sistem în timp ce
 * pagina e deschisă vede fasciculele oprindu-se, fără să reîncarce.
 */
function useFaraMiscare() {
  return useSyncExternalStore(asculta, citesteDinBrowser, citesteDePeServer);
}
