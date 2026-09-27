import type { ReactNode } from "react";
import { OnboardingProgress } from "./OnboardingProgress";

/*
 * Asezarea unui pas: formularul la stanga, magazinul viitor la dreapta.
 *
 * Pe telefon previzualizarea coboara SUB formular, nu deasupra: omul vine sa
 * completeze ceva, iar un magazin intreg inaintea primului camp l-ar fi facut sa
 * derulezi ca sa gasesti de unde incepi.
 */
export function CadruPas({
  pas,
  titlu,
  descriere,
  children,
  previzualizare,
}: {
  pas: number;
  titlu: string;
  descriere?: ReactNode;
  children: ReactNode;
  previzualizare?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <div className={previzualizare ? "grid gap-10 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:gap-14" : "mx-auto max-w-xl"}>
        <div className="min-w-0">
          <OnboardingProgress currentStep={pas} />
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-foreground sm:text-[32px]">{titlu}</h1>
          {descriere && <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{descriere}</p>}
          <div className="mt-8">{children}</div>
        </div>
        {previzualizare && (
          <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            {previzualizare}
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Imaginile și produsele sunt exemple. Le înlocuiești cu ale tale după creare.
            </p>
          </aside>
        )}
      </div>
    </div>
  );
}
