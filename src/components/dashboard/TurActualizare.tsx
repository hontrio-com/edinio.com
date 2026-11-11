"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Pause, Play, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { esteEcranIntreg } from "@/lib/editor-magazin/ecran-intreg";
import { TUR_ACTUALIZARE as TUR } from "@/lib/actualizari/tur-actualizare";
import { marcheazaTurulVazut } from "@/lib/actions/tur-actualizare.actions";

/*
  Fereastra „Ce e nou în Edinio” (turul actualizarii). Montata o data, in layoutul panoului.

  - Se deschide SINGURA o singura data, la prima intrare dupa lansare (regula: `deschideLaIntrare`), la o clipa dupa ce
    s-a asezat pagina, si niciodata peste editorul pe tot ecranul: acolo asteapta prima pagina obisnuita a panoului.
  - Se redeschide oricand din legatura „Ce e nou în editor” (`?tur=actualizare`), fara sa mai scrie nimic.
  - Inchiderea, oricum ar fi (X, Esc, clic alaturi, „Mai târziu”, butonul de la final), o marcheaza vazuta.

  Clipurile pornesc fara sunet si in bucla, cu buton de pauza (o animatie de peste 5 secunde trebuie sa se poata opri,
  WCAG 2.2.2). Cu miscarea redusa din sistem nu pornesc singure: se vede poza, iar butonul le porneste la cerere.
*/
const MISCARE_REDUSA = "(prefers-reduced-motion: reduce)";
const aboneazaMiscarea = (anunta: () => void) => {
  const m = window.matchMedia(MISCARE_REDUSA);
  m.addEventListener("change", anunta);
  return () => m.removeEventListener("change", anunta);
};

export function TurActualizare({ laIntrare }: { laIntrare: boolean }) {
  const pathname = usePathname();
  const cauta = useSearchParams();
  const router = useRouter();
  const [deschis, setDeschis] = useState(false);
  const [pas, setPas] = useState(0);
  /** Pauza sau pornirea ceruta de om, tinuta pe pasul ei: pasul urmator porneste iar de la regula de mai jos. */
  const [comanda, setComanda] = useState<{ pas: number; ruleaza: boolean } | null>(null);
  const miscareRedusa = useSyncExternalStore(aboneazaMiscarea, () => window.matchMedia(MISCARE_REDUSA).matches, () => false);
  const marcat = useRef(false);
  const video = useRef<HTMLVideoElement>(null);
  const inainte = useRef<HTMLButtonElement>(null);

  // Din legatura „Ce e nou în editor” (`?tur=actualizare`): deschisa cat timp adresa o cere; la inchidere se curata.
  const dinAdresa = cauta.get("tur") === "actualizare";
  const vizibila = deschis || dinAdresa;
  const p = TUR.pasi[pas];
  const ultimul = pas === TUR.pasi.length - 1;
  // Fiecare pas porneste singur, mai putin cu miscarea redusa din sistem; butonul de pauza schimba doar pasul lui.
  const ruleaza = comanda && comanda.pas === pas ? comanda.ruleaza : !miscareRedusa;

  // Singura, la intrare.
  useEffect(() => {
    if (!laIntrare || marcat.current || esteEcranIntreg(pathname)) return;
    const id = window.setTimeout(() => setDeschis(true), 700);
    return () => window.clearTimeout(id);
  }, [laIntrare, pathname]);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (ruleaza) v.play().catch(() => setComanda({ pas, ruleaza: false }));
    else v.pause();
  }, [ruleaza, pas, vizibila]);

  function inchide() {
    setDeschis(false);
    setPas(0);
    if (dinAdresa) {
      const rest = new URLSearchParams(cauta.toString());
      rest.delete("tur");
      router.replace(`${pathname}${rest.size ? `?${rest}` : ""}`, { scroll: false });
    }
    if (laIntrare && !marcat.current) {
      marcat.current = true;
      // Fara tranzitie: o scriere a carei cadere nu schimba nimic pe ecran nu trebuie sa tina navigarea.
      void marcheazaTurulVazut().catch(() => {});
    }
  }

  function laTasta(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight" && !ultimul) { e.preventDefault(); setPas(pas + 1); }
    if (e.key === "ArrowLeft" && pas > 0) { e.preventDefault(); setPas(pas - 1); }
  }

  return (
    <Dialog open={vizibila} onOpenChange={(d) => { if (!d) inchide(); }}>
      <DialogContent showCloseButton={false} initialFocus={inainte} onKeyDown={laTasta}
        className="gap-0 overflow-hidden p-0 sm:max-w-[54rem]">
        <div className="relative aspect-video w-full overflow-hidden bg-muted">
          {p.video ? (
            <video ref={video} key={p.cheie} poster={p.poster} muted loop playsInline autoPlay={!miscareRedusa} preload="auto"
              aria-label={`Clip: ${p.titlu}`} className="h-full w-full object-cover">
              <source src={p.video.mp4} type="video/mp4" />
            </video>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- poza e deja la marimea ei, in `public`
            <img key={p.cheie} src={p.poster} alt="" className="h-full w-full object-cover" />
          )}
          <button type="button" onClick={inchide} aria-label="Închide"
            className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 pb-5 pt-4 sm:px-7 sm:pb-6 sm:pt-5">
          <div className="flex items-center gap-2 text-xs font-medium">
            <span className="text-[var(--primary-text)]">{TUR.eticheta}</span>
            <span className="ml-auto text-muted-foreground">Pasul {pas + 1} din {TUR.pasi.length}</span>
          </div>
          <div aria-live="polite">
            <DialogTitle className="mt-2 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{p.titlu}</DialogTitle>
            <DialogDescription className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{p.text}</DialogDescription>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3">
              {/* Pauza sta langa punctele pasilor, nu peste clip: subtitrarile clipurilor stau in colturile de jos, iar un
                  buton pus peste clip le atingea marginea (pe telefon le acoperea capatul). */}
              {p.video && (
                <button type="button" onClick={() => setComanda({ pas, ruleaza: !ruleaza })} aria-label={ruleaza ? "Oprește clipul" : "Pornește clipul"}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                  {ruleaza ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                </button>
              )}
              <div className="flex items-center gap-2" role="group" aria-label="Pașii turului">
                {TUR.pasi.map((q, i) => (
                  <button key={q.cheie} type="button" onClick={() => setPas(i)} aria-label={`Pasul ${i + 1}: ${q.titlu}`}
                    aria-current={i === pas ? "step" : undefined}
                    className={cn(
                      "relative h-2 rounded-full transition-all before:absolute before:-inset-x-1 before:-inset-y-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                      i === pas ? "w-6 bg-primary" : "w-2 bg-foreground/20 hover:bg-foreground/35",
                    )} />
                ))}
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {pas > 0 ? (
                <Button variant="outline" onClick={() => setPas(pas - 1)}><ArrowLeft /> Înapoi</Button>
              ) : (
                <Button variant="ghost" onClick={inchide}>Mai târziu</Button>
              )}
              {ultimul ? (
                <Button ref={inainte} onClick={() => { inchide(); router.push(TUR.final.href); }}>
                  {TUR.final.eticheta} <ArrowRight />
                </Button>
              ) : (
                <Button ref={inainte} onClick={() => setPas(pas + 1)}>Mai departe <ArrowRight /></Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
