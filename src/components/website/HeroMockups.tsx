"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";

/*
  ═══════════════════════════════════════════════════════════════════════════
  ⚠ FĂRĂ `framer-motion` — SCOS PE 31.08.2026, DUPĂ MĂSURĂTOARE
  ═══════════════════════════════════════════════════════════════════════════

  Fișierul ăsta era singurul motiv pentru care `/start` încărca `framer-motion`:
  42.617 de octeți gzip, în două fișiere, pentru UN `motion.div`. Pagina de
  aterizare — adică exact pagina pe care cad vizitatorii din reclame plătite.

  ⚠ ÎNLOCUIREA E LITERALĂ, NU „ECHIVALENTĂ". `animate={{x, scale, rotateY, z}}`
  se serializează de `framer-motion` în ordinea din `transformPropOrder`
  (motion-dom, rândul 1841): `x, y, z, translateX…, scale…, rotate, rotateX,
  rotateY`. Deci `translateX() translateZ() scale() rotateY()` — exact ordinea
  scrisă mai jos. Ordinea contează: transformările se compun ca matrice, iar
  `scale` înainte de `translate` ar muta placa altundeva.

  Aceeași durată (0,8 s) și aceeași curbă (`cubic-bezier(.25,.1,.25,1)`), scrise
  în `.mockup-hero` din `stil-comun.css`.

  ⚠ `zIndex` NU E ÎN TRANZIȚIE, dinadins. `framer-motion` îl interpola ca număr,
  între 10 și 30, iar browserul rotunjea — adică sărea oricum. Aici sare direct.

  ⚠ CE S-A CÂȘTIGAT PE DEASUPRA: acum se respectă `prefers-reduced-motion`.
  `framer-motion` nu oprea singur animația, iar plăcile se roteau la nesfârșit
  și pentru cine a cerut mai puțină mișcare din sistem. Vezi `stil-comun.css`.
*/

const MOCKUPS = [
  "/hero/mockups/m1.png",
  "/hero/mockups/m2.png",
  "/hero/mockups/m3.png",
  "/hero/mockups/m4.png",
  "/hero/mockups/m5.png",
  "/hero/mockups/m6.png",
];

const INTERVAL = 3000;

function getOffset(index: number, current: number, total: number) {
  let diff = index - current;
  // Wrap around for seamless loop
  if (diff > total / 2) diff -= total;
  if (diff < -total / 2) diff += total;
  return diff;
}

export function HeroMockups({ className }: { className?: string }) {
  const [current, setCurrent] = useState(0);

  const next = useCallback(() => {
    setCurrent((prev) => (prev + 1) % MOCKUPS.length);
  }, []);

  useEffect(() => {
    const id = setInterval(next, INTERVAL);
    return () => clearInterval(id);
  }, [next]);

  return (
    <div className={className}>
      <div
        className="relative flex items-center justify-center h-[420px] sm:h-[500px] lg:h-[540px]"
        style={{ perspective: 800 }}
      >
        {MOCKUPS.map((src, i) => {
          const offset = getOffset(i, current, MOCKUPS.length);
          const isVisible = offset >= -1 && offset <= 1;

          // Position: center = 0, left = -1, right = 1
          const x = offset * 160;
          const scale = offset === 0 ? 1 : 0.78;
          const rotateY = offset * -12;
          const z = offset === 0 ? 0 : -100;
          const opacity = isVisible ? (offset === 0 ? 1 : 0.6) : 0;
          const zIndex = offset === 0 ? 30 : 10;

          return (
            <div
              key={src}
              className="mockup-hero absolute"
              style={{
                /* ⚠ Ordinea e cea din `transformPropOrder`. Vezi nota de sus. */
                transform: `translateX(${x}px) translateZ(${z}px) scale(${scale}) rotateY(${rotateY}deg)`,
                opacity,
                zIndex,
              }}
            >
              <div
                className={`rounded-[2rem] overflow-hidden ${
                  offset === 0
                    ? "w-[220px] sm:w-[250px] lg:w-[270px] shadow-2xl shadow-black/20"
                    : "w-[190px] sm:w-[210px] lg:w-[230px] shadow-xl shadow-black/10"
                }`}
              >
                <Image
                  src={src}
                  alt={`Exemplu magazin online creat cu Edinio - ${i + 1}`}
                  width={440}
                  height={880}
                  className="w-full h-auto"
                  priority
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
