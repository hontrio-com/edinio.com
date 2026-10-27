"use client";

import { Fragment } from "react";
import { ChevronDown, ChevronRight, ChevronUp, Eye, EyeOff, Lock, Plus } from "lucide-react";
import { Callout } from "@/components/ui/callout";
import { SectionList } from "@/components/store-editor/SectionList";
import { comutaBloc, mutaBloc, schemaBlocurilor } from "@/lib/storefront/design/blocuri";
import { comutaBaraDeAnunt, duplicateSection, ID_BARA_ANUNT, moveSection, removeSection, schimbaBlocurile, toggleSection } from "@/lib/storefront/design/edit";
import { idBloc } from "@/lib/storefront/design/preview-protocol";
import { sectionMeta, variantMeta } from "@/lib/storefront/design/registry";
import { felBloc, felContinut, type FelContinut } from "@/lib/editor-magazin/noduri";
import { notaPaginii, PAGINI_EDITOR, sectiunilePaginii, type CheiePagina, type MagazinPentruPagini } from "@/lib/editor-magazin/pagini";
import type { SectionInstance, StoreDesign } from "@/lib/storefront/design/types";
import type { CiornaDesign } from "./useCiornaDesign";
import { SelectorSablon } from "./SelectorSablon";

/**
 * Arborele paginii alese: ce e sus pe toate paginile, sectiunile paginii, ce e
 * jos pe toate paginile.
 *
 * Pe pagina principala, sectiunile se trag si se muta cu sagetile, se ascund cu
 * ochiul, se duplica si se sterg (`SectionList`, mutat din editorul de design).
 * Clic pe un rand deschide setarile lui in acelasi panou.
 */

/**
 * Blocurile unei sectiuni, sub randul ei, pe zone (etapa 4): sagetile le muta in
 * zona lor, ochiul le ascunde pe cele optionale, lacatul spune de ce restul nu se
 * ascund, iar clicul deschide panoul blocului. Fara tragere: blocurile sunt mici,
 * iar sagetile merg si pe telefon, si de la tastatura.
 */
