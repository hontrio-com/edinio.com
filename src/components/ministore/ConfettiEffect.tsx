"use client";

import { useEffect } from "react";
import confetti from "canvas-confetti";

export function ConfettiEffect({ color }: { color: string }) {
  useEffect(() => {
    const end = Date.now() + 1000;

    const fire = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: [color, "#ffffff", "#a8e6cf"],
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: [color, "#ffffff", "#a8e6cf"],
      });

      if (Date.now() < end) {
        requestAnimationFrame(fire);
      }
    };

    fire();
  }, [color]);

  return null;
}
