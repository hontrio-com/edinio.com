"use client";

import { useState, type CSSProperties, type FocusEvent, type PointerEvent } from "react";

/** Captura primei pagini a unei teme, intreaga (`scripts/teme/capturi-teme.mjs`, indexul in `lib/teme/capturi-teme.ts`). */
export interface CapturaTema {
  adresa: string;
  latime: number;
  inaltime: number;
}

/** Cat ramane vizibil din captura in card: inaltimea ferestrei cardului fata de latime (`aspect-[4/3]`). */
const FEREASTRA = 3 / 4;

/**
 * Starea derularii si evenimentele care o pornesc: mouse-ul deasupra sau focusul de la tastatura. Se pun pe elementul pe
 * care se apasa (legatura „Vezi demo” din pagina „Teme”, butonul temei de la inscriere), care tine si captura.
 *
 * Starea, nu `group-hover`: cu durata scrisa ca clasa arbitrara, Tailwind lasa tranzitia scurta de baza (0,7 s) si poza
 * sarea jos dintr-odata (vazut de el pe 08.11.2026: „sa fie asa de sus in jos”). Stilul scris pe element se aplica sigur.
 */
export function useDerulareCaptura() {
  const [derulata, setDerulata] = useState(false);
  return {
    derulata,
    evenimente: {
      onPointerEnter: (e: PointerEvent<HTMLElement>) => { if (e.pointerType === "mouse") setDerulata(true); },
      onPointerLeave: () => setDerulata(false),
      onFocus: (e: FocusEvent<HTMLElement>) => setDerulata(e.currentTarget.matches(":focus-visible")),
      onBlur: () => setDerulata(false),
    },
  };
}

/**
 * Captura care se deruleaza pana jos cat `derulata` e adevarat, intr-un parinte `relative` cu `aspect-[4/3]` si
 * `overflow-hidden`. Comuna paginii „Teme” si pasului „Aspect” de la inscriere (16.11.2026), ca amandoua sa arate tema
 * la fel.
 *
 * Derularea: invelisul pleaca de sus (top 0) pana la `top: 100%` si se trage in sus cu toata inaltimea lui, deci josul
 * pozei ajunge la josul cardului, oricat de lunga ar fi. Tine cat pagina: ~3 s pe fiecare „ecran” al cardului, ca o
 * pagina lunga sa nu treaca in fuga. Inapoi, mai repede.
 */
export function CapturaDerulata({ captura, alt, derulata }: { captura: CapturaTema; alt: string; derulata: boolean }) {
  const ecrane = Math.max(0, captura.inaltime / captura.latime - FEREASTRA) / FEREASTRA;
  const durata = `${Math.max(2.5, ecrane * 3).toFixed(1)}s`;
  const stil: CSSProperties = derulata
    ? { top: "100%", transform: "translateY(-100%)", transition: `top ${durata} cubic-bezier(0.45, 0, 0.55, 1), transform ${durata} cubic-bezier(0.45, 0, 0.55, 1)` }
    : { top: 0, transform: "translateY(0)", transition: "top 0.8s cubic-bezier(0.22, 1, 0.36, 1), transform 0.8s cubic-bezier(0.22, 1, 0.36, 1)" };

  return (
    <span className="absolute inset-x-0 block will-change-transform motion-reduce:transition-none!" style={stil}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={captura.adresa}
        width={captura.latime}
        height={captura.inaltime}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="block h-auto w-full"
      />
    </span>
  );
}
