import React, { type ComponentPropsWithoutRef, type CSSProperties } from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Ripple — cercuri concentrice care pulsează, de la Magic UI.
 *
 * Adusă în proiect la cererea clientului (13.08), care a trimis chiar fragmentul
 * lor. E scrisă aici, nu instalată cu `shadcn add`: comanda lor folosește `pnpm`
 * și ar fi umblat la fișierele de configurare ale proiectului, iar tot ce aduce e
 * fișierul ăsta plus o animație. Așa se vede ce s-a adus.
 *
 * ⚠ DOUĂ ABATERI DE LA ORIGINAL, amândouă din același motiv: al lor e făcut
 * pentru fundal ÎNCHIS, al nostru stă pe alb.
 *
 * 1. `clasaCerc` — al lor scrie culoarea cercurilor direct în componentă
 *    (`bg-foreground/25`), deci nu se poate schimba din afară: `className` merge
 *    doar pe înveliș. Fără proprietatea asta, cercurile ar fi ieșit cenușiu
 *    închis pe un panou alb.
 * 2. Masca se poate da din afară. A lor stinge efectul spre JOS
 *    (`to bottom, white, transparent`), potrivit când desenul stă sus. La noi
 *    lacătul e la mijloc, deci trebuie stins în toate părțile.
 *
 * Animația `ripple` stă în `globals.css`, lângă celelalte cadre-cheie.
 */

interface RippleProps extends ComponentPropsWithoutRef<"div"> {
  /** Diametrul primului cerc, în pixeli. Fiecare următor e cu 70 mai mare. */
  mainCircleSize?: number;
  mainCircleOpacity?: number;
  numCircles?: number;
  /** Clase pentru FIECARE cerc — culoarea lor. Vezi nota de sus. */
  clasaCerc?: string;
}

export const Ripple = React.memo(function Ripple({
  mainCircleSize = 210,
  mainCircleOpacity = 0.24,
  numCircles = 8,
  className,
  clasaCerc,
  ...props
}: RippleProps) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 select-none", className)} {...props}>
      {Array.from({ length: numCircles }, (_, i) => {
        const size = mainCircleSize + i * 70;
        const opacity = mainCircleOpacity - i * 0.03;

        return (
          <div
            key={i}
            className={cn(
              "absolute rounded-full border bg-foreground/25 shadow-xl",
              /* Fără mișcare, cercurile rămân pe loc — desenul e oricum
                 înțeles, doar că nu mai respiră. */
              "motion-reduce:animate-none",
              clasaCerc,
            )}
            style={
              {
                "--i": i,
                width: `${size}px`,
                height: `${size}px`,
                opacity,
                animation: "ripple var(--duration, 2s) ease calc(var(--i, 0) * 0.2s) infinite",
                borderStyle: "solid",
                borderWidth: "1px",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%) scale(1)",
              } as CSSProperties
            }
          />
        );
      })}
    </div>
  );
});
