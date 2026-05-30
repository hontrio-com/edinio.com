"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";

const MOCKUPS = [
  "/hero/mockups/m1.png",
  "/hero/mockups/m2.png",
  "/hero/mockups/m3.png",
  "/hero/mockups/m4.png",
  "/hero/mockups/m5.png",
  "/hero/mockups/m6.png",
];

const INTERVAL = 3000;

export function HeroMockups({ className }: { className?: string }) {
  const [current, setCurrent] = useState(0);

  const next = useCallback(() => {
    setCurrent((prev) => (prev + 1) % MOCKUPS.length);
  }, []);

  useEffect(() => {
    const id = setInterval(next, INTERVAL);
    return () => clearInterval(id);
  }, [next]);

  const prev = (current - 1 + MOCKUPS.length) % MOCKUPS.length;
  const nxt = (current + 1) % MOCKUPS.length;

  return (
    <div className={className}>
      <div className="relative flex items-center justify-center h-[420px] sm:h-[500px] lg:h-[540px]">
        {/* Previous mockup (left, behind) */}
        <motion.div
          key={`prev-${prev}`}
          className="absolute left-0 sm:left-4 lg:left-2 z-10 origin-center"
          initial={false}
          animate={{
            x: 0,
            scale: 0.75,
            rotateY: 15,
            opacity: 0.5,
          }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
          style={{ perspective: 1000 }}
        >
          <div className="w-[180px] sm:w-[200px] lg:w-[220px] rounded-[2rem] overflow-hidden shadow-lg">
            <Image
              src={MOCKUPS[prev]}
              alt=""
              width={440}
              height={880}
              className="w-full h-auto"
              priority
            />
          </div>
        </motion.div>

        {/* Current mockup (center, front) */}
        <AnimatePresence mode="popLayout">
          <motion.div
            key={`current-${current}`}
            className="relative z-30 origin-center"
            initial={{ x: 120, scale: 0.75, rotateY: -15, opacity: 0.5 }}
            animate={{ x: 0, scale: 1, rotateY: 0, opacity: 1 }}
            exit={{ x: -120, scale: 0.75, rotateY: 15, opacity: 0.5 }}
            transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
            style={{ perspective: 1000 }}
          >
            <div className="w-[220px] sm:w-[250px] lg:w-[270px] rounded-[2.5rem] overflow-hidden shadow-2xl shadow-black/20">
              <Image
                src={MOCKUPS[current]}
                alt=""
                width={440}
                height={880}
                className="w-full h-auto"
                priority
              />
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Next mockup (right, behind) */}
        <motion.div
          key={`next-${nxt}`}
          className="absolute right-0 sm:right-4 lg:right-2 z-10 origin-center"
          initial={false}
          animate={{
            x: 0,
            scale: 0.75,
            rotateY: -15,
            opacity: 0.5,
          }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
          style={{ perspective: 1000 }}
        >
          <div className="w-[180px] sm:w-[200px] lg:w-[220px] rounded-[2rem] overflow-hidden shadow-lg">
            <Image
              src={MOCKUPS[nxt]}
              alt=""
              width={440}
              height={880}
              className="w-full h-auto"
              priority
            />
          </div>
        </motion.div>
      </div>
    </div>
  );
}
