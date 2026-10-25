"use client";

import Link from "next/link";
import { ArrowUpRight, ChevronRight, Eye, EyeOff, Plus } from "lucide-react";
import { PageIcon } from "@/components/pages/icon-registry";
import { Callout } from "@/components/ui/callout";
import { SectionList } from "@/components/store-editor/SectionList";
import { comutaBaraDeAnunt, duplicateSection, ID_BARA_ANUNT, moveSection, removeSection, toggleSection } from "@/lib/storefront/design/edit";
import { sectionMeta, variantMeta } from "@/lib/storefront/design/registry";
import { felContinut, type FelContinut } from "@/lib/editor-magazin/noduri";
import { notaPaginii, PAGINI_EDITOR, sectiunilePaginii, type CheiePagina, type MagazinPentruPagini } from "@/lib/editor-magazin/pagini";
import type { SectionInstance, StoreDesign } from "@/lib/storefront/design/types";
import type { CiornaDesign } from "./useCiornaDesign";

/**
 * Arborele paginii alese: ce e sus pe toate paginile, sectiunile paginii, ce e
 * jos pe toate paginile.
 *
 * Pe pagina principala, sectiunile se trag si se muta cu sagetile, se ascund cu
 * ochiul, se duplica si se sterg (`SectionList`, mutat din editorul de design).
 * Clic pe un rand deschide setarile lui in acelasi panou.
 */

