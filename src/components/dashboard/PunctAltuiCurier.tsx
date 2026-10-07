import type { PunctStrain } from "@/lib/orders/punctul-altui-curier";

/**
 * Avertismentul din ferestrele de AWB cand clientul a ales punctul ALTUI curier. Regula si
 * masuratoarea stau in `punctul-altui-curier.ts`.
 */
export function PunctAltuiCurier({ punct, curier }: { punct: PunctStrain | null; curier: string }) {
  if (!punct) return null;
  return (
    <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs text-foreground">
      <p className="font-semibold">Clientul a ales {punct.numePunct} ({punct.dePe}).</p>
      <p className="mt-1">
        Prin {curier} coletul nu poate ajunge in acel punct, deci adresa de mai jos e cea de ACASA a clientului, nu a punctului.{" "}
        {punct.linieAcasa
          ? "Am pus adresa de acasa scrisa de el in checkout; verific-o."
          : punct.dePe === "eMAG"
            ? "eMAG nu trimite adresa de acasa la livrarea in easybox: afl-o de la client, sau emite AWB-ul prin eMAG."
            : "Clientul n-a scris o adresa de acasa: afl-o de la el inainte sa emiti."}
      </p>
    </div>
  );
}
