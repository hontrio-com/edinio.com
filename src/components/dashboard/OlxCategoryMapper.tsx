"use client";

import { useEffect, useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Loader2, Search, ChevronRight, Check, X, FolderTree, Sparkles, Pencil } from "lucide-react";
import {
  getOlxCategoryChildren, suggestOlxCategory, getOlxCategoryAttributes, saveOlxCategoryMapEntry,
} from "@/lib/actions/olx.actions";
import type { OlxAttributeDef, OlxCategory, OlxCategoryMapEntry, OlxCategorySuggestion } from "@/lib/olx/types";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/lib/ui";

export function OlxCategoryMapper({ businessId, categories, initialMap }: {
  businessId: string; categories: string[]; initialMap: Record<string, OlxCategoryMapEntry>;
}) {
  const [map, setMap] = useState<Record<string, OlxCategoryMapEntry>>(initialMap);
  const [editing, setEditing] = useState<string | null>(null);

  if (categories.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground">Mapare categorii</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">Adaugă categorii produselor tale ca să le poți mapa la categoriile OLX.</p>
      </div>
    );
  }

  const mapped = categories.filter((c) => map[c]).length;

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Mapare categorii</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Asociază fiecare categorie a ta cu o categorie OLX și completează atributele cerute ({mapped}/{categories.length} mapate).
          Produsele din categoriile nemapate nu se publică.
        </p>
      </div>
      <div className="max-h-96 space-y-2 overflow-y-auto">
        {categories.map((cat) => {
          const entry = map[cat];
          return (
            <div key={cat} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5">
              <span className="w-1/3 min-w-0 truncate text-sm font-medium text-foreground" title={cat}>{cat}</span>
              <div className="min-w-0 flex-1">
                {entry ? (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Check className="h-3.5 w-3.5 shrink-0 text-success" />
                    <span className="truncate" title={entry.label}>{entry.label}</span>
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Nemapată</span>
                )}
              </div>
              <Button variant={entry ? "outline" : "default"} size="sm" onClick={() => setEditing(cat)}>
                <Pencil className="h-3.5 w-3.5" /> {entry ? "Editează" : "Mapează"}
              </Button>
            </div>
          );
        })}
      </div>

      {editing && (
        <CategoryModal
          businessId={businessId}
          edinioCategory={editing}
          initial={map[editing] ?? null}
          onClose={() => setEditing(null)}
          onSaved={(entry) => {
            setMap((m) => {
              const next = { ...m };
              if (entry) next[editing] = entry; else delete next[editing];
              return next;
            });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

interface Crumb { id: number; name: string }

function CategoryModal({ businessId, edinioCategory, initial, onClose, onSaved }: {
  businessId: string;
  edinioCategory: string;
  initial: OlxCategoryMapEntry | null;
  onClose: () => void;
  onSaved: (entry: OlxCategoryMapEntry | null) => void;
}) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Two-phase: pick a leaf category, then fill its attributes.
  const [leaf, setLeaf] = useState<{ id: number; label: string; photos_limit?: number } | null>(
    initial ? { id: initial.category_id, label: initial.label, photos_limit: initial.photos_limit } : null,
  );
  const [attributes, setAttributes] = useState<OlxAttributeDef[] | null>(null);
  const [attrValues, setAttrValues] = useState<Record<string, string | string[]>>(initial?.attributes ?? {});
  const [saving, startSave] = useTransition();
  // Derived: while a leaf is chosen but its attribute defs haven't loaded yet.
  const loadingAttrs = leaf !== null && attributes === null;

  // Switch (or clear) the chosen OLX category, resetting the attribute state.
  function chooseLeaf(next: { id: number; label: string; photos_limit?: number } | null) {
    setLeaf(next);
    setAttributes(null);
    setAttrValues(next && initial && next.id === initial.category_id ? (initial.attributes ?? {}) : {});
  }

  useEffect(() => {
    if (!leaf) return;
    let cancelled = false;
    getOlxCategoryAttributes(businessId, leaf.id).then((r) => {
      if (cancelled) return;
      setAttributes("error" in r ? [] : r.attributes);
      if ("error" in r) toast.error(r.error);
    });
    return () => { cancelled = true; };
  }, [businessId, leaf]);

  function save() {
    if (!leaf) return;
    // Validate required attributes are filled.
    const missing = (attributes ?? []).filter((a) => a.validation?.required && a.validation?.type === "attribute")
      .filter((a) => {
        const v = attrValues[a.code];
        return Array.isArray(v) ? v.length === 0 : !String(v ?? "").trim();
      });
    if (missing.length > 0) {
      toast.error(`Completează atributele obligatorii: ${missing.map((m) => m.label).join(", ")}`);
      return;
    }
    // Keep only attribute-type values (price/salary are derived from the product).
    const clean: Record<string, string | string[]> = {};
    for (const a of attributes ?? []) {
      if (a.validation?.type && a.validation.type !== "attribute") continue;
      const v = attrValues[a.code];
      if (Array.isArray(v) ? v.length > 0 : String(v ?? "").trim()) clean[a.code] = v;
    }
    const entry: OlxCategoryMapEntry = { category_id: leaf.id, label: leaf.label, photos_limit: leaf.photos_limit, attributes: clean };
    startSave(async () => {
      const res = await saveOlxCategoryMapEntry(businessId, edinioCategory, entry);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Mapare salvată.");
      router.refresh();
      onSaved(entry);
    });
  }

  function removeMapping() {
    startSave(async () => {
      const res = await saveOlxCategoryMapEntry(businessId, edinioCategory, null);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Mapare ștearsă.");
      router.refresh();
      onSaved(null);
    });
  }

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-foreground">Mapează „{edinioCategory}”</h3>
            <p className="text-xs text-muted-foreground">Alege categoria OLX și completează atributele.</p>
          </div>
          <button onClick={onClose} aria-label="Închide" className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {!leaf ? (
            <CategoryPicker businessId={businessId} defaultQuery={edinioCategory} onPick={(id, label, photos_limit) => chooseLeaf({ id, label, photos_limit })} />
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">Categorie OLX aleasă</p>
                  <p className="truncate text-sm font-semibold text-foreground" title={leaf.label}>{leaf.label}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => chooseLeaf(null)}>Schimbă</Button>
              </div>

              {loadingAttrs ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : (
                <AttributeFields attributes={attributes ?? []} values={attrValues} onChange={setAttrValues} />
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-4">
          {initial ? (
            <Button variant="destructive" size="sm" onClick={removeMapping} disabled={saving}>Șterge maparea</Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Anulează</Button>
            <Button onClick={save} disabled={saving || !leaf}>
              {saving ? <><Loader2 className="animate-spin" /> Se salvează...</> : "Salvează maparea"}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function CategoryPicker({ businessId, defaultQuery, onPick }: {
  businessId: string; defaultQuery: string; onPick: (id: number, label: string, photosLimit?: number) => void;
}) {
  const [mode, setMode] = useState<"suggest" | "browse">("suggest");
  const [query, setQuery] = useState(defaultQuery);
  const [suggestions, setSuggestions] = useState<OlxCategorySuggestion[] | null>(null);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Browse state
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [children, setChildren] = useState<OlxCategory[] | null>(null);
  const [loadingChildren, setLoadingChildren] = useState(false);

  function runSuggest(q: string) {
    setQuery(q);
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 3) { setSuggestions(null); return; }
    setSearching(true);
    timer.current = setTimeout(async () => {
      const res = await suggestOlxCategory(businessId, q);
      setSuggestions("error" in res ? [] : res.suggestions);
      setSearching(false);
    }, 350);
  }

  // Auto-run the first suggestion using the Edinio category name (deferred out of
  // the effect body so it doesn't trip the sync-setState-in-effect rule).
  useEffect(() => {
    const id = requestAnimationFrame(() => runSuggest(defaultQuery));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadChildren(parentId: number | undefined, newCrumbs: Crumb[]) {
    setLoadingChildren(true);
    setCrumbs(newCrumbs);
    const res = await getOlxCategoryChildren(businessId, parentId);
    setChildren("error" in res ? [] : res.categories);
    setLoadingChildren(false);
  }

  useEffect(() => {
    if (mode !== "browse" || children !== null) return;
    const id = requestAnimationFrame(() => loadChildren(undefined, []));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  function pickBrowse(cat: OlxCategory) {
    const path = [...crumbs, { id: cat.id, name: cat.name }];
    if (cat.is_leaf) {
      onPick(cat.id, path.map((c) => c.name).join(" > "), cat.photos_limit);
    } else {
      loadChildren(cat.id, path);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        <button onClick={() => setMode("suggest")} className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors", mode === "suggest" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}>
          <Sparkles className="h-3.5 w-3.5" /> Sugestii
        </button>
        <button onClick={() => setMode("browse")} className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors", mode === "browse" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}>
          <FolderTree className="h-3.5 w-3.5" /> Răsfoiește
        </button>
      </div>

      {mode === "suggest" ? (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" value={query} onChange={(e) => runSuggest(e.target.value)} placeholder="Ex: telefon, rochie, bicicletă..." />
            {searching && <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
          </div>
          <div className="space-y-1.5">
            {suggestions === null ? (
              <p className="py-4 text-center text-xs text-muted-foreground">Scrie cel puțin 3 litere pentru sugestii.</p>
            ) : suggestions.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">Nicio sugestie. Încearcă „Răsfoiește”.</p>
            ) : suggestions.map((s) => {
              const label = [...(s.path ?? []).map((p) => p.name), s.name].join(" > ");
              return (
                <button key={s.id} onClick={() => onPick(s.id, label)}
                  className="flex w-full items-center justify-between gap-2 rounded-xl border border-border px-3 py-2.5 text-left transition-colors hover:border-primary hover:bg-primary/5">
                  <span className="min-w-0"><span className="block truncate text-sm text-foreground">{s.name}</span><span className="block truncate text-xs text-muted-foreground">{label}</span></span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <button onClick={() => loadChildren(undefined, [])} className="hover:text-foreground">Toate</button>
            {crumbs.map((c, i) => (
              <span key={c.id} className="flex items-center gap-1">
                <ChevronRight className="h-3 w-3" />
                <button onClick={() => loadChildren(c.id, crumbs.slice(0, i + 1))} className="hover:text-foreground">{c.name}</button>
              </span>
            ))}
          </div>
          {loadingChildren ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="max-h-64 space-y-1.5 overflow-y-auto">
              {(children ?? []).map((cat) => (
                <button key={cat.id} onClick={() => pickBrowse(cat)}
                  className="flex w-full items-center justify-between gap-2 rounded-xl border border-border px-3 py-2.5 text-left transition-colors hover:border-primary hover:bg-primary/5">
                  <span className="truncate text-sm text-foreground">{cat.name}</span>
                  {cat.is_leaf ? <Check className="h-4 w-4 shrink-0 text-success" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AttributeFields({ attributes, values, onChange }: {
  attributes: OlxAttributeDef[];
  values: Record<string, string | string[]>;
  onChange: (v: Record<string, string | string[]>) => void;
}) {
  // Only user-provided attributes; price/salary come from the product itself.
  const editable = attributes.filter((a) => !a.validation?.type || a.validation.type === "attribute");
  if (editable.length === 0) {
    return <p className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">Această categorie nu cere atribute suplimentare.</p>;
  }

  function set(code: string, v: string | string[]) { onChange({ ...values, [code]: v }); }

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-foreground">Atribute categorie</p>
      {editable.map((a) => {
        const required = a.validation?.required === true;
        const multiple = a.validation?.allow_multiple_values === true;
        const hasValues = Array.isArray(a.values) && a.values.length > 0;
        const current = values[a.code];
        return (
          <div key={a.code}>
            <label className="mb-1 block text-xs font-medium text-foreground">
              {a.label}{a.unit ? ` (${a.unit})` : ""}{required && <span className="text-destructive"> *</span>}
            </label>
            {hasValues && !multiple ? (
              <select aria-label={a.label} value={(current as string) ?? ""} onChange={(e) => set(a.code, e.target.value)} className={selectCls}>
                <option value="">— alege —</option>
                {a.values!.map((v) => <option key={v.code} value={v.code}>{v.label}</option>)}
              </select>
            ) : hasValues && multiple ? (
              <div className="flex flex-wrap gap-1.5">
                {a.values!.map((v) => {
                  const arr = Array.isArray(current) ? current : [];
                  const on = arr.includes(v.code);
                  return (
                    <button key={v.code} type="button"
                      onClick={() => set(a.code, on ? arr.filter((x) => x !== v.code) : [...arr, v.code])}
                      className={cn("rounded-full border px-2.5 py-1 text-xs transition-colors", on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50")}>
                      {v.label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <Input
                value={(current as string) ?? ""}
                onChange={(e) => set(a.code, e.target.value)}
                inputMode={a.validation?.numeric ? "numeric" : undefined}
                placeholder={a.validation?.numeric ? "număr" : ""}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
