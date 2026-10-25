"use client";

import Link from "next/link";
import { ArrowUpRight, Check, Loader2, Save } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { ContinutMagazin, NodContinut } from "../useContinutMagazin";

/**
 * Piesele comune ale panourilor de continut din editorul unic.
 *
 * Textele sunt ale PANOULUI, deci cu diacritice.
 */

export const inputCls =
  "w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors";
export const inputMicCls = `${inputCls} !py-1.5 !text-xs`;

/** Un comutator cu titlu si explicatie, pe un rand. */
export function RandComutator({ titlu, ajutor, pornit, onSchimba, dezactivat, children }: {
  titlu: string;
  ajutor?: string;
  pornit: boolean;
  onSchimba: (v: boolean) => void;
  dezactivat?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground">{titlu}</p>
          {ajutor && <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{ajutor}</p>}
        </div>
        <Switch checked={pornit} onCheckedChange={onSchimba} aria-label={titlu} disabled={dezactivat}
          className="shrink-0 mt-0.5" />
      </div>
      {pornit && children}
    </div>
  );
}

/** Un grup de campuri cu titlu, in panoul nodului. */
export function Grup({ titlu, children }: { titlu?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      {titlu && <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{titlu}</p>}
      {children}
    </div>
  );
}

/**
 * O explicatie cu trimitere catre locul unde se schimba lucrul.
 *
 * Pentru sectiunile al caror continut nu se editeaza aici (datele de contact,
 * categoriile, pragul de livrare): fara ea, comerciantul vede sectiunea goala si
 * nu stie de unde se umple.
 */
export function Nota({ children, href, eticheta }: { children: React.ReactNode; href?: string; eticheta?: string }) {
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground leading-relaxed space-y-1.5">
      <p>{children}</p>
      {href && eticheta && (
        <Link href={href} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
          {eticheta}
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

/**
 * Butonul de salvare al continutului unui nod.
 *
 * ⚠ Spune RASPICAT ca salvarea ajunge imediat in magazin. Designul din acelasi
 * ecran asteapta „Publica”; continutul nu. Doua feluri de salvare pe un ecran
 * sunt in regula doar daca fiecare isi spune felul (vezi `PLAN.md`, decizia 1).
 */
export function BaraSalvare({ continut, nod }: { continut: ContinutMagazin; nod: NodContinut }) {
  const nesalvat = continut.areNesalvate(nod);
  const seSalveaza = continut.seSalveaza === nod;
  const salvat = continut.salvatAcum === nod;
  return (
    <div className="sticky bottom-0 -mx-4 px-4 py-3 border-t border-border bg-surface/95 backdrop-blur flex items-center gap-3">
      <p className="flex-1 min-w-0 text-[11px] leading-snug text-muted-foreground">
        {nesalvat ? "Modificări nesalvate. Se aplică în magazin imediat ce salvezi." : "Conținutul se aplică în magazin imediat ce îl salvezi."}
      </p>
      <button type="button" onClick={() => void continut.salveaza(nod)} disabled={!nesalvat || seSalveaza}
        className="shrink-0 h-9 px-3.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold inline-flex items-center gap-1.5 hover:opacity-90 transition-opacity disabled:opacity-50">
        {seSalveaza ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : salvat ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
        {seSalveaza ? "Se salvează..." : salvat ? "Salvat" : "Salvează"}
      </button>
    </div>
  );
}
