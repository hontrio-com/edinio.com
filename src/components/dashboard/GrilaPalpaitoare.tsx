"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils/cn";

/*
  ═══════════════════════════════════════════════════════════════════════════
  PATRATELE CARE PALPAIE, PENTRU FUNDALURI INCHISE                (24.11.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Fundalul panoului negru de pe site-ul Hontrio („Arată-ți produsele…"), cerut de
  proprietar pentru bannerul lor din Integrari. E „Flickering Grid" din Magic UI
  (magicui.design, MIT), cum e scris si la ei in `components/site/fx.tsx`: un
  canvas 2D, fara nicio dependenta.

  ⚠ NU CONSUMA CAT NU SE VEDE. Bucla de desen se opreste cand canvasul iese din
  ecran (`IntersectionObserver`) si porneste la loc cand reintra. Bannerul sta in
  capul unei pagini lungi; fara asta ar fi desenat 60 de cadre pe secunda sub
  cineva care a derulat de mult la curieri.

  ⚠ „REDUCE MOTION": grila se deseneaza o data si ramane nemiscata. Se citeste cu
  `matchMedia`, nu cu `useReducedMotion` din framer-motion: pentru o intrebare cu
  da sau nu n-are rost adusa biblioteca in pachetul paginii.

  ⚠ `Math.random()` E NUMAI IN EFECT, niciodata la randare: componenta nu
  deseneaza nimic pe server, deci nu exista ce sa difere la hidratare.
*/
export function GrilaPalpaitoare({
  latura = 3,
  spatiu = 6,
  sansa = 0.25,
  culoare = "255,255,255",
  opacitateMaxima = 0.18,
  className,
}: {
  /** Latura unui patratel, in pixeli CSS. */
  latura?: number;
  /** Golul dintre patratele. */
  spatiu?: number;
  /** Cat de des isi schimba un patratel stralucirea, pe secunda. */
  sansa?: number;
  /** „r,g,b". */
  culoare?: string;
  opacitateMaxima?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const faraMiscare = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let coloane = 0;
    let randuri = 0;
    let celule = new Float32Array(0);
    let dpr = 1;
    let cadru = 0;
    let ultimul = 0;
    let vizibil = true;

    const deseneaza = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const pas = (latura + spatiu) * dpr;
      const marime = latura * dpr;
      for (let i = 0; i < coloane; i++) {
        for (let j = 0; j < randuri; j++) {
          ctx.fillStyle = `rgba(${culoare},${celule[i * randuri + j]})`;
          ctx.fillRect(i * pas, j * pas, marime, marime);
        }
      }
    };

    const pregateste = () => {
      const { width, height } = canvas.getBoundingClientRect();
      /* Plafonat la 2: pe un ecran cu densitate 3, de noua ori mai multi pixeli de umplut pentru acelasi desen. */
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      coloane = Math.ceil(width / (latura + spatiu));
      randuri = Math.ceil(height / (latura + spatiu));
      celule = new Float32Array(coloane * randuri);
      for (let i = 0; i < celule.length; i++) celule[i] = Math.random() * opacitateMaxima;
      deseneaza();
    };

    const bate = (timp: number) => {
      /* Plafonat la o zecime de secunda: dupa o fila tinuta in fundal, primul cadru ar fi rescris toata grila deodata. */
      const dt = ultimul ? Math.min(0.1, (timp - ultimul) / 1000) : 0;
      ultimul = timp;
      for (let i = 0; i < celule.length; i++) {
        if (Math.random() < sansa * dt) celule[i] = Math.random() * opacitateMaxima;
      }
      deseneaza();
      cadru = vizibil ? requestAnimationFrame(bate) : 0;
    };

    const porneste = () => {
      if (faraMiscare || cadru) return;
      ultimul = 0;
      cadru = requestAnimationFrame(bate);
    };

    pregateste();
    const laRedimensionare = new ResizeObserver(pregateste);
    laRedimensionare.observe(canvas);
    const laVedere = new IntersectionObserver(([intrare]) => {
      vizibil = intrare.isIntersecting;
      if (vizibil) porneste();
    });
    laVedere.observe(canvas);
    porneste();

    return () => {
      cancelAnimationFrame(cadru);
      laRedimensionare.disconnect();
      laVedere.disconnect();
    };
  }, [latura, spatiu, sansa, culoare, opacitateMaxima]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 size-full", className)}
    />
  );
}
