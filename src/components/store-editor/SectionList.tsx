"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronUp, Copy, Eye, EyeOff, GripVertical, Trash2 } from "lucide-react";
import { PageIcon } from "@/components/pages/icon-registry";
import { poateFiDuplicata } from "@/lib/storefront/design/edit";
import { sectionMeta, variantMeta } from "@/lib/storefront/design/registry";
import type { SectionInstance } from "@/lib/storefront/design/types";

/**
 * Lista de sectiuni a paginii de magazin.
 *
 * Reordonarea merge prin tragere, dar si prin sagetile de pe fiecare rand: pe
 * telefon tragerea e greu de nimerit, iar la tastatura e imposibila fara ele.
 * Din acelasi motiv randurile au inaltime confortabila si tinte de atingere
 * generoase — editorul trebuie sa fie folosibil si de pe mobil.
 */
export function SectionList({
  sections,
  selectedId,
  onSelect,
  onMove,
  onToggle,
  onDuplicate,
  onRemove,
  primaMutabila,
  ultimaMutabila,
}: {
  sections: SectionInstance[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (from: number, to: number) => void;
  onToggle: (id: string) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  /**
   * Intervalul de randuri care se pot reordona. Bara de anunt, header-ul si
   * footerul au locul lor fix; fara marginile astea, sagetile lor pareau active
   * si nu faceau nimic, iar tragerea lor se pierdea in gol.
   */
  primaMutabila: number;
  ultimaMutabila: number;
}) {
  const sensors = useSensors(
    // Un prag mic de miscare: fara el, orice click pe rand ar porni o tragere.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = sections.findIndex((s) => s.id === active.id);
    const to = sections.findIndex((s) => s.id === over.id);
    const inInterval = (i: number) => i >= primaMutabila && i <= ultimaMutabila;
    if (inInterval(from) && inInterval(to)) onMove(from, to);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        <ul className="space-y-1.5">
          {sections.map((s, i) => (
            <SectionRow
              key={s.id}
              section={s}
              index={i}
              primaMutabila={primaMutabila}
              ultimaMutabila={ultimaMutabila}
              selected={s.id === selectedId}
              onSelect={() => onSelect(s.id)}
              onMove={onMove}
              onToggle={() => onToggle(s.id)}
              onDuplicate={() => onDuplicate(s.id)}
              onRemove={() => onRemove(s.id)}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SectionRow({
  section,
  index,
  primaMutabila,
  ultimaMutabila,
  selected,
  onSelect,
  onMove,
  onToggle,
  onDuplicate,
  onRemove,
}: {
  section: SectionInstance;
  index: number;
  primaMutabila: number;
  ultimaMutabila: number;
  selected: boolean;
  onSelect: () => void;
  onMove: (from: number, to: number) => void;
  onToggle: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const mutabila = index >= primaMutabila && index <= ultimaMutabila;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id, disabled: !mutabila });
  const meta = sectionMeta(section.kind);
  const varianta = variantMeta(section.kind, section.variant);
  /**
   * Header-ul si footerul nu se pot stinge.
   *
   * Footerul poarta blocul legal (datele de identificare ale firmei, retragerea
   * din contract ceruta de OUG 18/2026, cele sase politici, insignele ANPC si
   * Netopia), iar header-ul, navigatia si cosul. Stinse dintr-un click, ar lipsi
   * de pe toate paginile publice deodata, fara ca nimic sa avertizeze.
   */
  const poateFiStinsa = !(meta?.scope === "chrome" && meta.removable === false);

  const actiune =
    "w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-25 disabled:pointer-events-none";

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-xl border bg-surface transition-shadow ${
        selected ? "border-primary ring-1 ring-primary/20" : "border-border"
      } ${isDragging ? "shadow-lg opacity-90" : ""}`}
    >
      <div className="flex items-center gap-1 pl-1 pr-1.5 py-1">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Muta ${meta?.label ?? section.kind}`}
          className="w-8 h-11 shrink-0 flex items-center justify-center text-muted-foreground/60 hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <button type="button" onClick={onSelect} className="flex-1 min-w-0 flex items-center gap-2.5 py-2 text-left">
          <PageIcon name={meta?.icon ?? "Square"} className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="min-w-0">
            <span className={`block text-sm font-medium truncate ${section.enabled ? "text-foreground" : "text-muted-foreground"}`}>
              {meta?.label ?? section.kind}
            </span>
            <span className="block text-[11px] text-muted-foreground truncate">
              {varianta?.label ?? section.variant}
              {!section.enabled && " - ascunsa"}
            </span>
          </span>
        </button>

        <div className="flex items-center shrink-0">
          {/* Alternativa la tragere: functioneaza si la tastatura, si pe mobil. */}
          <div className="hidden sm:flex flex-col">
            <button type="button" onClick={() => onMove(index, index - 1)} disabled={!mutabila || index === primaMutabila}
              aria-label="Muta mai sus" className={`${actiune} h-5 w-7`}>
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => onMove(index, index + 1)} disabled={!mutabila || index === ultimaMutabila}
              aria-label="Muta mai jos" className={`${actiune} h-5 w-7`}>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>

          {poateFiStinsa && (
            <button type="button" onClick={onToggle} className={actiune}
              aria-label={section.enabled ? "Ascunde sectiunea" : "Arata sectiunea"}>
              {section.enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
          )}

          {/* Aceeasi regula dupa care si executa `duplicateSection`, ca butonul
              sa nu existe acolo unde n-ar face nimic. */}
          {poateFiDuplicata(section.kind) && (
            <button type="button" onClick={onDuplicate} className={actiune} aria-label="Duplica sectiunea">
              <Copy className="h-4 w-4" />
            </button>
          )}

          {meta?.removable !== false && (
            <button type="button" onClick={onRemove}
              className={`${actiune} hover:text-destructive`} aria-label="Sterge sectiunea">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
