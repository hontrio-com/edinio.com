"use client";

import { LayoutGrid } from "lucide-react";
import { variantMeta } from "@/lib/storefront/design/registry";
import type { SectionInstance } from "@/lib/storefront/design/types";

/**
 * Randul „Design” al unei sectiuni: designul de acum si „Schimbă designul (n)”, care deschide galeria. Il folosesc
 * panoul sectiunii si fila „Stil”, la „Cardul de produs” (etapa 16.6: cardul n-are rand in arbore). Sub doua
 * design-uri nu apare: galeria n-ar avea ce arata.
 */
export function RandDesign({ sectiune, numar, onSchimba }: {
  sectiune: SectionInstance;
  /** Cate design-uri are de ales (`numarVariante`). */
  numar: number;
  onSchimba: () => void;
}) {
  if (numar < 2) return null;
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Design</p>
      <div className="flex items-center gap-2 rounded-xl border border-border p-3">
        <p className="flex-1 min-w-0 text-sm font-medium text-foreground truncate">
          {variantMeta(sectiune.kind, sectiune.variant)?.label ?? sectiune.variant}
        </p>
        <button type="button" onClick={onSchimba}
          className="shrink-0 h-9 px-3 rounded-lg border border-border text-xs font-semibold text-foreground hover:bg-muted transition-colors inline-flex items-center gap-1.5">
          <LayoutGrid className="h-3.5 w-3.5 text-muted-foreground" />
          Schimbă designul ({numar})
        </button>
      </div>
    </div>
  );
}
