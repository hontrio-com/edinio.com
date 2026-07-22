"use client";

import { useState, useMemo, useTransition, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, X, Package, Pencil, Search, Star, AlertTriangle, Copy, Loader2, Upload, Download, Tag, Trash2, Percent } from "lucide-react";
import { duplicateProduct, bulkProductAction, type BulkAction } from "@/lib/actions/product.actions";
import { publishProductsToOlx } from "@/lib/actions/olx.actions";
import { toast } from "sonner";
import { formatPrice } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import type { Database } from "@/types/database.types";
import type { CategoryOption } from "@/components/dashboard/ProductForm";

type Product = Pick<
  Database["public"]["Tables"]["products"]["Row"],
  "id" | "name" | "slug" | "sku" | "price" | "compare_at_price" | "images" | "category" | "is_active" | "is_featured" | "track_inventory" | "stock_quantity" | "sort_order" | "created_at" | "business_id"
>;

export function ProductsClient({ products, businessId, initialSearch = "", initialPage = 1, categories = [], productLimit, productCount, plan, olxConnected = false }: {
  products: Product[];
  businessId: string;
  initialSearch?: string;
  initialPage?: number;
  categories: CategoryOption[];
  productLimit: number;
  productCount: number;
  plan: string;
  olxConnected?: boolean;
}) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [, startDupTransition] = useTransition();
  const [page, setPage] = useState(initialPage);
  const didMountRef = useRef(false);
  // Keep the current page in the URL (?page=N) WITHOUT a server round-trip, so
  // opening a product and returning (save / cancel / browser back) lands on the
  // same page. The list is paginated client-side, hence history.replaceState.
  const goToPage = useCallback((p: number) => {
    setPage(p);
    const params = new URLSearchParams(window.location.search);
    if (p > 1) params.set("page", String(p)); else params.delete("page");
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  }, []);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [stockFilter, setStockFilter] = useState<"all" | "in" | "out">("all");
  const [exporting, setExporting] = useState(false);

  // ── Bulk selection + actions ──
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkPanel, setBulkPanel] = useState<null | "price" | "category">(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [priceMode, setPriceMode] = useState<Extract<BulkAction, { kind: "price" }>["mode"]>("inc_pct");
  const [priceAmount, setPriceAmount] = useState("");
  const [bulkCategory, setBulkCategory] = useState("");
  const selectAllRef = useRef<HTMLInputElement>(null);

  const bulkBtn = "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground border border-border bg-surface hover:bg-muted rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const bulkSelect = "px-2.5 py-1.5 text-xs border border-border rounded-lg bg-surface text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30";

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/products/export");
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const filename = cd.match(/filename="?([^"]+)"?/)?.[1] ?? "produse.csv";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Export gata. Verifica fisierul descarcat.");
    } catch {
      toast.error("Export esuat. Incearca din nou.");
    } finally {
      setExporting(false);
    }
  }

  const isAtLimit = productLimit !== Infinity && productCount >= productLimit;
  const isNearLimit = !isAtLimit && productLimit !== Infinity && productCount >= Math.floor(productLimit * 0.9);
  const limitPercent = productLimit === Infinity ? 0 : Math.min(100, Math.round((productCount / productLimit) * 100));

  const PAGE_SIZE = 25;

  const parentCategories = useMemo(() => categories.filter(c => !c.parent_id), [categories]);

  // category name -> [name, ...child names], so picking a parent includes its subcategories
  const subtreeByName = useMemo(() => {
    const childrenByParent = new Map<string, string[]>();
    for (const c of categories) {
      if (c.parent_id) {
        const arr = childrenByParent.get(c.parent_id) ?? [];
        arr.push(c.name);
        childrenByParent.set(c.parent_id, arr);
      }
    }
    const map: Record<string, string[]> = {};
    for (const c of categories) map[c.name] = [c.name, ...(childrenByParent.get(c.id) ?? [])];
    return map;
  }, [categories]);

  const hasActiveFilters = searchQuery.trim() !== "" || categoryFilter !== "" || statusFilter !== "all" || stockFilter !== "all";

  function resetFilters() {
    setSearchQuery("");
    setCategoryFilter("");
    setStatusFilter("all");
    setStockFilter("all");
  }

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const catNames = categoryFilter ? (subtreeByName[categoryFilter] ?? [categoryFilter]) : null;
    return products.filter(p => {
      if (q && !(
        p.name.toLowerCase().includes(q) ||
        (p.category ?? "").toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q)
      )) return false;
      if (catNames && !catNames.includes(p.category ?? "")) return false;
      if (statusFilter === "active" && !p.is_active) return false;
      if (statusFilter === "inactive" && p.is_active) return false;
      if (stockFilter !== "all") {
        const out = !!p.track_inventory && (p.stock_quantity ?? 0) <= 0;
        if (stockFilter === "out" && !out) return false;
        if (stockFilter === "in" && out) return false;
      }
      return true;
    });
  }, [products, searchQuery, categoryFilter, statusFilter, stockFilter, subtreeByName]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  // Carry the current page into the edit URL so save/cancel returns to it.
  const editHref = (id: string) => `/dashboard/products/${id}/edit${currentPage > 1 ? `?page=${currentPage}` : ""}`;

  // Reset paging + selection whenever the filtered set changes — but NOT on the
  // initial mount, so a page restored from the URL (?page=N) is preserved.
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return; }
    goToPage(1);
    setSelected(new Set());
    setBulkPanel(null);
    setConfirmBulkDelete(false);
  }, [searchQuery, categoryFilter, statusFilter, stockFilter, goToPage]);

  const allSelected = filtered.length > 0 && filtered.every(p => selected.has(p.id));
  const someSelected = !allSelected && filtered.some(p => selected.has(p.id));

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  function toggleOne(id: string) {
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(filtered.map(p => p.id)));
  }
  function clearSelection() { setSelected(new Set()); setBulkPanel(null); setConfirmBulkDelete(false); }

  async function runBulk(action: BulkAction, successMsg: string) {
    setBulkBusy(true);
    const res = await bulkProductAction(businessId, [...selected], action);
    setBulkBusy(false);
    if ("error" in res) { toast.error(res.error); return; }
    toast.success(successMsg.replace("{n}", String(res.count)));
    clearSelection();
    setPriceAmount("");
    setBulkCategory("");
    router.refresh();
  }
  function applyPrice() {
    const amt = Number(priceAmount);
    if (priceAmount.trim() === "" || !Number.isFinite(amt) || amt < 0) { toast.error("Introdu o valoare valida."); return; }
    runBulk({ kind: "price", mode: priceMode, amount: amt }, "Pret actualizat la {n} produse");
  }
  function applyCategory() {
    if (bulkCategory === "") { toast.error("Alege o categorie."); return; }
    runBulk({ kind: "category", value: bulkCategory === "__none__" ? null : bulkCategory }, "Categorie setata la {n} produse");
  }
  async function publishSelectedToOlx() {
    setBulkBusy(true);
    const res = await publishProductsToOlx(businessId, [...selected]);
    setBulkBusy(false);
    if ("error" in res) { toast.error(res.error); return; }
    if (res.queued === 0) {
      toast.error(res.skipped > 0 ? "Niciun produs eligibil (inactive sau categorie nemapata pe OLX)." : "Niciun produs de publicat.");
      return;
    }
    toast.success(res.skipped > 0
      ? `${res.queued} produse trimise la OLX. ${res.skipped} sarite (inactive sau categorie nemapata).`
      : `${res.queued} produse trimise la publicare pe OLX.`);
    clearSelection();
    router.refresh();
  }

  return (
    <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <h1 className="text-xl font-semibold text-foreground">Produsele mele</h1>
          <span className="px-2 py-0.5 bg-muted text-muted-foreground text-xs font-semibold rounded-full">
            {products.length}
          </span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
          <div className="relative w-full sm:w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Cauta produs..."
              className="w-full pl-9 pr-8 py-2 text-sm border border-border rounded-xl bg-muted/40 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
            <Button variant="outline" onClick={() => router.push("/dashboard/products/import")} className="w-full sm:w-auto whitespace-nowrap">
              <Upload />
              Importa
            </Button>
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={exporting || products.length === 0}
              title={products.length === 0 ? "Nu ai produse de exportat" : "Exporta toate produsele in CSV"}
              className="w-full sm:w-auto whitespace-nowrap"
            >
              {exporting ? <Loader2 className="animate-spin" /> : <Download />}
              Exporta
            </Button>
            <Button
              onClick={() => router.push("/dashboard/products/new")}
              disabled={isAtLimit}
              className="col-span-2 w-full sm:w-auto whitespace-nowrap"
            >
              <Plus />
              Adauga produs
            </Button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {parentCategories.length > 0 && (
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-border rounded-xl bg-muted/40 text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors">
            <option value="">Toate categoriile</option>
            {parentCategories.map((parent) => {
              const children = categories.filter((c) => c.parent_id === parent.id);
              return children.length > 0 ? (
                <optgroup key={parent.id} label={parent.name}>
                  <option value={parent.name}>{parent.name} (toate)</option>
                  {children.map((ch) => (
                    <option key={ch.id} value={ch.name}>{`  ↳ ${ch.name}`}</option>
                  ))}
                </optgroup>
              ) : (
                <option key={parent.id} value={parent.name}>{parent.name}</option>
              );
            })}
          </select>
        )}
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="px-3 py-2 text-sm border border-border rounded-xl bg-muted/40 text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors">
          <option value="all">Toate statusurile</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select value={stockFilter} onChange={(e) => setStockFilter(e.target.value as typeof stockFilter)}
          className="px-3 py-2 text-sm border border-border rounded-xl bg-muted/40 text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors">
          <option value="all">Tot stocul</option>
          <option value="in">In stoc</option>
          <option value="out">Epuizate</option>
        </select>
        {hasActiveFilters && (
          <button type="button" onClick={resetFilters}
            className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground border border-border rounded-xl transition-colors">
            <X className="h-3.5 w-3.5" /> Reseteaza
          </button>
        )}
      </div>

      {/* Plan limit indicator */}
      {productLimit !== Infinity && (
        <div className={cn(
          "mb-4 px-4 py-3 rounded-xl border text-sm flex flex-col gap-2",
          isAtLimit
            ? "border-destructive/20 bg-destructive/5 text-destructive"
            : isNearLimit
              ? "border-warning/20 bg-warning/5 text-warning"
              : "bg-muted/50 border-border text-muted-foreground"
        )}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {(isAtLimit || isNearLimit) && <AlertTriangle className="h-4 w-4 flex-shrink-0" />}
              <span>
                {isAtLimit
                  ? `Ai atins limita de ${productLimit} produse pentru planul ${plan.charAt(0).toUpperCase() + plan.slice(1)}.`
                  : `${productCount} / ${productLimit} produse folosite`}
              </span>
            </div>
            {(isAtLimit || isNearLimit) && (
              <button
                type="button"
                onClick={() => router.push("/dashboard/settings#abonament")}
                className={cn(
                  "text-xs font-semibold underline underline-offset-2 whitespace-nowrap flex-shrink-0",
                  isAtLimit ? "text-destructive" : "text-warning"
                )}
              >
                Upgradeaza planul
              </button>
            )}
          </div>
          <div className="w-full h-1.5 rounded-full bg-black/10 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                isAtLimit ? "bg-destructive" : isNearLimit ? "bg-warning" : "bg-primary"
              )}
              style={{ width: `${limitPercent}%` }}
            />
          </div>
        </div>
      )}

      {hasActiveFilters && (
        <p className="text-sm text-muted-foreground mb-3">
          {filtered.length === 0
            ? "Niciun produs gasit cu filtrele selectate"
            : `${filtered.length} ${filtered.length === 1 ? "produs gasit" : "produse gasite"}`}
        </p>
      )}

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="mb-3 rounded-xl border border-primary/30 bg-primary/5">
          <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
            <span className="text-sm font-semibold text-foreground mr-1">{selected.size} selectate</span>
            <button type="button" disabled={bulkBusy} onClick={() => runBulk({ kind: "active", value: true }, "{n} produse activate")} className={bulkBtn}>Activeaza</button>
            <button type="button" disabled={bulkBusy} onClick={() => runBulk({ kind: "active", value: false }, "{n} produse dezactivate")} className={bulkBtn}>Dezactiveaza</button>
            <button type="button" disabled={bulkBusy} onClick={() => runBulk({ kind: "featured", value: true }, "{n} produse recomandate")} className={bulkBtn}><Star className="h-3.5 w-3.5" /> Recomanda</button>
            <button type="button" disabled={bulkBusy} onClick={() => runBulk({ kind: "featured", value: false }, "Recomandat eliminat de la {n} produse")} className={bulkBtn}>Scoate recomandat</button>
            <button type="button" disabled={bulkBusy} onClick={() => { setBulkPanel(p => p === "price" ? null : "price"); setConfirmBulkDelete(false); }} className={cn(bulkBtn, bulkPanel === "price" && "border-primary ring-1 ring-primary/30")}><Percent className="h-3.5 w-3.5" /> Pret</button>
            <button type="button" disabled={bulkBusy} onClick={() => { setBulkPanel(p => p === "category" ? null : "category"); setConfirmBulkDelete(false); }} className={cn(bulkBtn, bulkPanel === "category" && "border-primary ring-1 ring-primary/30")}><Tag className="h-3.5 w-3.5" /> Categorie</button>
            {olxConnected && (
              <button type="button" disabled={bulkBusy} onClick={publishSelectedToOlx} className={bulkBtn}>
                <Image src="/integrations/olx.svg" alt="" width={14} height={14} className="h-3.5 w-3.5 rounded-[3px]" /> Publica pe OLX
              </button>
            )}
            <button type="button" disabled={bulkBusy} onClick={() => { setConfirmBulkDelete(true); setBulkPanel(null); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-destructive border border-destructive/20 bg-surface hover:bg-destructive/5 rounded-lg transition-colors disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /> Sterge</button>
            <div className="flex-1" />
            {bulkBusy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <button type="button" disabled={bulkBusy} onClick={clearSelection} className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"><X className="h-3.5 w-3.5" /> Deselecteaza</button>
          </div>

          {bulkPanel === "price" && (
            <div className="flex flex-wrap items-center gap-2 px-3 pb-3 pt-1 border-t border-primary/15">
              <select value={priceMode} onChange={e => setPriceMode(e.target.value as typeof priceMode)} className={bulkSelect}>
                <option value="inc_pct">Mareste cu %</option>
                <option value="dec_pct">Micsoreaza cu %</option>
                <option value="inc_amt">Mareste cu suma (lei)</option>
                <option value="dec_amt">Micsoreaza cu suma (lei)</option>
                <option value="set">Seteaza pretul la (lei)</option>
              </select>
              <input type="number" min="0" step="0.01" value={priceAmount} onChange={e => setPriceAmount(e.target.value)}
                placeholder={priceMode.includes("pct") ? "%" : "lei"}
                className="w-28 px-2.5 py-1.5 text-xs border border-border rounded-lg bg-surface text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30" />
              <button type="button" disabled={bulkBusy} onClick={applyPrice} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-50">Aplica</button>
              <span className="text-[11px] text-muted-foreground">Se aplica la cele {selected.size} produse selectate.</span>
            </div>
          )}

          {bulkPanel === "category" && (
            <div className="flex flex-wrap items-center gap-2 px-3 pb-3 pt-1 border-t border-primary/15">
              <select value={bulkCategory} onChange={e => setBulkCategory(e.target.value)} className={bulkSelect}>
                <option value="">Alege categoria...</option>
                <option value="__none__">— Fara categorie —</option>
                {parentCategories.map(parent => {
                  const children = categories.filter(c => c.parent_id === parent.id);
                  return children.length > 0 ? (
                    <optgroup key={parent.id} label={parent.name}>
                      <option value={parent.name}>{parent.name}</option>
                      {children.map(ch => <option key={ch.id} value={ch.name}>{`  ↳ ${ch.name}`}</option>)}
                    </optgroup>
                  ) : <option key={parent.id} value={parent.name}>{parent.name}</option>;
                })}
              </select>
              <button type="button" disabled={bulkBusy} onClick={applyCategory} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-50">Aplica</button>
            </div>
          )}

          {confirmBulkDelete && (
            <div className="flex flex-wrap items-center gap-2 px-3 pb-3 pt-1 border-t border-destructive/20">
              <span className="text-sm font-medium text-destructive">Stergi definitiv {selected.size} produse? Actiunea nu poate fi anulata.</span>
              <button type="button" disabled={bulkBusy} onClick={() => runBulk({ kind: "delete" }, "{n} produse sterse")} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-destructive hover:bg-destructive/90 rounded-lg transition-colors disabled:opacity-50">{bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Da, sterge</button>
              <button type="button" disabled={bulkBusy} onClick={() => setConfirmBulkDelete(false)} className={bulkBtn}>Anuleaza</button>
            </div>
          )}
        </div>
      )}

      {filtered.length > 0 ? (
        <>
          {/* Mobile: card list (the table is too cramped on small screens) */}
          <div className="sm:hidden space-y-2">
            <label className="flex w-fit items-center gap-2 px-1 pb-0.5 cursor-pointer">
              <input type="checkbox" checked={allSelected} onChange={toggleAll}
                aria-label="Selecteaza toate produsele filtrate"
                className="h-4 w-4 rounded border-border accent-primary cursor-pointer" />
              <span className="text-xs font-medium text-muted-foreground">{allSelected ? "Deselecteaza tot" : "Selecteaza tot"}</span>
            </label>
            {paginated.map((product) => {
              const images = Array.isArray(product.images) ? product.images : [];
              const isSel = selected.has(product.id);
              return (
                <div key={product.id}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-xl border transition-colors",
                    isSel ? "border-primary/40 bg-primary/5" : "border-border bg-surface"
                  )}>
                  <input type="checkbox" checked={isSel} onChange={() => toggleOne(product.id)}
                    aria-label={`Selecteaza ${product.name}`}
                    className="mt-1 h-4 w-4 rounded border-border accent-primary cursor-pointer flex-shrink-0" />
                  <Link href={editHref(product.id)} className="flex items-start gap-3 flex-1 min-w-0">
                    {images[0] ? (
                      <Image src={String(images[0])} alt={product.name} width={56} height={56}
                        className="w-14 h-14 rounded-lg object-cover border border-border flex-shrink-0" />
                    ) : (
                      <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                        <Package className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-foreground flex items-center gap-1.5 min-w-0">
                        <span className="truncate">{product.name}</span>
                        {product.is_featured && <Star className="h-3 w-3 text-amber-400 fill-amber-400 flex-shrink-0" />}
                      </div>
                      {product.sku && <div className="text-xs text-muted-foreground font-mono truncate">SKU: {product.sku}</div>}
                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground text-sm whitespace-nowrap">{formatPrice(Number(product.price))}</span>
                        {product.compare_at_price && (
                          <span className="text-xs text-muted-foreground line-through whitespace-nowrap">{formatPrice(Number(product.compare_at_price))}</span>
                        )}
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                        <span className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium",
                          product.is_active ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                        )}>
                          {product.is_active ? "Activ" : "Inactiv"}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {product.track_inventory ? `${product.stock_quantity ?? 0} buc` : "Stoc nelimitat"}
                        </span>
                      </div>
                    </div>
                  </Link>
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button
                      type="button"
                      disabled={duplicatingId === product.id}
                      onClick={() => {
                        setDuplicatingId(product.id);
                        startDupTransition(async () => {
                          const res = await duplicateProduct(product.id, businessId);
                          setDuplicatingId(null);
                          if ("error" in res) { toast.error(res.error); }
                          else { toast.success("Produs duplicat"); router.push(editHref(res.id)); }
                        });
                      }}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                      aria-label="Duplica"
                    >
                      {duplicatingId === product.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                    <Link href={editHref(product.id)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      aria-label="Editeaza">
                      <Pencil className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop: table */}
          <div className="hidden sm:block bg-surface border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm table-fixed">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-3 w-10">
                  <input ref={selectAllRef} type="checkbox" checked={allSelected} onChange={toggleAll}
                    aria-label="Selecteaza toate produsele filtrate"
                    className="h-4 w-4 rounded border-border accent-primary cursor-pointer align-middle" />
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[36%] lg:w-[32%]">Produs</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell w-[15%]">Categorie</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[14%] sm:w-[12%]">Pret</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell w-[12%]">Stoc</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[12%] sm:w-[10%]">Status</th>
                <th className="px-4 py-3 w-[20%] sm:w-[12%]" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginated.map((product) => {
                const images = Array.isArray(product.images) ? product.images : [];
                return (
                  <tr key={product.id} className={cn("hover:bg-muted/30 transition-colors cursor-pointer", selected.has(product.id) && "bg-primary/5")}
                    onClick={() => router.push(editHref(product.id))}>
                    <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(product.id)} onChange={() => toggleOne(product.id)}
                        aria-label={`Selecteaza ${product.name}`}
                        className="h-4 w-4 rounded border-border accent-primary cursor-pointer align-middle" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {images[0] ? (
                          <Image src={String(images[0])} alt={product.name} width={40} height={40}
                            className="w-10 h-10 rounded-lg object-cover border border-border flex-shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                            <Package className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-foreground flex items-center gap-1.5 min-w-0">
                            <span className="truncate">{product.name}</span>
                            {product.is_featured && (
                              <Star className="h-3 w-3 text-amber-400 fill-amber-400 flex-shrink-0" />
                            )}
                          </div>
                          {product.sku && (
                            <div className="text-xs text-muted-foreground font-mono truncate">SKU: {product.sku}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-muted-foreground truncate block">{product.category ?? "-"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-foreground whitespace-nowrap">{formatPrice(Number(product.price))}</span>
                      {product.compare_at_price && (
                        <div className="text-xs text-muted-foreground line-through whitespace-nowrap">
                          {formatPrice(Number(product.compare_at_price))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell whitespace-nowrap">
                      {product.track_inventory ? `${product.stock_quantity ?? 0} buc` : "Nelimitat"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap",
                        product.is_active
                          ? "bg-success/10 text-success"
                          : "bg-muted text-muted-foreground"
                      )}>
                        {product.is_active ? "Activ" : "Inactiv"}
                      </span>
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          type="button"
                          disabled={duplicatingId === product.id}
                          onClick={() => {
                            setDuplicatingId(product.id);
                            startDupTransition(async () => {
                              const res = await duplicateProduct(product.id, businessId);
                              setDuplicatingId(null);
                              if ("error" in res) { toast.error(res.error); }
                              else { toast.success("Produs duplicat"); router.push(editHref(res.id)); }
                            });
                          }}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                          aria-label="Duplica"
                        >
                          {duplicatingId === product.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                        <Link
                          href={editHref(product.id)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          aria-label="Editeaza"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>

          {totalPages > 1 && (
            <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2 px-3 sm:px-5 py-3 mt-3 bg-surface border border-border rounded-xl">
              <p className="text-xs text-muted-foreground">
                {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} din {filtered.length} produse
              </p>
              <div className="flex items-center gap-1 self-end sm:self-auto">
                <button onClick={() => goToPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-border disabled:opacity-30 hover:bg-muted transition-colors">Inapoi</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                  .reduce<(number | "dots")[]>((acc, p, i, arr) => {
                    if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("dots");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === "dots" ? (
                      <span key={`d${i}`} className="px-1 text-muted-foreground text-xs">...</span>
                    ) : (
                      <button key={p} onClick={() => goToPage(p)}
                        className={cn("min-w-[28px] h-7 text-xs rounded-lg border transition-colors",
                          currentPage === p ? "bg-foreground text-background border-foreground" : "border-border hover:bg-muted")}>
                        {p}
                      </button>
                    )
                  )}
                <button onClick={() => goToPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-border disabled:opacity-30 hover:bg-muted transition-colors">Inainte</button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="py-16 text-center px-4">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              {searchQuery.trim() ? <Search className="h-6 w-6 text-muted-foreground" /> : <Package className="h-6 w-6 text-muted-foreground" />}
            </div>
            {searchQuery.trim() ? (
              <>
                <p className="text-sm font-medium text-foreground mb-1">Niciun produs gasit</p>
                <p className="text-xs text-muted-foreground mb-5">Incearca un alt termen de cautare</p>
                <Button variant="outline" onClick={() => setSearchQuery("")}>
                  <X />
                  Sterge cautarea
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-foreground mb-1">Niciun produs inca</p>
                <p className="text-xs text-muted-foreground mb-5">Adauga primul produs sau importa-le din Shopify / WooCommerce</p>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2 max-w-xs mx-auto sm:max-w-none">
                  {!isAtLimit && (
                    <Button onClick={() => router.push("/dashboard/products/new")} className="w-full sm:w-auto">
                      <Plus />
                      Adauga produs
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => router.push("/dashboard/products/import")} className="w-full sm:w-auto">
                    <Upload />
                    Importa produse
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