function ArboreBlocuri({ sectiune, aplica, blocSelectat, onSelectBloc, onPeste, nesalvat }: {
  sectiune: SectionInstance;
  aplica: CiornaDesign["aplica"];
  blocSelectat: string | null;
  onSelectBloc: (idSectiune: string, idBlocului: string) => void;
  onPeste: (id: string | null) => void;
  nesalvat: (fel: FelContinut | null) => boolean;
}) {
  const schema = schemaBlocurilor(sectiune.kind, sectiune.variant);
  const blocuri = sectiune.blocks;
  if (!schema || !blocuri) return null;
  const schimba = (operatia: Parameters<typeof schimbaBlocurile>[2], cheie: string) =>
    aplica((d: StoreDesign) => schimbaBlocurile(d, sectiune.id, operatia), cheie);
  const actiune = "w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-25 disabled:pointer-events-none";

  return (
    <div className="ml-4 mt-1 mb-1 pl-3 border-l border-border space-y-2.5">
      {schema.zone.map((zona) => {
        const aleZonei = blocuri.filter((b) => schema.tipuri[b.type]?.zona === zona.id);
        if (aleZonei.length === 0) return null;
        return (
          <div key={zona.id}>
            <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{zona.label}</p>
            <ul className="space-y-1">
              {aleZonei.map((b, i) => {
                const meta = schema.tipuri[b.type];
                const id = idBloc(sectiune.id, b.id);
                return (
                  <li key={b.id} onMouseEnter={() => onPeste(id)} onMouseLeave={() => onPeste(null)}
                    className={`rounded-lg border bg-surface ${blocSelectat === b.id ? "border-primary ring-1 ring-primary/20" : "border-border"}`}>
                    <div className="flex items-center gap-0.5 pl-2 pr-1">
                      <button type="button" onClick={() => onSelectBloc(sectiune.id, b.id)} className="flex-1 min-w-0 flex items-center gap-2 py-2 text-left">
                        <span className={`text-xs font-medium truncate ${b.enabled ? "text-foreground" : "text-muted-foreground"}`}>{meta.label}</span>
                        {!b.enabled && <span className="shrink-0 text-[10px] text-muted-foreground">ascuns</span>}
                        {nesalvat(felBloc(b.type)) && <PunctNesalvat />}
                      </button>
                      <button type="button" disabled={i === 0} aria-label={`Mută mai sus: ${meta.label}`} className={actiune}
                        onClick={() => schimba((l, s) => mutaBloc(l, s, b.id, -1), "ordine-blocuri")}>
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" disabled={i === aleZonei.length - 1} aria-label={`Mută mai jos: ${meta.label}`} className={actiune}
                        onClick={() => schimba((l, s) => mutaBloc(l, s, b.id, 1), "ordine-blocuri")}>
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                      {meta.obligatoriu ? (
                        <span title={meta.obligatoriu} className="w-7 h-7 flex items-center justify-center text-muted-foreground/60">
                          <Lock className="h-3 w-3" aria-hidden="true" />
                          <span className="sr-only">{meta.obligatoriu}</span>
                        </span>
                      ) : (
                        <button type="button" aria-label={b.enabled ? `Ascunde: ${meta.label}` : `Arată: ${meta.label}`} className={actiune}
                          onClick={() => schimba((l, s) => comutaBloc(l, s, b.id), `ochi-bloc:${sectiune.id}:${b.id}`)}>
                          {b.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/** Randul unei sectiuni fixe (bara de anunt, antet, subsol, pagina de produs...). */
function RandFix({ sectiune, eticheta, selectat, nesalvat, onSelect, ochi, onPeste }: {
  sectiune: SectionInstance | null;
  eticheta: string;
  selectat: boolean;
  nesalvat: boolean;
  onSelect: () => void;
  ochi?: { pornit: boolean; onComuta: () => void };
  onPeste: (id: string | null) => void;
}) {
  const varianta = sectiune ? variantMeta(sectiune.kind, sectiune.variant) : undefined;
  const aprinsa = sectiune?.enabled ?? false;
  return (
    <li onMouseEnter={() => onPeste(sectiune?.id ?? null)} onMouseLeave={() => onPeste(null)}
      className={`rounded-xl border bg-surface ${selectat ? "border-primary ring-1 ring-primary/20" : "border-border"}`}>
      <div className="flex items-center gap-1 pl-3 pr-1.5 py-1">
        <button type="button" onClick={onSelect} className="flex-1 min-w-0 flex items-center py-2 text-left">
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

/**
 * Semnul de langa un nod cu continut schimbat in ciorna, inca nepublicat (etapa 6); in fila „Setări”
 * (etapa 8), langa o setare scrisa si inca nesalvata.
 */
export function PunctNesalvat({ titlu = "Modificat, nepublicat" }: { titlu?: string }) {
  return <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-500" title={titlu} aria-label={titlu} />;
}

function Titlu({ children }: { children: React.ReactNode }) {
  return <p className="px-1 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</p>;
}

export function ArboreSectiuni({
  ciorna, pagina, magazin, selectat, onSelect, blocSelectat, onSelectBloc, onPeste, nesalvat, onAdauga, paginaAcasa,
  sablon, onSablon, onSablonNou, onSetariSablon, continutPagina, titluPagina, onDeschidePagina,
}: {
  ciorna: CiornaDesign;
  pagina: CheiePagina;
  magazin: MagazinPentruPagini;
  selectat: string | null;
  onSelect: (id: string) => void;
  /** Blocul deschis in panou, din sectiunea `selectat`. */
  blocSelectat: string | null;
  onSelectBloc: (idSectiune: string, idBlocului: string) => void;
  /** Mouse-ul pe un rand (id) sau iesit (`null`): conturul din previzualizare. */
  onPeste: (id: string | null) => void;
  /** Are nodul continut schimbat in ciorna, inca nepublicat? */
  nesalvat: (fel: FelContinut | null) => boolean;
  onAdauga: () => void;
  /** Pagina din „Pagini” aleasa ca pagina principala, daca exista. */
  paginaAcasa: { id: string; titlu: string; publicata: boolean } | null;
  /** Sablonul paginii de produs editat (etapa 4b); `null` = Implicit. */
  sablon: string | null;
  onSablon: (id: string | null) => void;
  onSablonNou: () => void;
  onSetariSablon: () => void;
  /** Pagina proprie (etapa 5): arborele ei ia locul sectiunilor, sub titlul ei. */
  continutPagina?: React.ReactNode;
  titluPagina?: string;
  /** Deschide in editor pagina proprie aleasa ca pagina principala. */
  onDeschidePagina: (id: string) => void;
}) {
  const { design, aplica } = ciorna;
  const sectiuni = sectiunilePaginii(design, pagina, magazin, sablon);
  const eListaPaginii = pagina === "acasa" && !magazin.unSingurProdus;
  const nota = notaPaginii(pagina, design, magazin);
  const numePagina = titluPagina ?? PAGINI_EDITOR.find((p) => p.cheie === pagina)?.eticheta ?? "";
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
          nesalvat={nesalvat("anunt")} onSelect={() => onSelect(bara?.id ?? ID_BARA_ANUNT)} onPeste={onPeste}
          ochi={{ pornit: bara?.enabled === true, onComuta: () => aplica((d: StoreDesign) => comutaBaraDeAnunt(d), "ochi:anunt") }} />
        <RandFix sectiune={design.chrome.header} eticheta="Antet" selectat={selectat === design.chrome.header.id}
          nesalvat={nesalvat("header")} onSelect={() => onSelect(design.chrome.header.id)} onPeste={onPeste} />
      </ul>

      <Titlu>{numePagina}</Titlu>
      {pagina === "produs" && !magazin.unSingurProdus && (
        <SelectorSablon design={design} sablon={sablon} onSablon={onSablon} onNou={onSablonNou} onSetari={onSetariSablon} />
      )}
      {eListaPaginii && paginaAcasa && (
        <Callout variant="warning" className="mb-2 text-xs">
          <p>
            Pagina principală este pagina „{paginaAcasa.titlu}”, făcută în Pagini. Ce secțiuni apar și în ce ordine alegi acolo;
            aici schimbi cum arată fiecare.
          </p>
          <button type="button" onClick={() => onDeschidePagina(paginaAcasa.id)} className="mt-1.5 inline-flex items-center gap-1 font-medium text-primary hover:underline">
            Deschide pagina <ChevronRight className="h-3 w-3" />
          </button>
        </Callout>
      )}
      {continutPagina ?? (eListaPaginii ? (
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
            onPeste={onPeste}
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
            <Fragment key={s.id}>
              <RandFix sectiune={s} eticheta={sectionMeta(s.kind)?.label ?? s.kind} selectat={selectat === s.id && !blocSelectat}
                nesalvat={nesalvat(felContinut(s))} onSelect={() => onSelect(s.id)} onPeste={onPeste} />
              {s.blocks && (
                <li>
                  <ArboreBlocuri sectiune={s} aplica={aplica} blocSelectat={selectat === s.id ? blocSelectat : null}
                    onSelectBloc={onSelectBloc} onPeste={onPeste} nesalvat={nesalvat} />
                </li>
              )}
            </Fragment>
          ))}
        </ul>
      ))}

      <Titlu>Jos, pe toate paginile</Titlu>
      <ul className="space-y-1.5">
        <RandFix sectiune={design.chrome.footer} eticheta="Subsol" selectat={selectat === design.chrome.footer.id}
          nesalvat={nesalvat("footer")} onSelect={() => onSelect(design.chrome.footer.id)} onPeste={onPeste} />
      </ul>
    </div>
  );
}
