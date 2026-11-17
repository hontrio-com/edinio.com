"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Check } from "lucide-react";
import { OnboardingProgress } from "@/components/onboarding/OnboardingProgress";
import { ButonContinua, LinkInapoi } from "@/components/onboarding/campuri";
import { CapturaDerulata, useDerulareCaptura } from "@/components/teme/CapturaDerulata";
import { Switch } from "@/components/ui/switch";
import { trackOnboardingStep } from "@/lib/actions/auth.actions";
import { urmareste } from "@/lib/edinio-marketing/magistrala";
import { citesteCiorna, ciornaCompleta, scrieCiorna, type CiornaOnboarding } from "@/lib/onboarding/ciorna";
import { CULORI, CULOARE_IMPLICITA, culoareValida } from "@/lib/onboarding/aspect";
import type { TemaPeScurt } from "@/lib/teme/teme-pe-scurt";
import { raportContrast } from "@/lib/storefront/design/css-vars";
import { cn } from "@/lib/utils/cn";
import { pluralRo } from "@/lib/utils/format";

/*
 * Pasul 2 al inscrierii: tema si culoarea (16.11.2026; pana atunci culoarea si unul din patru stiluri de antet).
 *
 * Cerut de el: „La Aspect in loc de stilul magazinului, adaugi Teme”. Raspunsurile lui:
 *   - culoarea „Rămâne, după temă”: alegerea temei pune culoarea ei, iar omul o poate schimba dupa;
 *   - bifa „Importă și datele demo” PORNITA la intrare (magazinul abia se creeaza, deci n-are produse ale lui);
 *   - nicio tema aleasa la intrare: „Continuă” asteapta alegerea.
 *
 * ⚠ FARA PREVIZUALIZAREA MAGAZINULUI (cerut pe 27.09.2026): temele se arata prin capturile lor, aceleasi ca in pagina
 * „Teme”, iar demo-ul viu se deschide intr-o fila noua. ⚠ Lista vine de la server (`temelePeScurt`), mica: `TEME`
 * intreaga n-are voie in pachetul paginii.
 */
