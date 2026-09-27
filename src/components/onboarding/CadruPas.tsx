import type { ReactNode } from "react";
import { OnboardingProgress } from "./OnboardingProgress";

/*
 * Asezarea unui pas: o singura coloana, centrata.
 *
 * ⚠ FARA PREVIZUALIZAREA MAGAZINULUI (27.09.2026): a existat o zi, cu magazinul
 * viitor randat la dreapta, si a fost scoasa la cererea lui.
 */
export function CadruPas({
  pas,
  titlu,
  descriere,
  children,
}: {
  pas: number;
  titlu: string;
  descriere?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-8 sm:px-6 sm:py-12">
      <OnboardingProgress currentStep={pas} />
      <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-foreground sm:text-[32px]">{titlu}</h1>
      {descriere && <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{descriere}</p>}
      <div className="mt-8">{children}</div>
    </div>
  );
}
