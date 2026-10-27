"use client";

import { ChevronDown, ChevronRight, ChevronUp, Copy, Plus, Settings2, Trash2 } from "lucide-react";
import { ETICHETA_CONTINUT_LIBER } from "@/components/pages/PaginaVie";
import { asezareColoane } from "@/components/pages/blocks/StaticBlocks";
import { BLOCK_META, type Block } from "@/lib/pages/blocks.types";
import { columnBlocks, duplicateBlockInTree, isFlexibleColumns, moveBlockInTree, removeBlockFromTree } from "@/lib/pages/block-tree";
import { rezumatBloc, type StarePagina } from "@/lib/editor-magazin/pagina-proprie";
import { idBloc } from "@/lib/storefront/design/preview-protocol";
import type { CheiePaginaProprie } from "@/lib/editor-magazin/pagini";
import type { PaginaDeschisa } from "./usePaginaProprie";

/** Unde se adauga urmatorul bloc: in pagina, sau intr-o coloana a unui bloc de coloane; `dupa` = sub ce bloc. */
export type TintaBloc =
  | { fel: "sus"; index: number; dupa?: string }
  | { fel: "coloana"; idColoane: string; coloana: number; index: number; dupa?: string };

const actiune = "w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-25 disabled:pointer-events-none";

/**
 * Arborele unei pagini proprii (etapa 5 din `docs/editor-magazin/PLAN.md`), intre antet si subsol:
 * setarile paginii, apoi „Conținut liber” cu blocurile ei, iar sub un bloc de coloane, blocurile din
 * fiecare coloana. „+” adauga un bloc chiar sub el, sagetile muta, „⧉” duplica, cosul sterge, clicul
 * deschide setarile blocului; trecerea cu mouse-ul incadreaza blocul in previzualizare. Operatiile sunt cele din editorul de pagini de pana
 * acum (`block-tree.ts`), deci pagina iese la fel.
 */
export function ArborePagina({ cheie, pagina, blocSelectat, setariDeschise, onSelectBloc, onSetari, onAdauga, onPeste }: {
  cheie: CheiePaginaProprie;
  pagina: PaginaDeschisa;
  blocSelectat: string | null;
  setariDeschise: boolean;
  onSelectBloc: (id: string) => void;
  onSetari: () => void;
  onAdauga: (tinta: TintaBloc) => void;
  onPeste: (id: string | null) => void;
}) {
  if (pagina.lipseste) {
    return <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">Pagina nu mai există. Alege alta din „Editezi”.</p>;
  }
  if (!pagina.stare) {
    return (
      <div className="space-y-1.5" aria-busy="true">
        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />)}
      </div>
    );
  }

  const stare = pagina.stare;
  const blocuri = stare.blocks;
  const schimba = (fn: (bs: Block[]) => Block[], ch: string) => pagina.aplica((s: StarePagina) => ({ ...s, blocks: fn(s.blocks) }), ch);

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

  return (
    <div className="space-y-1.5">
      <button type="button" onClick={onSetari}
        className={`w-full rounded-xl border bg-surface flex items-center gap-2.5 pl-3 pr-2 py-2.5 text-left ${setariDeschise ? "border-primary ring-1 ring-primary/20" : "border-border"}`}>
        <Settings2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">Setările paginii</span>
          <span className="block text-[11px] text-muted-foreground truncate">Titlu, adresă, publicare, SEO</span>
        </span>
        <ChevronRight className="h-4 w-4 text-muted-foreground/60 shrink-0" />
      </button>

      <div onMouseEnter={() => onPeste(cheie)} onMouseLeave={() => onPeste(null)}>
        <p className="px-1 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{ETICHETA_CONTINUT_LIBER}</p>
        {blocuri.length === 0 ? (
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">Pagina e goală. Adaugă primul bloc ca să începi.</p>
        ) : (
          <ul className="space-y-1">{blocuri.map((b, i) => rand(b, i, blocuri, (index, dupa) => ({ fel: "sus", index, dupa })))}</ul>
        )}
      </div>

      <button type="button" onClick={() => onAdauga({ fel: "sus", index: blocuri.length })}
        className="mt-2 w-full h-11 rounded-xl border border-dashed border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors inline-flex items-center justify-center gap-2">
        <Plus className="h-4 w-4" />
        Adaugă bloc
      </button>
    </div>
  );
}

