"use client";

import { useMemo } from "react";
import {
  Plus, Trash2, ArrowUp, ArrowDown, MousePointerClick, FolderTree, Package,
  LayoutGrid, GalleryHorizontal,
} from "lucide-react";
import { ProductPicker } from "@/components/pages/ProductPicker";
import {
  newProductSection, SECTION_MAX, type ProductSection, type SectionMode,
} from "@/lib/store-sections";
import { cn } from "@/lib/utils/cn";

type Cat = { id: string; name: string; parent_id: string | null; sort_order?: number };

const inputCls = "w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors";

const MODE_OPTIONS: { id: SectionMode; label: string; icon: typeof Package; hint: string }[] = [
  { id: "selected", label: "Manual",    icon: MousePointerClick, hint: "Alegi tu produsele, unul cate unul." },
  { id: "category", label: "Categorie", icon: FolderTree,        hint: "Toate produsele dintr-o categorie." },
  { id: "bundles",  label: "Pachete",   icon: Package,           hint: "Pachetele tale de produse." },
];

/** Flatten the category tree into an ordered list with depth, for an indented dropdown. */
function buildOrdered(categories: Cat[]): { name: string; depth: number }[] {
  const byParent = new Map<string | null, Cat[]>();
  for (const c of categories) {
    const k = c.parent_id ?? null;
    const arr = byParent.get(k) ?? [];
    arr.push(c);
    byParent.set(k, arr);
  }
  for (const arr of byParent.values()) arr.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name));
  const out: { name: string; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const c of byParent.get(parent) ?? []) {
      out.push({ name: c.name, depth });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function ProductSectionsEditor({ businessId, categories, value, onChange }: {
  businessId: string;
  categories: Cat[];
  value: ProductSection[];
  onChange: (next: ProductSection[]) => void;
}) {
  const orderedCats = useMemo(() => buildOrdered(categories), [categories]);

  const update = (id: string, patch: Partial<ProductSection>) =>
    onChange(value.map(s => (s.id === id ? { ...s, ...patch } : s)));
  const remove = (id: string) => onChange(value.filter(s => s.id !== id));
  const move = (id: string, dir: -1 | 1) => {
    const i = value.findIndex(s => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= value.length) return;
    const next = value.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const add = () => onChange([...value, newProductSection("selected")]);

  return (
    <div className="space-y-3">
      {value.length === 0 && (
        <div className="text-center py-6 border border-dashed border-border rounded-xl">
          <p className="text-xs text-muted-foreground">Nicio sectiune inca. Adauga prima sectiune de produse pentru magazin.</p>
        </div>
      )}

      {value.map((section, idx) => {
        const mode = MODE_OPTIONS.find(m => m.id === section.mode)!;
        return (
          <div key={section.id} className="border border-border rounded-xl bg-surface overflow-hidden">
            {/* Header: title + enable + reorder + delete */}
            <div className="flex items-center gap-2 p-3 border-b border-border bg-muted/30">
              <input
                type="text"
                value={section.title}
                placeholder={section.mode === "bundles" ? "Pachete" : "Titlu sectiune"}
                onChange={e => update(section.id, { title: e.target.value })}
                className={cn(inputCls, "!py-1.5 flex-1")}
              />
              <button type="button" title={section.enabled ? "Activata" : "Dezactivata"}
                onClick={() => update(section.id, { enabled: !section.enabled })}
                className={cn("relative w-9 h-5 rounded-full transition-colors flex-shrink-0", section.enabled ? "bg-primary" : "bg-muted-foreground/30")}>
                <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", section.enabled ? "translate-x-4" : "translate-x-0")} />
              </button>
              <div className="flex items-center flex-shrink-0">
                <button type="button" onClick={() => move(section.id, -1)} disabled={idx === 0}
                  className="p-1.5 rounded-md hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="Muta sus">
                  <ArrowUp className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                <button type="button" onClick={() => move(section.id, 1)} disabled={idx === value.length - 1}
                  className="p-1.5 rounded-md hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="Muta jos">
                  <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                <button type="button" onClick={() => remove(section.id)}
                  className="p-1.5 rounded-md hover:bg-red-50 transition-colors" title="Sterge sectiunea">
                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                </button>
              </div>
            </div>

            <div className="p-3 space-y-3">
              {/* Mode selector */}
              <div className="grid grid-cols-3 gap-1.5">
                {MODE_OPTIONS.map(m => {
                  const Icon = m.icon;
                  const active = section.mode === m.id;
                  return (
                    <button key={m.id} type="button"
                      onClick={() => update(section.id, { mode: m.id })}
                      className={cn(
                        "flex flex-col items-center gap-1 py-2 rounded-lg border text-[11px] font-medium transition-all",
                        active ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/40",
                      )}>
                      <Icon className="h-4 w-4" />
                      {m.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground -mt-1">{mode.hint}</p>

              {/* Mode-specific config */}
              {section.mode === "selected" && (
                <ProductPicker
                  businessId={businessId}
                  selectedIds={section.productIds ?? []}
                  onChange={ids => update(section.id, { productIds: ids })}
                />
              )}

              {section.mode === "category" && (
                <div className="space-y-2">
                  {orderedCats.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground p-2 bg-muted/40 rounded-lg">
                      Nu ai categorii inca. Adauga-le din Produse &gt; Categorii.
                    </p>
                  ) : (
                    <>
                      <select
                        value={section.category ?? ""}
                        onChange={e => update(section.id, { category: e.target.value || undefined })}
                        className={cn(inputCls, "!py-1.5")}
                      >
                        <option value="">Alege categoria...</option>
                        {orderedCats.map(c => (
                          <option key={c.name} value={c.name}>{`${"  ".repeat(c.depth)}${c.name}`}</option>
                        ))}
                      </select>
                      <label className="flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer">
                        <input type="checkbox" checked={section.includeSubcategories !== false}
                          onChange={e => update(section.id, { includeSubcategories: e.target.checked })}
                          className="rounded border-border accent-primary" />
                        Include si subcategoriile
                      </label>
                    </>
                  )}
                </div>
              )}

              {section.mode === "bundles" && (
                <p className="text-[11px] text-muted-foreground p-2 bg-muted/40 rounded-lg">
                  Afiseaza automat pachetele tale de produse. Le gestionezi din Produse &gt; Pachete.
                </p>
              )}

              {/* Layout + limit */}
              <div className="flex items-center gap-2 pt-1">
                <div className="flex items-center gap-1 flex-1">
                  <button type="button" onClick={() => update(section.id, { layout: "grid" })}
                    className={cn("flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-all",
                      (section.layout ?? "grid") === "grid" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/40")}>
                    <LayoutGrid className="h-3.5 w-3.5" /> Grila
                  </button>
                  <button type="button" onClick={() => update(section.id, { layout: "carousel" })}
                    className={cn("flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-all",
                      section.layout === "carousel" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/40")}>
                    <GalleryHorizontal className="h-3.5 w-3.5" /> Carusel
                  </button>
                </div>
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  Max
                  <input type="number" min={1} max={SECTION_MAX}
                    value={section.limit ?? 8}
                    onChange={e => update(section.id, { limit: Math.min(Math.max(parseInt(e.target.value) || 1, 1), SECTION_MAX) })}
                    className="w-16 px-2 py-1.5 text-sm border border-border rounded-lg bg-surface text-foreground focus:outline-none focus:border-primary" />
                </label>
              </div>
            </div>
          </div>
        );
      })}

      <button type="button" onClick={add}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-border text-sm font-medium text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-colors">
        <Plus className="h-4 w-4" />
        Adauga sectiune
      </button>
    </div>
  );
}
