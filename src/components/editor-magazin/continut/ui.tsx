"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Switch } from "@/components/ui/switch";

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
