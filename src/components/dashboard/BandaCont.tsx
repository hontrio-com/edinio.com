import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/*
  ═══════════════════════════════════════════════════════════════════════════
  BANDA DE CONT: o singura forma pentru toate vestile despre abonament
  ═══════════════════════════════════════════════════════════════════════════

  Pana acum, fiecare veste isi avea propria banda, scrisa de mana: proba pe
  sfarsite era un degrade rosu-portocaliu, plata esuata o dunga portocalie plina,
  suspendarea una rosie, iar indemnul de plan o cutie verde. Trei dintre ele
  spuneau aproape acelasi lucru, cu trei texte si trei felurile de a arata.

  ⚠ CULOAREA ARATA CAT DE GRAV E, NU CAT DE TARE STRIGAM.
  Fundalul ramane aproape alb la toate; culoarea sta in patratul pictogramei si
  intr-un contur subtire. Dungile pline de dinainte innegreau capul panoului si,
  fiindca erau toate la fel de tipatoare, nu se mai deosebea „mai ai zece zile"
  de „magazinul e oprit".

  ⚠ TREPTELE SUNT ADEVARATE: informare (neutru) -> atentie (chihlimbar) ->
  urgent (rosu). Aceeasi stare are mereu acelasi ton, in orice ecran.

  ⚠ SE INFASOARA, ca banda de stoc: pe telefon, butonul coboara sub text in loc
  sa-l stranga intr-o coloana de cuvinte.
*/

export type TonBanda = "informare" | "atentie" | "urgent" | "reusita";

const FUNDAL: Record<TonBanda, string> = {
  informare: "bg-muted/50",
  atentie:   "bg-warning/[0.07]",
  urgent:    "bg-destructive/[0.07]",
  reusita:   "bg-primary/[0.06]",
};

const CHENAR: Record<TonBanda, string> = {
  informare: "border-border",
  atentie:   "border-warning/25",
  urgent:    "border-destructive/25",
  reusita:   "border-primary/25",
};

const INEL: Record<TonBanda, string> = {
  informare: "ring-foreground/10",
  atentie:   "ring-warning/25",
  urgent:    "ring-destructive/25",
  reusita:   "ring-primary/25",
};

const PICTOGRAMA: Record<TonBanda, string> = {
  informare: "bg-foreground/5 text-foreground",
  atentie:   "bg-warning/15 text-warning",
  urgent:    "bg-destructive/15 text-destructive",
  reusita:   "bg-primary/15 text-primary",
};

/**
 * Cum arata butonul din banda. Se exporta, ca fiecare banda sa-si pastreze
 * purtarea (una duce la Setari, alta cheama Stripe), dar sa arate la fel.
 *
 * Intunecat la toate, rosu doar cand e urgent: doua feluri, nu cinci.
 */
export function clasaButonBanda(ton: TonBanda): string {
  return cn(
    "inline-flex flex-shrink-0 items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold",
    "transition-colors disabled:cursor-not-allowed disabled:opacity-60 w-full sm:w-auto",
    ton === "urgent"
      ? "bg-destructive text-white hover:bg-destructive/90"
      : "bg-foreground text-background hover:bg-foreground/90",
  );
}

export function BandaCont({
  ton, pictograma: Pictograma, titlu, detaliu, actiune, forma = "banda",
}: {
  ton: TonBanda;
  pictograma: LucideIcon;
  titlu: string;
  detaliu?: React.ReactNode;
  actiune?: React.ReactNode;
  /** `banda` sta peste bara de sus, pe toata latimea; `card` sta in pagina. */
  forma?: "banda" | "card";
}) {
  const continut = (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-3",
        forma === "banda" ? "mx-auto max-w-6xl px-6 py-3" : "px-4 py-3.5",
      )}
    >
      <span className={cn("grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg", PICTOGRAMA[ton])}>
        <Pictograma className="h-[18px] w-[18px]" strokeWidth={1.8} />
      </span>

      {/* `min-w` porneste infasurarea: sub atat, butonul coboara singur. */}
      <div className="min-w-[15rem] flex-1">
        <p className="text-sm font-semibold text-foreground">{titlu}</p>
        {detaliu && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{detaliu}</p>}
      </div>

      {actiune}
    </div>
  );

  if (forma === "card") {
    return (
      <div className={cn("rounded-xl ring-1", FUNDAL[ton], INEL[ton])}>{continut}</div>
    );
  }

  return <div className={cn("border-b", FUNDAL[ton], CHENAR[ton])}>{continut}</div>;
}
