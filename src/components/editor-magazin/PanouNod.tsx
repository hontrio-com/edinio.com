"use client";

import { ArrowLeft, Eye, EyeOff, LayoutGrid, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SectionSettings } from "@/components/store-editor/SectionSettings";
import { comutaBaraDeAnunt, removeSection, toggleSection, updateSection } from "@/lib/storefront/design/edit";
import { sectionMeta, variantMeta } from "@/lib/storefront/design/registry";
import type { SectionInstance, StoreDesign } from "@/lib/storefront/design/types";
import { ContinutNod } from "./continut/ContinutNod";
import type { CiornaDesign } from "./useCiornaDesign";
import type { ContinutMagazin } from "./useContinutMagazin";

type Cat = { id: string; name: string; parent_id: string | null; sort_order?: number };

/**
 * Cate design-uri are sectiunea de ales. Sub doua, galeria n-are ce arata.
 *
 * Doar sectiunile din catalog: randul de produse are si el doua variante, dar
 * ele oglindesc asezarea din continutul randului, iar o galerie care nu schimba
 * nimic ar fi un buton mort.
 */
export function numarVariante(s: SectionInstance): number {
  const meta = sectionMeta(s.kind);
  return meta?.inCatalog ? Object.keys(meta.variants).length : 0;
}

/** Ce s-a schimbat intre doua seturi de setari: cheia pentru lipirea din istoric. */
function campulSchimbat(inainte: Record<string, unknown>, dupa: Record<string, unknown>): string {
  const chei = new Set([...Object.keys(inainte), ...Object.keys(dupa)]);
  return [...chei].find((k) => JSON.stringify(inainte[k]) !== JSON.stringify(dupa[k])) ?? "";
}

/**
 * Setarile unui nod din arbore, in acelasi panou: designul, setarile sectiunii,
 * continutul ei.
 *
 * Toate trei sunt ciorna din etapa 6, inclusiv continutul: ajung la clienti la „Publică”.
 * Ordinea pe ecran urmeaza ordinea in
 * care isi pune omul intrebarile: cum arata, ce reglaje are, ce scrie in ea.
 */
export function PanouNod({ sectiune, ciorna, continut, onInapoi, onSchimbaDesignul, businessId, categorii, planGratuit, laStil, onRandSters }: {
  sectiune: SectionInstance;
  ciorna: CiornaDesign;
  continut: ContinutMagazin;
  onInapoi: () => void;
  onSchimbaDesignul: (id: string) => void;
  businessId: string;
  categorii: Cat[];
  planGratuit: boolean;
  laStil: () => void;
  onRandSters: () => void;
}) {
  const meta = sectionMeta(sectiune.kind);
  const varianta = variantMeta(sectiune.kind, sectiune.variant);
  const variante = numarVariante(sectiune);
  /*
   * Ochiul are sens pentru sectiunile paginii si pentru bara de anunt. Antetul si
   * subsolul nu se pot stinge (datele firmei si politicile stau in subsol), iar
   * paginile, cosul si comanda nu sunt sectiuni de ascuns.
   */
  const areOchi = sectiune.kind === "announcement" || meta?.scope === "home";
  const comuta = () => ciorna.aplica(
    (d: StoreDesign) => (sectiune.kind === "announcement" ? comutaBaraDeAnunt(d) : toggleSection(d, sectiune.id)),
    `ochi:${sectiune.id}`,
  );
  /*
   * „Șterge” langa „Ascunde” (etapa 13, cerut de el). Aceeasi regula ca in arbore: doar sectiunile
   * paginii principale care se pot scoate. Merge prin ciorna, deci „Anulează” din bara de sus o aduce
   * inapoi, de aceea nu intreaba inainte.
   */
  const poateFiStearsa = meta?.scope === "home" && meta.removable !== false;
  const sterge = () => {
    ciorna.aplica((d: StoreDesign) => removeSection(d, sectiune.id));
    onInapoi();
    toast.success("Secțiunea a fost ștearsă. O aduci înapoi cu „Anulează”, din bara de sus.");
  };

  return (
    <div className="space-y-5">
      {/*
        ⚠ Actiunile pe randul lor, sub titlu (gasit la proba 13): langa „Ascunde”, „Șterge” lasa titlului
        ~70 px in coloana editorului, iar „Banner principal” iesea „Banner p...”.
      */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onInapoi} aria-label="Înapoi la secțiuni"
            className="shrink-0 w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-foreground truncate">{meta?.label ?? sectiune.kind}</h2>
            {!sectiune.enabled && areOchi && <p className="text-[11px] text-muted-foreground">Ascunsă în magazin</p>}
          </div>
        </div>
        {(areOchi || poateFiStearsa) && (
          <div className="flex gap-2">
            {areOchi && (
              <button type="button" onClick={comuta}
                className="flex-1 h-9 px-3 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors inline-flex items-center justify-center gap-1.5">
                {sectiune.enabled ? <><EyeOff className="h-3.5 w-3.5" /> Ascunde</> : <><Eye className="h-3.5 w-3.5" /> Arată</>}
              </button>
            )}
            {poateFiStearsa && (
              <button type="button" onClick={sterge}
                className="flex-1 h-9 px-3 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-destructive hover:border-destructive/40 hover:bg-destructive/5 transition-colors inline-flex items-center justify-center gap-1.5">
                <Trash2 className="h-3.5 w-3.5" /> Șterge
              </button>
            )}
          </div>
        )}
      </div>

      {variante > 1 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Design</p>
          <div className="flex items-center gap-2 rounded-xl border border-border p-3">
            <p className="flex-1 min-w-0 text-sm font-medium text-foreground truncate">{varianta?.label ?? sectiune.variant}</p>
            <button type="button" onClick={() => onSchimbaDesignul(sectiune.id)}
              className="shrink-0 h-9 px-3 rounded-lg border border-border text-xs font-semibold text-foreground hover:bg-muted transition-colors inline-flex items-center gap-1.5">
              <LayoutGrid className="h-3.5 w-3.5 text-muted-foreground" />
              Schimbă designul ({variante})
            </button>
          </div>
        </div>
      )}

      {((varianta?.fields.length ?? 0) > 0 || varianta?.note) && (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Setări</p>
          <SectionSettings
            section={sectiune}
            cuTitlu={false}
            onChange={(settings) => ciorna.aplica(
              (d: StoreDesign) => updateSection(d, sectiune.id, { settings }),
              `setari:${sectiune.id}:${campulSchimbat(sectiune.settings, settings)}`,
            )}
          />
        </div>
      )}

      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Conținut</p>
        <ContinutNod sectiune={sectiune} continut={continut} businessId={businessId} categorii={categorii}
          planGratuit={planGratuit} laStil={laStil} onRandSters={onRandSters} />
      </div>
    </div>
  );
}
