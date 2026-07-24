"use client";

import { Fragment, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import Image from "next/image";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, Check, X, ChevronRight, FolderOpen, Folder, Tag, ImagePlus, Loader2, Search,
} from "lucide-react";
import { createCategory, updateCategory, deleteCategory } from "@/lib/actions/category.actions";
import { uploadImage } from "@/lib/actions/upload.actions";
import { MediaPicker } from "@/components/media/MediaPicker";
import { Button } from "@/components/ui/button";
import { buildCategoryForest, collectSubtreeIds, searchCategoryForest } from "@/lib/categories/tree";

interface Category {
  id: string;
  business_id: string;
  parent_id: string | null;
  name: string;
  sort_order: number;
  image_url?: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface Props {
  initialCategories: Category[];
}

// Indentation per tree level (px). Depth 1 lands on the old pl-10 (40px) look.
const INDENT_BASE = 12;
const INDENT_STEP = 28;

// Monotonic ids for optimistic rows — unlike Date.now(), two quick creates
// can never collide.
let tempSeq = 0;
function nextTempId(): string {
  tempSeq += 1;
  return `temp-${tempSeq}`;
}

/** Romanian numeral agreement: 1 categorie / 3 categorii / 21 de categorii. */
function pluralRo(n: number, one: string, many: string): string {
  if (n === 1) return `1 ${one}`;
  const rem = n % 100;
  if (n === 0 || (rem >= 1 && rem <= 19)) return `${n} ${many}`;
  return `${n} de ${many}`;
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
  // Which categories are expanded (showing children + add sub form)
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Confirm delete
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  // Name filter (diacritics/case-insensitive); while active the tree is
  // filtered to matches + their ancestors/descendants, all forced open.
  const [search, setSearch] = useState("");

  // The server sends rows ordered by (sort_order, created_at, id) and
  // optimistic inserts append; the forest keeps sibling order from the array.
  // Import-created hierarchies can be arbitrarily deep — the forest promotes
  // orphaned/corrupt rows to roots so every row stays visible and manageable.
  const forest = useMemo(() => buildCategoryForest(categories), [categories]);
  const searchRes = useMemo(() => searchCategoryForest(categories, search), [categories, search]);
  const searchActive = searchRes !== null;

  const totalCount = categories.length;
  const rootCount = forest.roots.length;
  const visibleRoots = searchRes
    ? forest.roots.filter(r => searchRes.visibleIds.has(r.id))
    : forest.roots;

  function rawChildren(id: string): Category[] {
    return forest.childrenOf.get(id) ?? [];
  }

  function visibleChildren(id: string): Category[] {
    const kids = rawChildren(id);
    return searchRes ? kids.filter(k => searchRes.visibleIds.has(k.id)) : kids;
  }

  function toggleExpanded(id: string) {
    if (searchActive) return; // filtered view is always fully expanded
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // ── Create root category (optimistic)
  function handleCreateRoot(name: string) {
    const sort_order = categories.filter(c => !c.parent_id).length;
    const tempId = nextTempId();
    setCategories(prev => [...prev, { id: tempId, business_id: "", parent_id: null, name, sort_order, image_url: null, created_at: "", updated_at: "" }]);
    setEditing(null);
    toast.success("Categorie adaugata.");
    startTransition(async () => {
      const result = await createCategory({ name, sort_order });
      if ("error" in result) { toast.error(result.error); setCategories(prev => prev.filter(c => c.id !== tempId)); return; }
      setCategories(prev => prev.map(c => c.id === tempId ? { ...c, id: result.id } : c));
    });
  }

  // ── Create subcategory at any depth (optimistic)
  function handleCreateSub(parentId: string, name: string) {
    const sort_order = rawChildren(parentId).length;
    const tempId = nextTempId();
    setCategories(prev => [...prev, { id: tempId, business_id: "", parent_id: parentId, name, sort_order, image_url: null, created_at: "", updated_at: "" }]);
    setEditing(null);
    toast.success("Subcategorie adaugata.");
    startTransition(async () => {
      const result = await createCategory({ name, parent_id: parentId, sort_order });
      if ("error" in result) { toast.error(result.error); setCategories(prev => prev.filter(c => c.id !== tempId)); return; }
      setCategories(prev => prev.map(c => c.id === tempId ? { ...c, id: result.id } : c));
    });
  }

  // ── Rename (optimistic, reverted on server error — e.g. duplicate name)
  function handleRename(id: string, name: string) {
    const previousName = categories.find(c => c.id === id)?.name;
    setCategories(prev => prev.map(c => c.id === id ? { ...c, name } : c));
    setEditing(null);
    toast.success("Redenumit.");
    startTransition(async () => {
      const result = await updateCategory(id, { name });
      if ("error" in result) {
        toast.error(result.error);
        if (previousName !== undefined) {
          setCategories(prev => prev.map(c => c.id === id ? { ...c, name: previousName } : c));
        }
      }
    });
  }

  // ── Delete (optimistic; DB cascades over the whole subtree, so remove it
  // here too and restore rows at their original positions on error)
  function handleDelete(id: string) {
    const subtree = collectSubtreeIds(categories, id);
    const backup = categories
      .map((c, index) => ({ c, index }))
      .filter(({ c }) => subtree.has(c.id));
    setCategories(prev => prev.filter(c => !subtree.has(c.id)));
    setConfirmDelete(null);
    toast.success("Stearsa.");
    startTransition(async () => {
      const result = await deleteCategory(id);
      if ("error" in result) {
        toast.error(result.error);
        setCategories(prev => {
          const next = [...prev];
          for (const { c, index } of backup) next.splice(Math.min(index, next.length), 0, c);
          return next;
        });
      }
    });
  }

  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [pickerCatId, setPickerCatId] = useState<string | null>(null);

  async function applyCategoryImage(categoryId: string, url: string) {
    const result = await updateCategory(categoryId, { image_url: url });
    if ("error" in result) { toast.error(result.error); return; }
    setCategories(prev => prev.map(c => c.id === categoryId ? { ...c, image_url: url } : c));
    toast.success("Imagine salvata");
  }

  async function handleImageUpload(categoryId: string, file: File) {
    if (!file.type.startsWith("image/")) { toast.error("Fisierul trebuie sa fie o imagine"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Imaginea trebuie sa fie sub 5MB"); return; }
    setUploadingId(categoryId);
    try {
      // Upload to R2 via the shared server action (same as product images) —
      // avoids the Supabase Storage RLS limits on re-upload.
      const uploaded = await uploadImage(file, "products", "categories");
      if ("error" in uploaded) throw new Error(uploaded.error);
      await applyCategoryImage(categoryId, uploaded.url);
    } catch (e) { toast.error((e as Error).message ?? "Eroare la upload"); }
    finally { setUploadingId(null); }
  }

  async function handleRemoveImage(categoryId: string) {
    startTransition(async () => {
      const result = await updateCategory(categoryId, { image_url: null });
      if ("error" in result) { toast.error(result.error); return; }
      setCategories(prev => prev.map(c => c.id === categoryId ? { ...c, image_url: null } : c));
      toast.success("Imagine stearsa");
    });
  }

  /** Shared image cell: upload label + Media Library trigger, any depth. */
  function imageControls(cat: Category, size: "root" | "sub", isTemp: boolean) {
    const box = size === "root" ? "w-9 h-9" : "w-8 h-8";
    const icon = size === "root" ? "h-4 w-4" : "h-3.5 w-3.5";
    return (
      <>
        <label className={`relative ${box} rounded-lg border border-border bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden group hover:border-primary/50 transition-colors ${isTemp ? "pointer-events-none opacity-50" : "cursor-pointer"}`}>
          {uploadingId === cat.id ? (
            <Loader2 className={`${icon} animate-spin text-muted-foreground`} />
          ) : cat.image_url ? (
            <>
              <Image src={cat.image_url} alt="" fill sizes={size === "root" ? "36px" : "32px"} className="object-cover" />
              <button type="button" onClick={(e) => { e.preventDefault(); handleRemoveImage(cat.id); }}
                className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <X className={`${size === "root" ? "h-3.5 w-3.5" : "h-3 w-3"} text-white`} />
              </button>
            </>
          ) : (
            <ImagePlus className={`${icon} text-muted-foreground group-hover:text-primary transition-colors`} />
          )}
          <input type="file" accept="image/*" className="hidden" disabled={isTemp}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(cat.id, f); e.target.value = ""; }} />
        </label>
        <button type="button" title="Alege din Biblioteca Media" onClick={() => setPickerCatId(cat.id)} disabled={isTemp}
          className={`w-7 ${size === "root" ? "h-9" : "h-8"} flex items-center justify-center flex-shrink-0 text-muted-foreground hover:text-primary transition-colors disabled:opacity-40`}>
          <FolderOpen className="h-3.5 w-3.5" />
        </button>
      </>
    );
  }

  /** Row action buttons: add subcategory / rename / delete — any depth. */
  function rowActions(cat: Category, isTemp: boolean) {
    return (
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <button
          type="button"
          onClick={() => { setExpanded(prev => new Set([...prev, cat.id])); setEditing(`new-sub-${cat.id}`); }}
          disabled={isTemp}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40"
          title="Adauga subcategorie"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => setEditing(cat.id)} disabled={isTemp}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => setConfirmDelete(cat.id)} disabled={isTemp}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  /** Inline delete confirmation with the FULL subtree count (any depth). */
  function deleteConfirm(cat: Category) {
    const descendants = collectSubtreeIds(categories, cat.id).size - 1;
    return (
      <div className="flex items-center gap-2 flex-1">
        <p className="text-sm text-foreground flex-1">
          Stergi <strong>{cat.name}</strong>
          {descendants > 0 && <span className="text-muted-foreground"> si {pluralRo(descendants, "subcategorie", "subcategorii")}</span>}
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
    );
  }

  /** "Add subcategory" inline form row, indented at the children level. */
  function addSubForm(parentId: string, depth: number) {
    return (
      <div className="flex items-center gap-2 pr-3 py-2.5 border-b border-border/50 last:border-0"
        style={{ paddingLeft: INDENT_BASE + depth * INDENT_STEP }}>
        <Tag className="h-3.5 w-3.5 text-primary flex-shrink-0" />
        <EditableLabel
          value=""
          onSave={(name) => handleCreateSub(parentId, name)}
          onCancel={() => setEditing(null)}
        />
      </div>
    );
  }

  /** One nested row (depth >= 1) plus, when open, its add-form and children. */
  function renderNode(cat: Category, depth: number): ReactNode {
    const kids = visibleChildren(cat.id);
    const hasKids = rawChildren(cat.id).length > 0;
    const isTemp = cat.id.startsWith("temp-");
    const isEditing = editing === cat.id;
    const isConfirmingDelete = confirmDelete === cat.id;
    const isAddingSub = editing === `new-sub-${cat.id}`;
    const isOpen = searchActive ? (kids.length > 0 || isAddingSub) : (expanded.has(cat.id) || isAddingSub);

    return (
      <Fragment key={cat.id}>
        <div className="flex items-center gap-2 pr-3 py-2 border-b border-border/50 last:border-0 hover:bg-muted/40 transition-colors"
          style={{ paddingLeft: INDENT_BASE + depth * INDENT_STEP }}>
          {/* Expand toggle / alignment slot */}
          {hasKids || isAddingSub ? (
            <button
              type="button"
              onClick={() => toggleExpanded(cat.id)}
              className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`} />
            </button>
          ) : (
            <span className="w-4 flex-shrink-0" />
          )}

          {imageControls(cat, "sub", isTemp)}

          {isEditing ? (
            <EditableLabel
              value={cat.name}
              onSave={(name) => handleRename(cat.id, name)}
              onCancel={() => setEditing(null)}
            />
          ) : isConfirmingDelete ? (
            deleteConfirm(cat)
          ) : (
            <>
              <span className="flex-1 text-sm text-foreground truncate">{cat.name}</span>
              {hasKids && (
                <span className="text-xs text-muted-foreground flex-shrink-0">{rawChildren(cat.id).length} sub</span>
              )}
              {rowActions(cat, isTemp)}
            </>
          )}
        </div>

        {isOpen && isAddingSub && addSubForm(cat.id, depth + 1)}
        {isOpen && kids.map((k) => renderNode(k, depth + 1))}
      </Fragment>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Categorii produse</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {totalCount === 0
              ? "Nicio categorie"
              : `${pluralRo(rootCount, "categorie", "categorii")}, ${pluralRo(totalCount - rootCount, "subcategorie", "subcategorii")}`}
          </p>
        </div>
        <Button onClick={() => setEditing("new-root")} disabled={editing === "new-root"}>
          <Plus />
          Categorie noua
        </Button>
      </div>

      {/* Empty state */}
      {totalCount === 0 && editing !== "new-root" && (
        <div className="text-center py-16 border-2 border-dashed border-border rounded-2xl">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
            <Tag className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="font-medium text-foreground mb-1">Nicio categorie creata</p>
          <p className="text-sm text-muted-foreground mb-4">Organizeaza-ti produsele in categorii si subcategorii.</p>
          <Button onClick={() => setEditing("new-root")}>
            <Plus />
            Adauga prima categorie
          </Button>
        </div>
      )}

      {/* Search (useful once the list grows; stays while a filter is typed) */}
      {(totalCount >= 5 || search.length > 0) && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cauta o categorie..."
            className="w-full pl-9 pr-9 py-2 text-sm border border-border rounded-xl bg-surface text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors"
          />
          {search.length > 0 && (
            <button type="button" onClick={() => setSearch("")} aria-label="Sterge cautarea"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          )}
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

      {/* No search results */}
      {searchRes && searchRes.matchCount === 0 && totalCount > 0 && (
        <div className="text-center py-10 border border-dashed border-border rounded-xl">
          <p className="text-sm text-muted-foreground">Nicio categorie gasita pentru &quot;{search.trim()}&quot;.</p>
        </div>
      )}

      {/* Categories tree */}
      {visibleRoots.length > 0 && (
        <div className="space-y-2">
          {visibleRoots.map((cat) => {
            const kids = visibleChildren(cat.id);
            const hasKids = rawChildren(cat.id).length > 0;
            const isTemp = cat.id.startsWith("temp-");
            const isEditing = editing === cat.id;
            const isConfirmingDelete = confirmDelete === cat.id;
            const isAddingSub = editing === `new-sub-${cat.id}`;
            const isOpen = searchActive ? (kids.length > 0 || isAddingSub) : (expanded.has(cat.id) || isAddingSub);

            return (
              <div key={cat.id} className="border border-border rounded-xl overflow-hidden">
                {/* Root category row */}
                <div className={`flex items-center gap-2 px-3 py-2.5 bg-surface hover:bg-muted/40 transition-colors ${isEditing ? "bg-muted/40" : ""}`}>
                  {/* Expand toggle */}
                  <button
                    type="button"
                    onClick={() => toggleExpanded(cat.id)}
                    className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {hasKids || isAddingSub ? (
                      <ChevronRight className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                    ) : (
                      <Folder className="h-4 w-4" />
                    )}
                  </button>

                  {imageControls(cat, "root", isTemp)}

                  {isEditing ? (
                    <EditableLabel
                      value={cat.name}
                      onSave={(name) => handleRename(cat.id, name)}
                      onCancel={() => setEditing(null)}
                    />
                  ) : isConfirmingDelete ? (
                    deleteConfirm(cat)
                  ) : (
                    <>
                      <span className="flex-1 text-sm font-semibold text-foreground truncate">{cat.name}</span>
                      {hasKids && (
                        <span className="text-xs text-muted-foreground flex-shrink-0">{rawChildren(cat.id).length} sub</span>
                      )}
                      {rowActions(cat, isTemp)}
                    </>
                  )}
                </div>

                {/* Subtree (any depth) */}
                {isOpen && (
                  <div className="border-t border-border bg-muted/20">
                    {isAddingSub && addSubForm(cat.id, 1)}

                    {kids.map((sub) => renderNode(sub, 1))}

                    {/* Add sub button (when expanded, not searching, not already adding) */}
                    {!isAddingSub && !searchActive && (
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
            Categoriile create aici apar ca optiuni in formularul de adaugare/editare produs. Poti crea subcategorii pe oricate niveluri. Stergerea unei categorii sterge si subcategoriile ei, dar nu afecteaza produsele deja clasificate.
          </p>
        </div>
      )}

      <MediaPicker
        open={pickerCatId !== null}
        onClose={() => setPickerCatId(null)}
        accept="image"
        bucket="products"
        onSelect={(urls) => { if (pickerCatId && urls[0]) void applyCategoryImage(pickerCatId, urls[0]); }}
      />
    </div>
  );
}
