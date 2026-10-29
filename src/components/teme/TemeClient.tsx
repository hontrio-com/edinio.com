"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, Loader2, Palette, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { pluralRo } from "@/lib/utils/format";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLucru } from "@/components/dashboard/useLucru";
import { aplicaTema, puneLaLocDesignulDeDinainte, stergeDateleDemo } from "@/lib/actions/store-design.actions";

export interface TemaPeCard {
  cheie: string;
  nume: string;
  descriere: string;
  culoare: string;
  /** „Vezi demo”: subdomeniul temei (etapa 19). */
  adresaDemo: string;
  /** Miniatura vie: pe aceeasi origine cu panoul (cadrul nu se incarca de pe alta). */
  adresaMiniaturii: string;
  /** Datele demo ale temei (etapa 18): cate sunt si daca incap in planul lui. */
  demo: {
    produse: number;
    bannere: number;
    randuri: number;
    /** Limita de produse a planului; `null` = fara limita sau necitita. */
    limita: number | null;
    /** De ce nu incap; `null` = bifa se poate alege. */
    motivOprit: string | null;
  };
}

/** Latimea la care se randeaza demo-ul in miniatura: un ecran de calculator, micsorat cat cardul. */
const LATIME_DEMO = 1440;

/**
 * Pagina „Teme” (etapa 17 din `docs/editor-magazin/PLAN.md`). „Aplică tema” pune tema direct in magazin, cu designul
 * de acum pastrat in Istoric, iar din etapa 18, la cerere, si cu datele demo ale temei; „Pune la loc designul de
 * dinainte” il readuce; „Șterge datele demo” scoate ce a adaugat importul. Toate intreaba intai, cu ce se intampla.
 */
