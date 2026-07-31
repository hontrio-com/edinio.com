import type { CSSProperties } from "react";

/**
 * Fundalul hero-ului: fascicule de lumină verde, oblice, dintr-o parte.
 *
 * Desenat din gradiente și blur, nu cu WebGL. Varianta cu `ogl` de pe reactbits
 * arată bine, dar pune o pânză care se redesenează la fiecare cadru exact peste
 * elementul cel mai important al paginii, plus o dependință de încărcat înainte
 * să se vadă titlul. Aici totul se randează pe server, nu cere nicio linie de
 * JavaScript pe client și nu costă nimic la derulare.
 *
 * Unghiurile sunt scrise de mână, nu generate: `Math.random()` la randare ar da
 * alt desen pe server față de client și ar rupe hidratarea.
 */

interface Ray {
  /** Unghiul față de verticală. Negativ = spre stânga. */
  angle: number;
  /** Lățimea razei la bază, în procente din secțiune. */
  width: number;
  opacity: number;
  blur: number;
  /** Deplasare pe orizontală față de centru, în procente. */
  offset: number;
  duration: number;
  delay: number;
}

/**
 * Fascicule înclinate, care traversează ecranul dinspre stânga sus.
 *
 * Evantaiul e larg (de la -62° la 8°) și fiecare rază e slabă, ca lumina să
 * acopere toată lățimea fără să devină o pată verde în mijloc.
 *
 * Amestecul de late-și-difuze cu înguste-și-clare e intenționat: numai difuze,
 * iese o ceață; numai clare, ies dungi de gard. Câteva ascuțite printre cele moi
 * dau senzația de fascicul.
 */
const SWEEP: Ray[] = [
  { angle: -62, width: 16, opacity: 0.18, blur: 40, offset: -48, duration: 17, delay: 0 },
  { angle: -52, width: 5, opacity: 0.24, blur: 15, offset: -38, duration: 13, delay: 2.9 },
  { angle: -43, width: 12, opacity: 0.19, blur: 32, offset: -27, duration: 12, delay: 1.1 },
  { angle: -33, width: 3.2, opacity: 0.26, blur: 10, offset: -15, duration: 15, delay: 4.2 },
  { angle: -23, width: 14, opacity: 0.16, blur: 36, offset: -2, duration: 18, delay: 0.9 },
  { angle: -13, width: 4, opacity: 0.24, blur: 12, offset: 14, duration: 14, delay: 3.7 },
  { angle: -3, width: 10, opacity: 0.18, blur: 28, offset: 30, duration: 13, delay: 2.1 },
  { angle: 8, width: 13, opacity: 0.15, blur: 34, offset: 46, duration: 16, delay: 1.5 },
];

/** Cât de tare se vede lumina. Un singur număr, dacă vrei mai mult sau mai puțin. */
const RAY_COLOR = "rgba(26, 181, 84, 0.32)";

function rayStyle(ray: Ray): CSSProperties {
  return {
    position: "absolute",
    top: "-30%",
    left: `${50 + ray.offset}%`,
    width: `${ray.width}%`,
    height: "150%",
    transformOrigin: "top center",
    transform: `translateX(-50%) rotate(${ray.angle}deg)`,
    background: `linear-gradient(to bottom, ${RAY_COLOR} 0%, transparent 72%)`,
    filter: `blur(${ray.blur}px)`,
    opacity: ray.opacity,
    ["--ray-angle" as string]: `${ray.angle}deg`,
    ["--ray-opacity" as string]: ray.opacity,
    ["--ray-duration" as string]: `${ray.duration}s`,
    ["--ray-delay" as string]: `${ray.delay}s`,
  };
}

export function HeroBeams() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
        style={{
          /* Razele se sting spre jos, ca sa nu taie o linie peste continut. */
          maskImage: "linear-gradient(to bottom, black 0%, black 58%, transparent 96%)",
          WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 58%, transparent 96%)",
        }}
      >
        {SWEEP.map((ray, index) => (
          <div key={index} className="hero-ray" style={rayStyle(ray)} />
        ))}
      </div>

      {/*
        Aburul verde de sub fascicule. Lat cat toata sectiunea, nu doar cat
        titlul: un halou stramt si tare se citeste ca o pata pusa acolo, unul larg
        si slab se citeste ca lumina.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[620px]"
        style={{
          background:
            "radial-gradient(130% 110% at 22% 0%, rgba(26,181,84,0.12) 0%, rgba(26,181,84,0.05) 40%, transparent 78%)",
          filter: "blur(24px)",
        }}
      />
    </>
  );
}
