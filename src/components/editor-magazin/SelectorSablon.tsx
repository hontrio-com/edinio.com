"use client";

import { Plus, Settings2 } from "lucide-react";
import { MAX_SABLOANE } from "@/lib/storefront/design/sabloane-produs";
import type { StoreDesign } from "@/lib/storefront/design/types";

/** „1 categorie”, „3 categorii”, „20 de categorii”. */
function cate(n: number, unu: string, multe: string): string {
  if (n === 1) return `1 ${unu}`;
  const rest = n % 100;
  return rest === 0 || rest >= 20 ? `${n} de ${multe}` : `${n} ${multe}`;
}

/**
 * Sablonul paginii de produs editat acum (etapa 4b din `docs/editor-magazin/PLAN.md`).
 *
 * Arborele si panourile de sub el lucreaza pe sablonul ales aici; Implicit e pagina produselor
 * fara alt sablon. Numele, categoriile si produsele unui sablon se aleg din setarile lui.
 */
export function SelectorSablon({ design, sablon, onSablon, onNou, onSetari }: {
  design: StoreDesign;
  /** Sablonul editat; `null` = Implicit. */
  sablon: string | null;
  onSablon: (id: string | null) => void;
  onNou: () => void;
  onSetari: () => void;
}) {
  const sabloane = design.product.sabloane ?? [];
  const ales = sabloane.find((s) => s.page.id === sablon) ?? null;
  const descriere = !ales
    ? sabloane.length
      ? "Pentru produsele fără alt șablon."
      : "Toate produsele arată la fel. Fă un șablon nou ca o categorie să arate altfel."
    : ales.categorii.length || ales.produse.length
      ? `Folosit de ${[
          ales.categorii.length ? cate(ales.categorii.length, "categorie", "categorii") : null,
          ales.produse.length ? cate(ales.produse.length, "produs", "produse") : null,
        ].filter(Boolean).join(" și ")}. Se vede în magazin după Publică.`
      : "Nefolosit încă: alege-i categoriile din setări.";

  return (
    <div className="mb-2 rounded-xl border border-border bg-muted/30 p-2.5 space-y-2">
      <div className="flex items-center gap-2">
        <label htmlFor="sablon-produs" className="text-xs font-medium text-muted-foreground shrink-0">Șablon</label>
        <select id="sablon-produs" value={ales?.page.id ?? ""} onChange={(e) => onSablon(e.target.value || null)}
          className="h-8 flex-1 min-w-0 pl-2.5 pr-7 rounded-lg border border-border bg-surface text-sm text-foreground focus:outline-none focus:border-primary">
          <option value="">Implicit</option>
          {sabloane.map((s) => <option key={s.page.id} value={s.page.id}>{s.nume}</option>)}
        </select>
        {ales && (
          <button type="button" onClick={onSetari} aria-label="Setările șablonului" title="Numele, categoriile și produsele șablonului"
            className="h-8 w-8 shrink-0 rounded-lg border border-border bg-surface flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
            <Settings2 className="h-4 w-4" />
          </button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground leading-snug">{descriere}</p>
      {sabloane.length < MAX_SABLOANE && (
        <button type="button" onClick={onNou} className="text-xs font-medium text-primary inline-flex items-center gap-1 hover:underline">
          <Plus className="h-3.5 w-3.5" /> Șablon nou
        </button>
      )}
    </div>
  );
}
