"use client";

import { ArrowLeft, Copy, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import type { Block } from "@/lib/pages/blocks.types";
import { ETICHETA_CONTINUT_LIBER, numeleContinutului } from "@/lib/storefront/design/continut-liber";
import { ListaBlocuri, type TintaBloc } from "./ListaBlocuri";

/**
 * Panoul unui „Conținut liber” (etapa 9 din `docs/editor-magazin/PLAN.md`): blocurile lui, ca la o pagina
 * proprie (`ListaBlocuri`), si „Adaugă bloc”. Pe pagina principala containerul e o sectiune (ochiul,
 * duplicarea si stergerea ei stau si in lista de sectiuni); sub produs si pe Pagina Magazin e un bloc al
 * paginii, deci duplicarea si stergerea stau aici.
 *
 * Totul e ciorna, ca restul editorului: ajunge la clienti la „Publică”.
 */
export function PanouContinutLiber({
  loc, ascuns, blocuri, cheie, blocSelectat, onSelectBloc, onAdauga, onPeste, schimba, onInapoi, onComutaOchi, onDuplica, onSterge,
}: {
  /** Unde sta continutul, in cuvinte („Pagina principală”, „Pagina de produs · Sub produs”). */
  loc: string;
  ascuns: boolean;
  blocuri: Block[];
  /** Calea containerului in previzualizare (`caleInText`): id-ul unui bloc acolo e `idBloc(cheie, bloc)`. */
  cheie: string;
  blocSelectat: string | null;
  onSelectBloc: (id: string) => void;
  onAdauga: (tinta: TintaBloc) => void;
  onPeste: (id: string | null) => void;
  schimba: (fn: (bs: Block[]) => Block[], cheieIstoric: string) => void;
  onInapoi: () => void;
  onComutaOchi: () => void;
  /** Doar pentru continutul care e un bloc al paginii (sub produs, Pagina Magazin). */
  onDuplica?: () => void;
  onSterge?: () => void;
}) {
  return (
    <div className="space-y-4 pb-6">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onInapoi} aria-label="Înapoi la secțiuni"
          className="shrink-0 w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          {/* Dupa blocurile lui, ca in arbore (etapa 13); „Conținut liber” trece in randul mic. */}
          <h2 className="font-semibold text-foreground leading-snug break-words">{numeleContinutului(blocuri)}</h2>
          <p className="text-[11px] text-muted-foreground leading-snug break-words">
            {blocuri.length > 0 ? `${ETICHETA_CONTINUT_LIBER} · ` : ""}{loc}{ascuns ? " · ascuns în magazin" : ""}
          </p>
        </div>
        <button type="button" onClick={onComutaOchi}
          className="shrink-0 h-9 px-3 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors inline-flex items-center gap-1.5">
          {ascuns ? <><Eye className="h-3.5 w-3.5" /> Arată</> : <><EyeOff className="h-3.5 w-3.5" /> Ascunde</>}
        </button>
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Aceleași blocuri ca pe paginile tale. Clienții le văd după „Publică”.
      </p>

      <div onMouseEnter={() => onPeste(cheie)} onMouseLeave={() => onPeste(null)}>
        {blocuri.length === 0 ? (
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">Nu are încă niciun bloc. Adaugă primul ca să apară în magazin.</p>
        ) : (
          <ListaBlocuri blocuri={blocuri} cheie={cheie} blocSelectat={blocSelectat} onSelectBloc={onSelectBloc}
            onAdauga={onAdauga} onPeste={onPeste} schimba={schimba} />
        )}
      </div>

      <button type="button" onClick={() => onAdauga({ fel: "sus", index: blocuri.length })}
        className="w-full h-11 rounded-xl border border-dashed border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors inline-flex items-center justify-center gap-2">
        <Plus className="h-4 w-4" />
        Adaugă bloc
      </button>

      {(onDuplica || onSterge) && (
        <div className="flex gap-2 border-t border-border pt-4">
          {onDuplica && (
            <button type="button" onClick={onDuplica}
              className="flex-1 h-9 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors inline-flex items-center justify-center gap-1.5">
              <Copy className="h-3.5 w-3.5" /> Duplică
            </button>
          )}
          {onSterge && (
            <button type="button" onClick={onSterge}
              className="flex-1 h-9 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors inline-flex items-center justify-center gap-1.5">
              <Trash2 className="h-3.5 w-3.5" /> Șterge
            </button>
          )}
        </div>
      )}
    </div>
  );
}
