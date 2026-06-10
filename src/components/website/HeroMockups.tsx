"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { motion } from "framer-motion";

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
            <motion.div
              key={src}
              className="absolute"
              animate={{
                x,
                scale,
                rotateY,
                z,
                opacity,
                zIndex,
              }}
              transition={{
                duration: 0.8,
                ease: [0.25, 0.1, 0.25, 1],
              }}
              style={{ transformStyle: "preserve-3d" }}
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
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
