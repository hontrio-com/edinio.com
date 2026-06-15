"use client";

import { useState, useMemo, useTransition, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Plus, X, Package, Pencil, Search, Star, AlertTriangle, Copy, Loader2, Upload } from "lucide-react";
import { duplicateProduct } from "@/lib/actions/product.actions";
import { toast } from "sonner";
import { formatPrice } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { Database } from "@/types/database.types";
import type { CategoryOption } from "@/components/dashboard/ProductForm";

type Product = Pick<
  Database["public"]["Tables"]["products"]["Row"],
  "id" | "name" | "slug" | "sku" | "price" | "compare_at_price" | "images" | "category" | "is_active" | "is_featured" | "track_inventory" | "stock_quantity" | "sort_order" | "created_at" | "business_id"
>;

export function ProductsClient({ products, businessId, initialSearch = "", categories = [], productLimit, productCount, plan }: {
  products: Product[];
  businessId: string;
  initialSearch?: string;
  categories: CategoryOption[];
  productLimit: number;
  productCount: number;
  plan: string;
}) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [, startDupTransition] = useTransition();
  const [page, setPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [stockFilter, setStockFilter] = useState<"all" | "in" | "out">("all");

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

  useEffect(() => { setPage(1); }, [searchQuery, categoryFilter, statusFilter, stockFilter]);

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
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Cauta produs..."
              className="pl-9 pr-8 py-2 text-sm border border-border rounded-xl bg-muted/40 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors w-48"
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => router.push("/dashboard/products/import")}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-foreground border border-border hover:bg-muted rounded-xl transition-colors whitespace-nowrap"
          >
            <Upload className="h-4 w-4" />
            Importa
          </button>
          {isAtLimit ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary/40 rounded-xl whitespace-nowrap opacity-60 cursor-not-allowed"
              >
                <Plus className="h-4 w-4" />
                Adauga produs
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => router.push("/dashboard/products/new")}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-xl transition-colors whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              Adauga produs
            </button>
          )}
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
            ? "bg-red-50 border-red-200 text-red-700"
            : isNearLimit
              ? "bg-amber-50 border-amber-200 text-amber-700"
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
                onClick={() => router.push("/dashboard/settings")}
                className={cn(
                  "text-xs font-semibold underline underline-offset-2 whitespace-nowrap flex-shrink-0",
                  isAtLimit ? "text-red-700" : "text-amber-700"
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
                isAtLimit ? "bg-red-500" : isNearLimit ? "bg-amber-500" : "bg-primary"
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

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        {filtered.length > 0 ? (
          <>
          <table className="w-full text-sm table-fixed">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[40%] lg:w-[35%]">Produs</th>
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
                  <tr key={product.id} className="hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => router.push(`/dashboard/products/${product.id}/edit`)}>
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
                          ? "bg-green-50 text-green-700 border border-green-200"
                          : "bg-gray-100 text-gray-500 border border-gray-200"
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
                              else { toast.success("Produs duplicat"); router.refresh(); }
                            });
                          }}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                          aria-label="Duplica"
                        >
                          {duplicatingId === product.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => router.push(`/dashboard/products/${product.id}/edit`)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          aria-label="Editeaza"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-border">
              <p className="text-xs text-muted-foreground">
                {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} din {filtered.length} produse
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
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
                      <button key={p} onClick={() => setPage(p)}
                        className={cn("min-w-[28px] h-7 text-xs rounded-lg border transition-colors",
                          currentPage === p ? "bg-foreground text-background border-foreground" : "border-border hover:bg-muted")}>
                        {p}
                      </button>
                    )
                  )}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-border disabled:opacity-30 hover:bg-muted transition-colors">Inainte</button>
              </div>
            </div>
          )}
          </>
        ) : (
          <div className="py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              {searchQuery.trim() ? <Search className="h-6 w-6 text-muted-foreground" /> : <Package className="h-6 w-6 text-muted-foreground" />}
            </div>
            {searchQuery.trim() ? (
              <>
                <p className="text-sm font-medium text-foreground mb-1">Niciun produs gasit</p>
                <p className="text-xs text-muted-foreground mb-5">Incearca un alt termen de cautare</p>
                <button type="button" onClick={() => setSearchQuery("")}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border rounded-xl hover:bg-muted transition-colors">
                  <X className="h-4 w-4" />
                  Sterge cautarea
                </button>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-foreground mb-1">Niciun produs inca</p>
                <p className="text-xs text-muted-foreground mb-5">Adauga primul produs sau importa-le din Shopify / WooCommerce</p>
                <div className="flex items-center justify-center gap-2">
                  {!isAtLimit && (
                    <button type="button" onClick={() => router.push("/dashboard/products/new")}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-xl transition-colors">
                      <Plus className="h-4 w-4" />
                      Adauga produs
                    </button>
                  )}
                  <button type="button" onClick={() => router.push("/dashboard/products/import")}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-foreground border border-border hover:bg-muted rounded-xl transition-colors">
                    <Upload className="h-4 w-4" />
                    Importa produse
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