export function TemeClient({ businessId, teme, aplicata, aplicataLa, poatePuneLaLoc, dateDemo, areCiorna, public: estePublic }: {
  businessId: string;
  teme: TemaPeCard[];
  aplicata: { cheie: string } | null;
  /** Data aplicarii, scrisa pe server (fusul orar al Romaniei). */
  aplicataLa: string | null;
  poatePuneLaLoc: boolean;
  /** Datele demo din magazin acum (etapa 18.4); `null` = niciunele. */
  dateDemo: { produse: number } | null;
  areCiorna: boolean;
  public: boolean;
}) {
  const router = useRouter();
  const [deAplicat, setDeAplicat] = useState<TemaPeCard | null>(null);
  // Bifa „Importă și datele demo”: oprita la fiecare deschidere a ferestrei (raspunsul lui: „in caz ca vrea”).
  const [cuDate, setCuDate] = useState(false);
  const [laLoc, setLaLoc] = useState(false);
  const [deSters, setDeSters] = useState(false);
  const [lucreaza, porneste] = useLucru();

  const deschideAplicarea = (t: TemaPeCard) => {
    setCuDate(false);
    setDeAplicat(t);
  };

  const aplica = (t: TemaPeCard) => porneste(async () => {
    const r = await aplicaTema(businessId, t.cheie, cuDate && t.demo.motivOprit === null);
    if ("error" in r) {
      toast.error(r.error);
      return;
    }
    setDeAplicat(null);
    toast.success(cuDate
      ? `Tema ${t.nume} e în magazin, cu datele demo. O reglezi în editor, ca orice design.`
      : `Tema ${t.nume} e în magazin. O reglezi în editor, ca orice design.`);
    router.refresh();
  });

  const stergeDemo = () => porneste(async () => {
    const r = await stergeDateleDemo(businessId);
    if ("error" in r) {
      toast.error(r.error);
      return;
    }
    setDeSters(false);
    toast.success("Datele demo s-au șters din magazin.");
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
              <MiniaturaDemo adresa={t.adresaMiniaturii} nume={t.nume} />
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
                    <Button disabled={lucreaza} onClick={() => deschideAplicarea(t)}>Aplică tema</Button>
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

      {dateDemo && (
        <div className="mt-6 rounded-xl border border-border p-4 flex flex-wrap items-center gap-3">
          <p className="flex-1 min-w-[16rem] text-sm text-muted-foreground">
            În magazin sunt datele demo ale temei: {pluralRo(dateDemo.produse, "produs demo", "produse demo")}, cu categoriile,
            bannerele și rândurile lor. Le ștergi într-un clic, când nu mai ai nevoie de ele.
          </p>
          <Button variant="outline" disabled={lucreaza} onClick={() => setDeSters(true)}>
            <Trash2 /> Șterge datele demo
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
          {deAplicat && (
            <div className="rounded-lg border border-border p-3 space-y-2">
              <label className={cn("flex items-start gap-2 text-sm font-medium text-foreground", deAplicat.demo.motivOprit ? "opacity-60" : "cursor-pointer")}>
                <input
                  type="checkbox"
                  checked={cuDate && deAplicat.demo.motivOprit === null}
                  onChange={(e) => setCuDate(e.target.checked)}
                  disabled={lucreaza || deAplicat.demo.motivOprit !== null}
                  className="mt-0.5 h-4 w-4 rounded border-border"
                />
                Importă și datele demo
              </label>
              {deAplicat.demo.motivOprit ? (
                <p className="text-xs text-muted-foreground">{deAplicat.demo.motivOprit} Aplici tema fără ele și vezi cum arată în demo.</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Ca magazinul să arate ca în demo: {pluralRo(deAplicat.demo.produse, "produs", "produse")} cu categoriile lor,{" "}
                  {pluralRo(deAplicat.demo.bannere, "banner", "bannere")}, {pluralRo(deAplicat.demo.randuri, "rând", "rânduri")} pe prima pagină
                  și textele de exemplu ale temei.
                </p>
              )}
              {cuDate && deAplicat.demo.motivOprit === null && (
                <ul className="space-y-1.5 text-xs text-foreground list-disc pl-5">
                  <li>Se adaugă lângă ale tale, marcate demo; nu se șterge și nu se suprascrie nimic din ce ai.</li>
                  <li>Produsele demo nu pleacă în Google, Meta, marketplace-uri sau newsletter și nu apar în căutările Google.</li>
                  {deAplicat.demo.limita !== null && (
                    <li>Intră în limita planului tău ({pluralRo(deAplicat.demo.produse)} din {deAplicat.demo.limita.toLocaleString("ro-RO")}) până le ștergi.</li>
                  )}
                  {estePublic && <li>Magazinul e vizibil: clienții văd produsele demo și le pot comanda până le ștergi.</li>}
                  <li>Le ștergi oricând de aici, cu „Șterge datele demo”.</li>
                </ul>
              )}
            </div>
          )}
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
          {dateDemo && (
            <p className="text-sm text-foreground">
              Bannerele și rândurile demo pleacă odată cu designul, dar produsele și categoriile demo rămân în magazin până le ștergi cu „Șterge datele demo”.
            </p>
          )}
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

      <Dialog open={deSters} onOpenChange={(deschis) => { if (!deschis && !lucreaza) setDeSters(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ștergi datele demo?</DialogTitle>
            <DialogDescription>Iese din magazin doar ce a adăugat importul. Ce ai adăugat sau ai schimbat tu rămâne.</DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 text-sm text-foreground list-disc pl-5">
            {dateDemo && dateDemo.produse > 0 && <li>{pluralRo(dateDemo.produse, "produs demo", "produse demo")}, definitiv.</li>}
            <li>Categoriile create de import, dacă n-au rămas în ele produse de-ale tale.</li>
            <li>Bannerele și rândurile de produse adăugate pe prima pagină.</li>
            <li>Textele de exemplu ale temei pe care nu le-ai schimbat: cardurile de lângă banner, plăcile de recomandare, mesajul din bara de sus.</li>
            <li>Designul de acum se păstrează în Istoric.</li>
          </ul>
          {areCiorna && (
            <p className="text-sm text-foreground">Ai modificări nepublicate în editor. Publică-le sau renunță la ele, apoi revino aici.</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" disabled={lucreaza} onClick={() => setDeSters(false)}>Renunță</Button>
            <Button variant="destructive" disabled={lucreaza || areCiorna} onClick={stergeDemo}>
              {lucreaza && <Loader2 className="animate-spin" />} Șterge datele demo
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
