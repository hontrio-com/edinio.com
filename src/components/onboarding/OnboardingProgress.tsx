import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/*
 * Pasii inscrierii (27.09.2026): magazinul, aspectul, planul, primul produs.
 *
 * ⚠ AL PATRULEA E DUPA CREAREA MAGAZINULUI, nu inainte. Masurat in productie pe
 * 90 de zile: 26 din 41 de magazine noi n-au pus niciodata un produs. Pasul nu
 * blocheaza pe nimeni (are „Sar peste"), dar il intalneste pe fiecare.
 */
export const PASI_ONBOARDING = ["Magazinul", "Aspectul", "Planul", "Primul produs"] as const;

export function OnboardingProgress({ currentStep }: { currentStep: number }) {
  return (
    <nav aria-label="Pașii configurării" className="mb-8 select-none">
      <p className="mb-3 text-xs font-medium text-muted-foreground">
        Pasul {currentStep} din {PASI_ONBOARDING.length}
      </p>
      <ol className="flex items-center gap-2">
        {PASI_ONBOARDING.map((eticheta, i) => {
          const numar = i + 1;
          const gata = currentStep > numar;
          const activ = currentStep === numar;
          return (
            <li key={eticheta} className="flex min-w-0 flex-1 flex-col gap-2" aria-current={activ ? "step" : undefined}>
              <span className={cn("h-1 rounded-full transition-colors", gata || activ ? "bg-primary" : "bg-border")} />
              <span
                className={cn(
                  "hidden items-center gap-1 truncate text-xs sm:flex",
                  activ ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {gata && <Check className="h-3 w-3 shrink-0 text-primary" strokeWidth={3} />}
                {eticheta}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
