"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, Check, X, ChevronRight, FolderOpen, Folder, GripVertical, Tag,
} from "lucide-react";
import { createCategory, updateCategory, deleteCategory } from "@/lib/actions/category.actions";

interface Category {
  id: string;
  business_id: string;
  parent_id: string | null;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface Props {
  initialCategories: Category[];
}

function EditableLabel({
  value,
  onSave,
  onCancel,
  autoFocus = true,
}: {
  value: string;
  onSave: (val: string) => void;
  onCancel: () => void;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); if (text.trim()) onSave(text.trim()); }
    if (e.key === "Escape") onCancel();
  }

  return (
    <div className="flex items-center gap-1.5 flex-1">
      <input
        ref={ref}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKey}
        className="flex-1 px-2 py-1 text-sm border border-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 bg-surface text-foreground"
        placeholder="Nume categorie..."
      />
      <button
        type="button"
        onClick={() => { if (text.trim()) onSave(text.trim()); }}
        disabled={!text.trim()}
        className="w-7 h-7 rounded-lg bg-primary text-white flex items-center justify-center hover:bg-primary/90 disabled:opacity-40 transition-colors flex-shrink-0"
      >
        <Check className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="w-7 h-7 rounded-lg border border-border text-muted-foreground flex items-center justify-center hover:bg-muted transition-colors flex-shrink-0"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function CategoriesClient({ initialCategories }: Props) {
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [isPending, startTransition] = useTransition();

  // Which item is being edited (id) or "new-root" / "new-sub-{parentId}"
  const [editing, setEditing] = useState<string | null>(null);
  // Which parent is expanded (showing subcategories + add sub button)
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Confirm delete
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const roots = categories.filter(c => !c.parent_id).sort((a, b) => a.sort_order - b.sort_order);

  function getChildren(parentId: string) {
    return categories.filter(c => c.parent_id === parentId).sort((a, b) => a.sort_order - b.sort_order);
  }

  function toggleExpanded(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // ── Create root category
  function handleCreateRoot(name: string) {
    startTransition(async () => {
      const sort_order = roots.length;
      const result = await createCategory({ name, sort_order });
      if ("error" in result) { toast.error(result.error); return; }
      setCategories(prev => [...prev, {
        id: result.id, business_id: "", parent_id: null,
        name, sort_order, created_at: "", updated_at: "",
      }]);
      setEditing(null);
      toast.success("Categorie adaugata.");
    });
  }

  // ── Create subcategory
  function handleCreateSub(parentId: string, name: string) {
    startTransition(async () => {
      const sort_order = getChildren(parentId).length;
      const result = await createCategory({ name, parent_id: parentId, sort_order });
      if ("error" in result) { toast.error(result.error); return; }
      setCategories(prev => [...prev, {
        id: result.id, business_id: "", parent_id: parentId,
        name, sort_order, created_at: "", updated_at: "",
      }]);
      setEditing(null);
      toast.success("Subcategorie adaugata.");
    });
  }

  // ── Rename
  function handleRename(id: string, name: string) {
    startTransition(async () => {
      const result = await updateCategory(id, { name });
      if ("error" in result) { toast.error(result.error); return; }
      setCategories(prev => prev.map(c => c.id === id ? { ...c, name } : c));
      setEditing(null);
      toast.success("Redenumit.");
    });
  }

  // ── Delete
  function handleDelete(id: string) {
    const children = getChildren(id);
    startTransition(async () => {
      const result = await deleteCategory(id);
      if ("error" in result) { toast.error(result.error); return; }
      // Remove category + its children (cascade handled by DB)
      const toRemove = new Set([id, ...children.map(c => c.id)]);
      setCategories(prev => prev.filter(c => !toRemove.has(c.id)));
      setConfirmDelete(null);
      toast.success("Stearsa.");
    });
  }

  const totalCount = categories.length;

  return (
    <div className="p-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Categorii produse</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {totalCount === 0 ? "Nicio categorie" : `${roots.length} ${roots.length === 1 ? "categorie" : "categorii"}, ${totalCount - roots.length} subcategorii`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing("new-root")}
          disabled={editing === "new-root"}
          className="flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary/90 rounded-xl transition-colors disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Categorie noua
        </button>
      </div>

      {/* Empty state */}
      {totalCount === 0 && editing !== "new-root" && (
        <div className="text-center py-16 border-2 border-dashed border-border rounded-2xl">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
            <Tag className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="font-medium text-foreground mb-1">Nicio categorie creata</p>
          <p className="text-sm text-muted-foreground mb-4">Organizeaza-ti produsele in categorii si subcategorii.</p>
          <button
            type="button"
            onClick={() => setEditing("new-root")}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary/90 rounded-xl transition-colors"
          >
            <Plus className="h-4 w-4" />
            Adauga prima categorie
          </button>
        </div>
      )}

      {/* Add root form */}
      {editing === "new-root" && (
        <div className="flex items-center gap-2 mb-3 p-3 rounded-xl border-2 border-primary/30 bg-primary/5">
          <FolderOpen className="h-4 w-4 text-primary flex-shrink-0" />
          <EditableLabel
            value=""
            onSave={handleCreateRoot}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      {/* Categories tree */}
      {roots.length > 0 && (
        <div className="space-y-2">
          {roots.map((cat) => {
            const children = getChildren(cat.id);
            const isExpanded = expanded.has(cat.id);
            const isEditing = editing === cat.id;
            const isConfirmingDelete = confirmDelete === cat.id;
            const isAddingSub = editing === `new-sub-${cat.id}`;

            return (
              <div key={cat.id} className="border border-border rounded-xl overflow-hidden">
                {/* Root category row */}
                <div className={`flex items-center gap-2 px-3 py-2.5 bg-surface hover:bg-muted/40 transition-colors ${isEditing ? "bg-muted/40" : ""}`}>
                  <GripVertical className="h-4 w-4 text-muted-foreground/40 flex-shrink-0 cursor-grab" />

                  {/* Expand toggle */}
                  <button
                    type="button"
                    onClick={() => toggleExpanded(cat.id)}
                    className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {children.length > 0 || isAddingSub ? (
                      <ChevronRight className={`h-4 w-4 transition-transform ${isExpanded || isAddingSub ? "rotate-90" : ""}`} />
                    ) : (
                      <Folder className="h-4 w-4" />
                    )}
                  </button>

                  {isEditing ? (
                    <EditableLabel
                      value={cat.name}
                      onSave={(name) => handleRename(cat.id, name)}
                      onCancel={() => setEditing(null)}
                    />
                  ) : isConfirmingDelete ? (
                    <div className="flex items-center gap-2 flex-1">
                      <p className="text-sm text-foreground flex-1">
                        Stergi <strong>{cat.name}</strong>
                        {children.length > 0 && <span className="text-muted-foreground"> si {children.length} subcategorii</span>}
                        ?
                      </p>
                      <button type="button" onClick={() => handleDelete(cat.id)} disabled={isPending}
                        className="px-2.5 py-1 text-xs font-semibold text-white bg-destructive hover:bg-destructive/90 rounded-lg transition-colors">
                        Sterge
                      </button>
                      <button type="button" onClick={() => setConfirmDelete(null)}
                        className="px-2.5 py-1 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors">
                        Anuleaza
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="flex-1 text-sm font-semibold text-foreground truncate">{cat.name}</span>
                      {children.length > 0 && (
                        <span className="text-xs text-muted-foreground flex-shrink-0">{children.length} sub</span>
                      )}
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => { setExpanded(prev => new Set([...prev, cat.id])); setEditing(`new-sub-${cat.id}`); }}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          title="Adauga subcategorie"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => setEditing(cat.id)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => setConfirmDelete(cat.id)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Subcategories */}
                {(isExpanded || isAddingSub) && (
                  <div className="border-t border-border bg-muted/20">
                    {/* Add sub form */}
                    {isAddingSub && (
                      <div className="flex items-center gap-2 px-3 py-2.5 pl-10 border-b border-border/50">
                        <Tag className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                        <EditableLabel
                          value=""
                          onSave={(name) => handleCreateSub(cat.id, name)}
                          onCancel={() => setEditing(null)}
                        />
                      </div>
                    )}

                    {children.map((sub) => {
                      const isEditingSub = editing === sub.id;
                      const isConfirmingDeleteSub = confirmDelete === sub.id;

                      return (
                        <div key={sub.id}
                          className="flex items-center gap-2 px-3 py-2 pl-10 border-b border-border/50 last:border-0 hover:bg-muted/40 transition-colors">
                          <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 flex-shrink-0 cursor-grab" />
                          <Tag className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />

                          {isEditingSub ? (
                            <EditableLabel
                              value={sub.name}
                              onSave={(name) => handleRename(sub.id, name)}
                              onCancel={() => setEditing(null)}
                            />
                          ) : isConfirmingDeleteSub ? (
                            <div className="flex items-center gap-2 flex-1">
                              <p className="text-sm text-foreground flex-1">Stergi <strong>{sub.name}</strong>?</p>
                              <button type="button" onClick={() => handleDelete(sub.id)} disabled={isPending}
                                className="px-2.5 py-1 text-xs font-semibold text-white bg-destructive hover:bg-destructive/90 rounded-lg transition-colors">
                                Sterge
                              </button>
                              <button type="button" onClick={() => setConfirmDelete(null)}
                                className="px-2.5 py-1 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors">
                                Anuleaza
                              </button>
                            </div>
                          ) : (
                            <>
                              <span className="flex-1 text-sm text-foreground truncate">{sub.name}</span>
                              <div className="flex items-center gap-0.5 flex-shrink-0">
                                <button type="button" onClick={() => setEditing(sub.id)}
                                  className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button type="button" onClick={() => setConfirmDelete(sub.id)}
                                  className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}

                    {/* Add sub button (when expanded and not already adding) */}
                    {!isAddingSub && (
                      <button
                        type="button"
                        onClick={() => setEditing(`new-sub-${cat.id}`)}
                        className="w-full flex items-center gap-2 px-3 py-2 pl-10 text-xs text-muted-foreground hover:text-primary hover:bg-muted/50 transition-colors"
                      >
                        <Plus className="h-3 w-3" />
                        Adauga subcategorie
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Info box */}
      {totalCount > 0 && (
        <div className="mt-6 p-4 rounded-xl bg-muted/50 border border-border">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Categoriile create aici apar ca optiuni in formularul de adaugare/editare produs. Stergerea unei categorii nu afecteaza produsele deja clasificate.
          </p>
        </div>
      )}
    </div>
  );
}
