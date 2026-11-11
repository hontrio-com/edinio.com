"use client";

import { ArrowLeft, Eye, EyeOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SectionSettings } from "@/components/store-editor/SectionSettings";
import { comutaBaraDeAnunt, removeSection, toggleSection, updateSection } from "@/lib/storefront/design/edit";
import { sectionMeta, variantMeta } from "@/lib/storefront/design/registry";
import { areFonturiProprii, fontulSectiunii, type CheieFontSectiune } from "@/lib/storefront/design/fonturi-sectiune";
import type { CheieFont } from "@/lib/pages/fonturi";
import { AlegeFont } from "@/components/pages/editor/campuri";
import { toateClaseleDeFont } from "@/components/pages/fonturi-incarcate";
import { cn } from "@/lib/utils/cn";
import type { SectionInstance, StoreDesign } from "@/lib/storefront/design/types";
import { ContinutNod } from "./continut/ContinutNod";
import { CasetaTipComanda } from "./CasetaTipComanda";
import { RandDesign } from "./RandDesign";
import { tipulVariantei, varianteDeAles } from "@/lib/storefront/design/tip-comanda";
import type { CiornaDesign } from "./useCiornaDesign";
import type { ContinutMagazin } from "./useContinutMagazin";

type Cat = { id: string; name: string; parent_id: string | null; sort_order?: number };

/**
 * Cate design-uri are sectiunea de ales. Sub doua, galeria n-are ce arata.
 *
 * Doar sectiunile din catalog: randul de produse are si el doua variante, dar
 * ele oglindesc asezarea din continutul randului, iar o galerie care nu schimba
 * nimic ar fi un buton mort. La finalizarea comenzii, doar cele de acelasi tip
 * (`varianteDeAles`, etapa 15): tipul se alege in Setări > Comanda.
 */
export function numarVariante(s: SectionInstance): number {
  const meta = sectionMeta(s.kind);
  return meta?.inCatalog ? varianteDeAles(s).length : 0;
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
  /** Fontul ales pe sectiune: „Ca în Stil” (`null`) scoate cheia, nu scrie un gol. */
  const scrieFont = (cheie: CheieFontSectiune, v: CheieFont | null) => {
    const settings: Record<string, unknown> = { ...sectiune.settings };
    if (v) settings[cheie] = v;
    else delete settings[cheie];
    ciorna.aplica((d: StoreDesign) => updateSection(d, sectiune.id, { settings }), `font:${sectiune.id}:${cheie}`);
  };
  const sterge = () => {
    ciorna.aplica((d: StoreDesign) => removeSection(d, sectiune.id));
    onInapoi();
    // Etapa 25.8: si aici butonul „Anulează” chiar in mesaj, ca la clic dreapta si in arbore.
    toast.success("Secțiunea a fost ștearsă.", { action: { label: "Anulează", onClick: () => ciorna.anuleaza() }, duration: 8000 });
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

      {/* Tipul de checkout (etapa 15): se vede aici, se alege in Setări > Comanda. Sectiunea e cea din designul viu. */}
      {sectiune.kind === "checkout" && <CasetaTipComanda tip={tipulVariantei(sectiune.variant)} />}

      <RandDesign sectiune={sectiune} numar={variante} onSchimba={() => onSchimbaDesignul(sectiune.id)} />

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

      {/*
        Fontul sectiunii (etapa 14, cerut de el): titluri si text, din fonturile paginilor, implicit „Ca în Stil”. Prin ciorna,
        ca restul designului. `toateClaseleDeFont`: fiecare nume din lista se arata in fontul lui.
      */}
      {areFonturiProprii(sectiune.kind) && (
        <div className={cn("space-y-3", toateClaseleDeFont())}>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Fonturi</p>
          <AlegeFont label="Fontul titlurilor" gol="Ca în Stil" value={fontulSectiunii(sectiune.settings, "fontTitluri")}
            onChange={(v) => scrieFont("fontTitluri", v)} />
          <AlegeFont label="Fontul textului" gol="Ca în Stil" value={fontulSectiunii(sectiune.settings, "fontText")}
            onChange={(v) => scrieFont("fontText", v)} />
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
