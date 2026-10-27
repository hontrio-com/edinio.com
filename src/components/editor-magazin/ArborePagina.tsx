"use client";

import { ChevronRight, Plus, Settings2 } from "lucide-react";
import { ETICHETA_CONTINUT_LIBER } from "@/components/pages/PaginaVie";
import type { Block } from "@/lib/pages/blocks.types";
import type { StarePagina } from "@/lib/editor-magazin/pagina-proprie";
import type { CheiePaginaProprie } from "@/lib/editor-magazin/pagini";
import { ListaBlocuri, type TintaBloc } from "./ListaBlocuri";
import type { PaginaDeschisa } from "./usePaginaProprie";

export type { TintaBloc };

/**
 * Arborele unei pagini proprii (etapa 5 din `docs/editor-magazin/PLAN.md`), intre antet si subsol:
 * setarile paginii, apoi „Conținut liber” cu blocurile ei (`ListaBlocuri`, aceeasi lista ca la
 * „Conținut liber” din magazin, etapa 9); trecerea cu mouse-ul incadreaza blocul in previzualizare.
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

  const blocuri = pagina.stare.blocks;
  const schimba = (fn: (bs: Block[]) => Block[], ch: string) => pagina.aplica((s: StarePagina) => ({ ...s, blocks: fn(s.blocks) }), ch);

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
          <ListaBlocuri blocuri={blocuri} cheie={cheie} blocSelectat={blocSelectat} onSelectBloc={onSelectBloc}
            onAdauga={onAdauga} onPeste={onPeste} schimba={schimba} />
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