/** Randul unei sectiuni fixe (bara de anunt, antet, subsol, pagina de produs...). */
function RandFix({ sectiune, eticheta, selectat, nesalvat, onSelect, ochi }: {
  sectiune: SectionInstance | null;
  eticheta: string;
  selectat: boolean;
  nesalvat: boolean;
  onSelect: () => void;
  ochi?: { pornit: boolean; onComuta: () => void };
}) {
  const meta = sectiune ? sectionMeta(sectiune.kind) : undefined;
  const varianta = sectiune ? variantMeta(sectiune.kind, sectiune.variant) : undefined;
  const aprinsa = sectiune?.enabled ?? false;
  return (
    <li className={`rounded-xl border bg-surface ${selectat ? "border-primary ring-1 ring-primary/20" : "border-border"}`}>
      <div className="flex items-center gap-1 pl-3 pr-1.5 py-1">
        <button type="button" onClick={onSelect} className="flex-1 min-w-0 flex items-center gap-2.5 py-2 text-left">
          <PageIcon name={meta?.icon ?? "Square"} className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="min-w-0">
            <span className={`flex items-center gap-1.5 text-sm font-medium ${aprinsa || !ochi ? "text-foreground" : "text-muted-foreground"}`}>
              <span className="truncate">{eticheta}</span>
              {nesalvat && <PunctNesalvat />}
            </span>
            <span className="block text-[11px] text-muted-foreground truncate">
              {sectiune ? (varianta?.label ?? sectiune.variant) : "Nu apare în magazin"}
              {ochi && sectiune && !aprinsa && " - ascunsă"}
            </span>
          </span>
        </button>
        {ochi && (
          <button type="button" onClick={ochi.onComuta} aria-label={ochi.pornit ? `Ascunde ${eticheta.toLowerCase()}` : `Arată ${eticheta.toLowerCase()}`}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            {ochi.pornit ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
        )}
        <ChevronRight className="h-4 w-4 text-muted-foreground/60 shrink-0" />
      </div>
    </li>
  );
}

/** Semnul de langa un nod cu continut nesalvat. */
export function PunctNesalvat() {
  return <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-500" title="Conținut nesalvat" aria-label="Conținut nesalvat" />;
}

function Titlu({ children }: { children: React.ReactNode }) {
  return <p className="px-1 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</p>;
}

export function ArboreSectiuni({ ciorna, pagina, magazin, selectat, onSelect, nesalvat, onAdauga, paginaAcasa }: {
  ciorna: CiornaDesign;
  pagina: CheiePagina;
  magazin: MagazinPentruPagini;
  selectat: string | null;
  onSelect: (id: string) => void;
  /** Are nodul continut nesalvat? */
  nesalvat: (fel: FelContinut | null) => boolean;
  onAdauga: () => void;
  /** Pagina din „Pagini” aleasa ca pagina principala, daca exista. */
  paginaAcasa: { id: string; titlu: string; publicata: boolean } | null;
}) {
  const { design, aplica } = ciorna;
  const sectiuni = sectiunilePaginii(design, pagina, magazin);
  const eListaPaginii = pagina === "acasa" && !magazin.unSingurProdus;
  const nota = notaPaginii(pagina, design, magazin);
  const numePagina = PAGINI_EDITOR.find((p) => p.cheie === pagina)?.eticheta ?? "";
  const bara = design.chrome.announcement;
  const marcaj = (s: SectionInstance) => (nesalvat(felContinut(s)) ? <PunctNesalvat /> : null);

  return (
    <div className="space-y-1">
      {nota && (
        <p className="mb-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground leading-relaxed">{nota}</p>
      )}

      <Titlu>Sus, pe toate paginile</Titlu>
      <ul className="space-y-1.5">
        <RandFix sectiune={bara} eticheta="Bara de anunț" selectat={selectat === (bara?.id ?? ID_BARA_ANUNT)}
          nesalvat={nesalvat("anunt")} onSelect={() => onSelect(bara?.id ?? ID_BARA_ANUNT)}
          ochi={{ pornit: bara?.enabled === true, onComuta: () => aplica((d: StoreDesign) => comutaBaraDeAnunt(d), "ochi:anunt") }} />
        <RandFix sectiune={design.chrome.header} eticheta="Antet" selectat={selectat === design.chrome.header.id}
          nesalvat={nesalvat("header")} onSelect={() => onSelect(design.chrome.header.id)} />
      </ul>

      <Titlu>{numePagina}</Titlu>
      {eListaPaginii && paginaAcasa && (
        <Callout variant="warning" className="mb-2 text-xs">
          <p>
            Pagina principală este pagina „{paginaAcasa.titlu}”, făcută în Pagini. Ce secțiuni apar și în ce ordine alegi acolo;
            aici schimbi cum arată fiecare.
          </p>
          <Link href={`/dashboard/pages/${paginaAcasa.id}`} className="mt-1.5 inline-flex items-center gap-1 font-medium text-primary hover:underline">
            Deschide pagina <ArrowUpRight className="h-3 w-3" />
          </Link>
        </Callout>
      )}
      {eListaPaginii ? (
        <>
          <SectionList
            sections={design.home}
            selectedId={selectat}
            onSelect={onSelect}
            onMove={(from, to) => aplica((d: StoreDesign) => moveSection(d, from, to), "ordine")}
            onToggle={(id) => aplica((d: StoreDesign) => toggleSection(d, id), `ochi:${id}`)}
            onDuplicate={(id) => aplica((d: StoreDesign) => duplicateSection(d, id))}
            onRemove={(id) => aplica((d: StoreDesign) => removeSection(d, id))}
            primaMutabila={0}
            ultimaMutabila={design.home.length - 1}
            marcaj={marcaj}
          />
          <button type="button" onClick={onAdauga}
            className="mt-2 w-full h-11 rounded-xl border border-dashed border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors inline-flex items-center justify-center gap-2">
            <Plus className="h-4 w-4" />
            Adaugă secțiune
          </button>
        </>
      ) : (
        <ul className="space-y-1.5">
          {sectiuni.map((s) => (
            <RandFix key={s.id} sectiune={s} eticheta={sectionMeta(s.kind)?.label ?? s.kind} selectat={selectat === s.id}
              nesalvat={nesalvat(felContinut(s))} onSelect={() => onSelect(s.id)} />
          ))}
        </ul>
      )}

      <Titlu>Jos, pe toate paginile</Titlu>
      <ul className="space-y-1.5">
        <RandFix sectiune={design.chrome.footer} eticheta="Subsol" selectat={selectat === design.chrome.footer.id}
          nesalvat={nesalvat("footer")} onSelect={() => onSelect(design.chrome.footer.id)} />
      </ul>
    </div>
  );
}
