"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, Loader2, Palette, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLucru } from "@/components/dashboard/useLucru";
import { aplicaTema, puneLaLocDesignulDeDinainte } from "@/lib/actions/store-design.actions";

export interface TemaPeCard {
  cheie: string;
  nume: string;
  descriere: string;
  culoare: string;
  adresaDemo: string;
}

/** Latimea la care se randeaza demo-ul in miniatura: un ecran de calculator, micsorat cat cardul. */
const LATIME_DEMO = 1440;

/**
 * Pagina „Teme” (etapa 17 din `docs/editor-magazin/PLAN.md`). „Aplică tema” pune tema direct in magazin, cu designul
 * de acum pastrat in Istoric; „Pune la loc designul de dinainte” il readuce. Amandoua intreaba intai, cu ce se intampla.
 */
export function TemeClient({ businessId, teme, aplicata, aplicataLa, poatePuneLaLoc, areCiorna, public: estePublic }: {
  businessId: string;
  teme: TemaPeCard[];
  aplicata: { cheie: string } | null;
  /** Data aplicarii, scrisa pe server (fusul orar al Romaniei). */
  aplicataLa: string | null;
  poatePuneLaLoc: boolean;
  areCiorna: boolean;
  public: boolean;
}) {
  const router = useRouter();
  const [deAplicat, setDeAplicat] = useState<TemaPeCard | null>(null);
  const [laLoc, setLaLoc] = useState(false);
  const [lucreaza, porneste] = useLucru();

  const aplica = (t: TemaPeCard) => porneste(async () => {
    const r = await aplicaTema(businessId, t.cheie);
    if ("error" in r) {
      toast.error(r.error);
      return;
    }
    setDeAplicat(null);
    toast.success(`Tema ${t.nume} e în magazin. O reglezi în editor, ca orice design.`);
    router.refresh();
  });

  const puneLaLoc = () => porneste(async () => {
    const r = await puneLaLocDesignulDeDinainte(businessId);
    if ("error" in r) {
      toast.error(r.error);
      return;
    }
    setLaLoc(false);
    toast.success("Designul de dinainte e din nou în magazin.");
    router.refresh();
  });

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">Teme</h1>
        <p className="text-sm text-muted-foreground">
          Un design întreg pentru magazinul tău: antetul, prima pagină, paginile de categorie și de produs, cardul de produs,
          culoarea și fonturile. Produsele și textele tale rămân neatinse.
        </p>
      </div>

      <ul className="grid gap-6 md:grid-cols-2">
        {teme.map((t) => {
          const esteAplicata = aplicata?.cheie === t.cheie;
          return (
            <li key={t.cheie} className="rounded-2xl border border-border bg-surface overflow-hidden flex flex-col">
              <MiniaturaDemo adresa={t.adresaDemo} nume={t.nume} />
              <div className="p-4 space-y-3 flex-1 flex flex-col">
                <div className="flex items-center gap-2">
                  <span aria-hidden className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: t.culoare }} />
                  <h2 className="text-base font-semibold text-foreground">{t.nume}</h2>
                  {esteAplicata && (
                    <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                      <Check className="h-3 w-3" /> În magazin
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground flex-1">{t.descriere}</p>
                {esteAplicata && aplicataLa && <p className="text-xs text-muted-foreground">Aplicată pe {aplicataLa}.</p>}
                <div className="flex flex-wrap gap-2">
                  <a href={t.adresaDemo} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "outline" }))}>
                    <ExternalLink /> Vezi demo
                  </a>
                  {esteAplicata ? (
                    <Link href="/dashboard/editor" className={cn(buttonVariants())}>
                      <Palette /> Deschide editorul
                    </Link>
                  ) : (
                    <Button disabled={lucreaza} onClick={() => setDeAplicat(t)}>Aplică tema</Button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {poatePuneLaLoc && (
        <div className="mt-6 rounded-xl border border-border p-4 flex flex-wrap items-center gap-3">
          <p className="flex-1 min-w-[16rem] text-sm text-muted-foreground">
            Designul de dinainte de temă e păstrat în Istoric. Îl pui la loc într-un clic, cu culoarea și fonturile lui.
          </p>
          <Button variant="outline" disabled={lucreaza} onClick={() => setLaLoc(true)}>
            <RotateCcw /> Pune la loc designul de dinainte
          </Button>
        </div>
      )}

      <Dialog open={deAplicat !== null} onOpenChange={(deschis) => { if (!deschis && !lucreaza) setDeAplicat(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aplici tema {deAplicat?.nume}?</DialogTitle>
            <DialogDescription>Tema intră direct în magazin.</DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 text-sm text-foreground list-disc pl-5">
            <li>Magazinul primește designul temei: antetul, subsolul, prima pagină, paginile de categorie și de produs, cardul de produs, culoarea principală și fonturile.</li>
            <li>Produsele, textele, bannerele, setările și domeniul rămân ale tale.</li>
            <li>Designul de acum se păstrează în Istoric. Îl pui la loc oricând, de aici.</li>
            {areCiorna && <li>Modificările nepublicate din editor se păstrează și ele în Istoric, ca ciornă.</li>}
            {estePublic && <li>Magazinul e vizibil, deci clienții văd tema imediat.</li>}
          </ul>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" disabled={lucreaza} onClick={() => setDeAplicat(null)}>Renunță</Button>
            <Button disabled={lucreaza} onClick={() => deAplicat && aplica(deAplicat)}>
              {lucreaza && <Loader2 className="animate-spin" />} Aplică tema
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={laLoc} onOpenChange={(deschis) => { if (!deschis && !lucreaza) setLaLoc(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pui la loc designul de dinainte?</DialogTitle>
            <DialogDescription>
              Magazinul revine la designul, culoarea și fonturile de dinainte de temă. Ce ai publicat după aplicare rămâne în Istoric.
            </DialogDescription>
          </DialogHeader>
          {areCiorna && (
            <p className="text-sm text-foreground">Ai modificări nepublicate în editor. Publică-le sau renunță la ele, apoi revino aici.</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" disabled={lucreaza} onClick={() => setLaLoc(false)}>Renunță</Button>
            <Button disabled={lucreaza || areCiorna} onClick={puneLaLoc}>
              {lucreaza && <Loader2 className="animate-spin" />} Pune la loc
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Demo-ul temei, viu, micsorat cat cardul; doar de privit (fara clicuri, fara tastatura). */
function MiniaturaDemo({ adresa, nume }: { adresa: string; nume: string }) {
  const cutie = useRef<HTMLDivElement>(null);
  const [scara, setScara] = useState(0);
  useEffect(() => {
    const el = cutie.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScara(el.clientWidth / LATIME_DEMO));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={cutie} className="relative aspect-[16/10] overflow-hidden bg-muted border-b border-border">
      {scara > 0 && (
        <iframe src={adresa} title={`Demo-ul temei ${nume}`} loading="lazy" tabIndex={-1} aria-hidden
          className="absolute top-0 left-0 origin-top-left pointer-events-none border-0"
          style={{ width: LATIME_DEMO, height: (LATIME_DEMO * 10) / 16, transform: `scale(${scara})` }} />
      )}
    </div>
  );
}
