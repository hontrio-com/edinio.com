"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { UrmaPasOnboarding } from "@/components/edinio-marketing/UrmaPalnie";
import { CadruPas } from "@/components/onboarding/CadruPas";
import { ButonContinua, LinkInapoi } from "@/components/onboarding/campuri";
import { trackOnboardingStep } from "@/lib/actions/auth.actions";
import { urmareste } from "@/lib/edinio-marketing/magistrala";
import { citesteCiorna, ciornaCompleta, scrieCiorna, type CiornaOnboarding } from "@/lib/onboarding/ciorna";
import { CULORI, CULOARE_IMPLICITA, culoareValida, STILURI, STIL_IMPLICIT, stilDupaId, type StilMagazin } from "@/lib/onboarding/aspect";
import { cn } from "@/lib/utils/cn";

/*
 * Pasul 2: cum arata magazinul (27.09.2026).
 *
 * Vine INAINTEA planului, anume: omul ajunge la pret dupa ce si-a ales cum arata
 * magazinul, nu inainte. Tot ce se alege aici se schimba si mai
 * tarziu, din „Editeaza magazinul" si din „Design sectiuni".
 */
export default function OnboardingAspectPage() {
  const router = useRouter();
  const [ciorna, setCiorna] = useState<CiornaOnboarding | null>(null);
  const [culoare, setCuloare] = useState(CULOARE_IMPLICITA);
  const [stil, setStil] = useState<StilMagazin>(STIL_IMPLICIT);

  useEffect(() => {
    const c = citesteCiorna();
    if (!ciornaCompleta(c)) {
      router.replace("/onboarding/details");
      return;
    }
    trackOnboardingStep("aspect");
    /* eslint-disable react-hooks/set-state-in-effect -- citire unica din stocarea browserului, dupa montare */
    setCiorna(c);
    if (c.culoare) setCuloare(culoareValida(c.culoare));
    if (c.stil) setStil(stilDupaId(c.stil));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [router]);

  function alegeCuloare(hex: string) {
    const v = culoareValida(hex);
    setCuloare(v);
    scrieCiorna({ culoare: v });
  }

  function alegeStil(s: StilMagazin) {
    setStil(s);
    scrieCiorna({ stil: s.id });
  }

  function continua() {
    scrieCiorna({ culoare, stil: stil.id });
    urmareste({ name: "onboarding_step_complete", onboarding_step: "aspect", onboarding_step_index: 2 });
    router.push("/onboarding/plan");
  }

  const culoarePersonalizata = !CULORI.some((c) => c.hex.toLowerCase() === culoare.toLowerCase());

  return (
    <>
      <UrmaPasOnboarding pas="aspect" index={2} />
      <CadruPas
        pas={2}
        titlu="Alege cum arată"
        descriere="Culoarea principală și stilul magazinului. Le poți schimba oricând din panou."
      >
        <fieldset>
          <legend className="mb-3 text-sm font-medium text-foreground">Culoarea principală</legend>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Culoarea principală">
            {CULORI.map((c) => {
              const ales = c.hex.toLowerCase() === culoare.toLowerCase();
              return (
                <button
                  key={c.hex}
                  type="button"
                  role="radio"
                  aria-checked={ales}
                  aria-label={c.nume}
                  title={c.nume}
                  onClick={() => alegeCuloare(c.hex)}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2",
                    ales && "ring-2 ring-foreground ring-offset-2",
                  )}
                  style={{ backgroundColor: c.hex }}
                >
                  {ales && <Check className="h-4 w-4 text-white" strokeWidth={3} />}
                </button>
              );
            })}
            <label
              title="Altă culoare"
              className={cn(
                "relative flex h-8 w-8 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed border-border bg-[conic-gradient(from_90deg,#f43f5e,#f59e0b,#22c55e,#06b6d4,#6366f1,#d946ef,#f43f5e)] focus-within:ring-2 focus-within:ring-primary/40 focus-within:ring-offset-2",
                culoarePersonalizata && "ring-2 ring-foreground ring-offset-2",
              )}
            >
              <span className="sr-only">Altă culoare</span>
              <input
                type="color"
                value={culoare}
                onChange={(e) => alegeCuloare(e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
              {culoarePersonalizata && <span className="h-4 w-4 rounded-full border-2 border-white" style={{ backgroundColor: culoare }} />}
            </label>
          </div>
        </fieldset>

        <fieldset className="mt-8">
          <legend className="mb-3 text-sm font-medium text-foreground">Stilul magazinului</legend>
          <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Stilul magazinului">
            {STILURI.map((s) => {
              const ales = s.id === stil.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={ales}
                  onClick={() => alegeStil(s)}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                    ales ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-surface hover:border-foreground/30",
                  )}
                >
                  <SchitaAntet stil={s} culoare={culoare} />
                  <span className="mt-3 block text-sm font-semibold text-foreground">{s.nume}</span>
                  <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{s.descriere}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-10">
          <ButonContinua type="button" onClick={continua} dezactivat={!ciorna}>Continuă</ButonContinua>
          <LinkInapoi onClick={() => router.push("/onboarding/details")} />
        </div>
      </CadruPas>
    </>
  );
}

/* O schita mica a antetului, ca stilurile sa se deosebeasca dintr-o privire. */
function SchitaAntet({ stil, culoare }: { stil: StilMagazin; culoare: string }) {
  const linie = "h-1 rounded-full bg-foreground/15";
  return (
    <div className="h-14 overflow-hidden rounded-md border border-border bg-white p-2" aria-hidden>
      {stil.antet === "classic" && (
        <div className="flex items-center gap-2">
          <span className="h-2 w-8 rounded-sm bg-foreground/70" />
          <span className={cn(linie, "ml-auto w-5")} /><span className={cn(linie, "w-5")} /><span className={cn(linie, "w-5")} />
          <span className="ml-auto h-2.5 w-2.5 rounded-full" style={{ backgroundColor: culoare }} />
        </div>
      )}
      {stil.antet === "centered" && (
        <div className="flex flex-col items-center gap-1.5">
          <span className="h-2 w-12 rounded-sm bg-foreground/70" />
          <div className="flex gap-1.5"><span className={cn(linie, "w-4")} /><span className={cn(linie, "w-4")} /><span className={cn(linie, "w-4")} /></div>
        </div>
      )}
      {stil.antet === "market" && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-6 rounded-sm bg-foreground/70" />
            <span className="h-3 flex-1 rounded-sm border border-border" />
            <span className="h-3 w-4 rounded-sm" style={{ backgroundColor: culoare }} />
          </div>
          <span className="h-2.5 w-full rounded-sm" style={{ backgroundColor: culoare, opacity: 0.85 }} />
        </div>
      )}
      {stil.antet === "pills" && (
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-7 rounded-full bg-foreground/70" />
          <span className="ml-auto h-3 w-7 rounded-full bg-foreground/10" /><span className="h-3 w-7 rounded-full bg-foreground/10" />
          <span className="h-3 w-8 rounded-full" style={{ backgroundColor: culoare }} />
        </div>
      )}
    </div>
  );
}