export function AspectInscriere({ teme }: { teme: TemaPeScurt[] }) {
  const router = useRouter();
  const [ciorna, setCiorna] = useState<CiornaOnboarding | null>(null);
  const [cheie, setCheie] = useState<string | null>(null);
  const [culoare, setCuloare] = useState(CULOARE_IMPLICITA);
  const [dateDemo, setDateDemo] = useState(true);
  const tema = teme.find((t) => t.cheie === cheie) ?? null;

  useEffect(() => {
    const c = citesteCiorna();
    if (!ciornaCompleta(c)) {
      router.replace("/onboarding/details");
      return;
    }
    trackOnboardingStep("aspect");
    /* eslint-disable react-hooks/set-state-in-effect -- citire unica din stocarea browserului, dupa montare */
    setCiorna(c);
    const aleasa = teme.find((t) => t.cheie === c.tema);
    if (aleasa) setCheie(aleasa.cheie);
    if (c.culoare) setCuloare(culoareValida(c.culoare));
    if (typeof c.dateDemo === "boolean") setDateDemo(c.dateDemo);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [router, teme]);

  function alegeTema(t: TemaPeScurt) {
    setCheie(t.cheie);
    setCuloare(t.culoare);
    scrieCiorna({ tema: t.cheie, culoare: t.culoare });
  }

  function alegeCuloare(hex: string) {
    const v = culoareValida(hex);
    setCuloare(v);
    scrieCiorna({ culoare: v });
  }

  function schimbaDateDemo(v: boolean) {
    setDateDemo(v);
    scrieCiorna({ dateDemo: v });
  }

  function continua() {
    if (!tema) return;
    scrieCiorna({ tema: tema.cheie, culoare, dateDemo });
    urmareste({ name: "onboarding_step_complete", onboarding_step: "aspect", onboarding_step_index: 2 });
    router.push("/onboarding/plan");
  }

  /* Culoarea temei alese intra prima in paleta (niciuna din cele 30 nu e printre cele opt de pornire). */
  const culori = tema && !CULORI.some((c) => c.hex.toLowerCase() === tema.culoare.toLowerCase())
    ? [{ hex: tema.culoare, nume: `Culoarea temei ${tema.nume}` }, ...CULORI]
    : CULORI;
  const culoarePersonalizata = !culori.some((c) => c.hex.toLowerCase() === culoare.toLowerCase());
  const poateContinua = !!ciorna && !!tema;

  return (
    <>
      <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-8 sm:px-6 sm:pt-12 lg:pb-12">
        <div className="mx-auto max-w-3xl">
          <OnboardingProgress currentStep={2} />
        </div>
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-foreground sm:text-[32px]">Alege cum arată</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
            Alege tema magazinului, apoi culoarea principală. Le poți schimba oricând din panou.
          </p>
        </div>

        <div className="mt-10 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-8">
          <section aria-labelledby="titlu-teme">
            <h2 id="titlu-teme" className="mb-4 text-sm font-medium text-foreground">
              Tema magazinului <span className="font-normal text-muted-foreground">· {pluralRo(teme.length, "temă", "teme")}</span>
            </h2>
            <div role="radiogroup" aria-labelledby="titlu-teme" className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3">
              {teme.map((t) => (
                <CardTema key={t.cheie} tema={t} aleasa={t.cheie === cheie} onAlege={() => alegeTema(t)} />
              ))}
            </div>
          </section>

          <aside className="mt-10 lg:sticky lg:top-6 lg:mt-0">
            <div className="rounded-2xl border border-border bg-surface p-5">
              <p className="text-xs font-medium text-muted-foreground">Tema aleasă</p>
              <p className="mt-0.5 text-[15px] font-semibold text-foreground">{tema ? tema.nume : "Alege o temă din listă"}</p>
              {tema && <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{tema.pentru}</p>}

              <fieldset className="mt-6">
                <legend className="mb-3 text-sm font-medium text-foreground">Culoarea principală</legend>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Culoarea principală">
                  {culori.map((c) => {
                    const aleasa = c.hex.toLowerCase() === culoare.toLowerCase();
                    return (
                      <button
                        key={c.hex}
                        type="button"
                        role="radio"
                        aria-checked={aleasa}
                        aria-label={c.nume}
                        title={c.nume}
                        onClick={() => alegeCuloare(c.hex)}
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-full ring-1 ring-black/10 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2",
                          aleasa && "ring-2 ring-foreground ring-offset-2",
                        )}
                        style={{ backgroundColor: c.hex }}
                      >
                        {aleasa && <Check className={cn("h-4 w-4", bifaInchisa(c.hex) ? "text-neutral-900" : "text-white")} strokeWidth={3} />}
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
                {tema && culoare.toLowerCase() !== tema.culoare.toLowerCase() && (
                  <p className="mt-2.5 text-xs leading-snug text-muted-foreground">Magazinul primește culoarea ta în locul celei a temei.</p>
                )}
              </fieldset>

              <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/40 p-3.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">Importă și datele demo</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    {tema ? `Magazinul pornește ca în demo: ${ceAduceDemo(tema)}.` : "Magazinul pornește ca în demo-ul temei, cu produse, bannere și categorii de exemplu."}{" "}
                    Le ștergi oricând din pagina „Teme”.
                  </span>
                </span>
                <Switch checked={dateDemo} onCheckedChange={schimbaDateDemo} className="mt-0.5" />
              </label>

              {/* Pe telefon „Continuă” sta in bara de jos, la vedere oricat ai derula prin teme. */}
              <div className="mt-6 hidden lg:block">
                <ButonContinua type="button" onClick={continua} dezactivat={!poateContinua}>Continuă</ButonContinua>
                {!tema && <p className="mt-2 text-center text-xs text-muted-foreground">Alege o temă ca să continui.</p>}
              </div>
              <LinkInapoi onClick={() => router.push("/onboarding/details")} />
            </div>
          </aside>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background px-4 py-3 lg:hidden">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <p className="min-w-0 flex-1 truncate text-sm">
            {tema ? (
              <>
                <span className="text-muted-foreground">Tema </span>
                <span className="font-semibold text-foreground">{tema.nume}</span>
              </>
            ) : (
              <span className="text-muted-foreground">Alege o temă ca să continui.</span>
            )}
          </p>
          <button
            type="button"
            onClick={continua}
            disabled={!poateContinua}
            className="h-11 shrink-0 rounded-lg bg-primary px-6 text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Continuă
          </button>
        </div>
      </div>
    </>
  );
}

/**
 * Bifa de pe culoarea aleasa: inchisa sau alba, dupa care se vede MAI BINE pe ea (contrastul WCAG). Pragul de luminanta
 * de 0,5 (`esteDeschisa`) lasa alb pe auriul Marte (#C8A27A), unde albul abia se vede (2,4:1, fata de 7,6:1 pentru #171717).
 */
function bifaInchisa(hex: string): boolean {
  return (raportContrast(hex, "#171717") ?? 0) > (raportContrast(hex, "#ffffff") ?? 0);
}

/** „12 produse cu categoriile lor, 3 bannere și 2 rânduri pe prima pagină”: doar ce are tema. */
function ceAduceDemo(t: TemaPeScurt): string {
  const parti = [
    t.demo.produse > 0 && `${pluralRo(t.demo.produse, "produs", "produse")} cu categoriile lor`,
    t.demo.bannere > 0 && pluralRo(t.demo.bannere, "banner", "bannere"),
    t.demo.randuri > 0 && `${pluralRo(t.demo.randuri, "rând", "rânduri")} pe prima pagină`,
  ].filter((p): p is string => !!p);
  if (parti.length === 0) return "textele de exemplu ale temei";
  return parti.length === 1 ? parti[0] : `${parti.slice(0, -1).join(", ")} și ${parti[parti.length - 1]}`;
}

/**
 * Cardul unei teme: captura primei pagini (aceeasi ca in pagina „Teme”, derulata cat tii mouse-ul pe ea), numele si
 * pentru cine e. Apasat, alege tema; „Vezi demo” deschide demo-ul viu intr-o fila noua, separat de alegere.
 */
function CardTema({ tema: t, aleasa, onAlege }: { tema: TemaPeScurt; aleasa: boolean; onAlege: () => void }) {
  const { derulata, evenimente } = useDerulareCaptura();
  return (
    <div className="flex flex-col">
      <button
        type="button"
        role="radio"
        aria-checked={aleasa}
        onClick={onAlege}
        {...evenimente}
        className="group/tema rounded-xl text-left outline-none"
      >
        <span
          className={cn(
            "relative block aspect-[4/3] overflow-hidden rounded-xl bg-muted ring-1 ring-black/[0.08] transition-shadow duration-200",
            "group-hover/tema:shadow-[0_10px_28px_-14px_rgba(15,23,42,0.35)] group-focus-visible/tema:ring-2 group-focus-visible/tema:ring-primary/50",
            aleasa && "ring-2 ring-primary group-focus-visible/tema:ring-primary",
          )}
        >
          {t.captura ? (
            <CapturaDerulata captura={t.captura} alt="" derulata={derulata} />
          ) : (
            <span className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">{t.nume}</span>
          )}
          {aleasa && (
            <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground shadow-sm">
              <Check className="h-3 w-3" strokeWidth={3} /> Aleasă
            </span>
          )}
        </span>
        <span className="mt-2.5 block text-sm font-semibold text-foreground">{t.nume}</span>
        <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-muted-foreground" title={t.descriere}>{t.pentru}</span>
      </button>
      <a
        href={t.adresaDemo}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1.5 inline-flex items-center gap-0.5 self-start rounded text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        Vezi demo <ArrowUpRight className="h-3 w-3" aria-hidden />
        <span className="sr-only">: tema {t.nume}, într-o filă nouă</span>
      </a>
    </div>
  );
}
