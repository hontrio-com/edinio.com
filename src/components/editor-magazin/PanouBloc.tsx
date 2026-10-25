"use client";

import { ArrowLeft, Eye, EyeOff, Lock } from "lucide-react";
import { PageIcon } from "@/components/pages/icon-registry";
import { comutaBloc, schemaBlocurilor } from "@/lib/storefront/design/blocuri";
import { schimbaBlocurile } from "@/lib/storefront/design/edit";
import { sectionMeta } from "@/lib/storefront/design/registry";
import type { BlockInstance, SectionInstance, StoreDesign } from "@/lib/storefront/design/types";
import { ContinutBloc } from "./continut/ContinutBloc";
import type { CiornaDesign } from "./useCiornaDesign";
import type { ContinutMagazin } from "./useContinutMagazin";

/**
 * Panoul unui bloc (etapa 4): vizibilitatea lui si ce se scrie in el.
 *
 * Ochiul e ciorna, ca la sectiuni (ajunge la clienti la „Publica”); continutul
 * se salveaza din bara lui, direct in magazin. Un bloc fara ochi spune de ce,
 * in locul butonului: altfel omul l-ar fi cautat.
 */
export function PanouBloc({ sectiune, bloc, ciorna, continut, onInapoi }: {
  sectiune: SectionInstance;
  bloc: BlockInstance;
  ciorna: CiornaDesign;
  continut: ContinutMagazin;
  onInapoi: () => void;
}) {
  const schema = schemaBlocurilor(sectiune.kind, sectiune.variant);
  const meta = schema?.tipuri[bloc.type];
  const zona = schema?.zone.find((z) => z.id === meta?.zona);
  const comuta = () => ciorna.aplica(
    (d: StoreDesign) => schimbaBlocurile(d, sectiune.id, (b, s) => comutaBloc(b, s, bloc.id)),
    `ochi-bloc:${sectiune.id}:${bloc.id}`,
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onInapoi} aria-label="Înapoi la secțiuni"
          className="shrink-0 w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <PageIcon name={meta?.icon ?? "Square"} className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-foreground truncate">{meta?.label ?? bloc.type}</h2>
          <p className="text-[11px] text-muted-foreground truncate">
            {sectionMeta(sectiune.kind)?.label}{zona ? ` · ${zona.label}` : ""}{!bloc.enabled ? " · ascuns în magazin" : ""}
          </p>
        </div>
        {!meta?.obligatoriu && (
          <button type="button" onClick={comuta}
            className="shrink-0 h-9 px-3 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors inline-flex items-center gap-1.5">
            {bloc.enabled ? <><EyeOff className="h-3.5 w-3.5" /> Ascunde</> : <><Eye className="h-3.5 w-3.5" /> Arată</>}
          </button>
        )}
      </div>

      {meta?.obligatoriu && (
        <p className="flex items-start gap-2 rounded-lg border border-border px-3 py-2.5 text-xs text-muted-foreground leading-relaxed">
          <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{meta.obligatoriu}</span>
        </p>
      )}

      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Conținut</p>
        <ContinutBloc tip={bloc.type} continut={continut} />
      </div>
    </div>
  );
}
