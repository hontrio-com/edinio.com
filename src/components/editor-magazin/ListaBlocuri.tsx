"use client";

import { ChevronDown, ChevronUp, Copy, Plus, Trash2 } from "lucide-react";
import { asezareColoane } from "@/components/pages/blocks/StaticBlocks";
import { BLOCK_META, type Block } from "@/lib/pages/blocks.types";
import { columnBlocks, duplicateBlockInTree, isFlexibleColumns, moveBlockInTree, removeBlockFromTree } from "@/lib/pages/block-tree";
import type { TintaBloc } from "@/lib/editor-magazin/adaugare";
import { rezumatBloc } from "@/lib/editor-magazin/pagina-proprie";
import { idBloc } from "@/lib/storefront/design/preview-protocol";

/** Unde se adauga urmatorul bloc; tipul sta langa „+”-ul din previzualizare (etapa 10), care face aceleasi tinte. */
export type { TintaBloc };

const actiune = "w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-25 disabled:pointer-events-none";

/**
 * Blocurile unei pagini proprii (etapa 5) sau ale unui „Conținut liber” din magazin (etapa 9), cu
 * aceleasi butoane: „+” adauga un bloc chiar sub el, sagetile muta, „⧉” duplica, cosul sterge, clicul
 * deschide setarile; sub un bloc de coloane, blocurile fiecarei coloane. Operatiile sunt cele din
 * `block-tree.ts`, deci lista iese la fel oriunde sta.
 */
export function ListaBlocuri({ blocuri, cheie, blocSelectat, onSelectBloc, onAdauga, onPeste, schimba }: {
  blocuri: Block[];
  /** Sectiunea blocurilor in previzualizare: id-ul unui bloc acolo e `idBloc(cheie, bloc)`. */
  cheie: string;
  blocSelectat: string | null;
  onSelectBloc: (id: string) => void;
  onAdauga: (tinta: TintaBloc) => void;
  onPeste: (id: string | null) => void;
  /** Aplica o operatie din `block-tree.ts`; `cheieIstoric` grupeaza pasii la Anuleaza. */
  schimba: (fn: (bs: Block[]) => Block[], cheieIstoric: string) => void;
}) {
  /** Un rand de bloc; `sub(index, eticheta)` = tinta unui bloc nou pus pe pozitia `index`, in acelasi loc. */
  const rand = (b: Block, i: number, frati: Block[], sub: (index: number, dupa: string) => TintaBloc) => {
    const eticheta = BLOCK_META[b.type]?.label ?? b.type;
    const rezumat = rezumatBloc(b);
    const id = idBloc(cheie, b.id);
    return (
      <li key={b.id}>
        <div onMouseEnter={() => onPeste(id)} onMouseLeave={() => onPeste(null)}
          className={`rounded-lg border bg-surface ${blocSelectat === b.id ? "border-primary ring-1 ring-primary/20" : "border-border"}`}>
          <div className="flex items-center gap-0.5 pl-2 pr-1">
            <button type="button" onClick={() => onSelectBloc(b.id)} className="flex-1 min-w-0 flex items-center py-2 text-left">
              <span className="min-w-0">
                <span className="block text-xs font-medium text-foreground truncate">{eticheta}</span>
                {rezumat && <span className="block text-[11px] text-muted-foreground truncate">{rezumat}</span>}
              </span>
            </button>
            <button type="button" aria-label={`Adaugă un bloc sub: ${eticheta}`} title="Adaugă un bloc dedesubt" className={actiune}
              onClick={() => onAdauga(sub(i + 1, rezumat ? `${eticheta}: ${rezumat}` : eticheta))}>
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button type="button" disabled={i === 0} aria-label={`Mută mai sus: ${eticheta}`} className={actiune}
              onClick={() => schimba((bs) => moveBlockInTree(bs, b.id, -1), "ordine-pagina")}>
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button type="button" disabled={i === frati.length - 1} aria-label={`Mută mai jos: ${eticheta}`} className={actiune}
              onClick={() => schimba((bs) => moveBlockInTree(bs, b.id, 1), "ordine-pagina")}>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <button type="button" aria-label={`Duplică: ${eticheta}`} className={actiune}
              onClick={() => schimba((bs) => duplicateBlockInTree(bs, b.id), `duplica:${b.id}`)}>
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button type="button" aria-label={`Șterge: ${eticheta}`} className={`${actiune} hover:text-destructive`}
              onClick={() => schimba((bs) => removeBlockFromTree(bs, b.id), `sterge:${b.id}`)}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {b.type === "columns" && isFlexibleColumns(b) && (
          <div className="ml-4 mt-1 mb-1 pl-3 border-l border-border space-y-2">
            {Array.from({ length: asezareColoane(b).count }).map((_, ci) => {
              const dinColoana = columnBlocks(b, ci);
              return (
                <div key={ci}>
                  <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Coloana {ci + 1}</p>
                  {dinColoana.length > 0 && (
                    <ul className="space-y-1">
                      {dinColoana.map((nb, ni) => rand(nb, ni, dinColoana, (index, dupa) => ({ fel: "coloana", idColoane: b.id, coloana: ci, index, dupa })))}
                    </ul>
                  )}
                  <button type="button" onClick={() => onAdauga({ fel: "coloana", idColoane: b.id, coloana: ci, index: dinColoana.length })}
                    className="mt-1 w-full h-8 rounded-lg border border-dashed border-border text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors inline-flex items-center justify-center gap-1.5">
                    <Plus className="h-3 w-3" /> Adaugă în coloană
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </li>
    );
  };

  return <ul className="space-y-1">{blocuri.map((b, i) => rand(b, i, blocuri, (index, dupa) => ({ fel: "sus", index, dupa })))}</ul>;
}
