"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Search, X } from "lucide-react";
import { saveTrendyolCategoryMapEntry, searchTrendyolCategories } from "@/lib/actions/trendyol.actions";
import type { TrendyolCategoryMapEntry } from "@/lib/trendyol/types";

export function TrendyolCategoryMapping({
  businessId, edinioCategories, mapped,
}: {
  businessId: string;
  edinioCategories: string[];
  mapped: Record<string, TrendyolCategoryMapEntry>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: number; label: string }[]>([]);
  const [searching, setSearching] = useState(false);

  if (edinioCategories.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-5 text-sm text-muted-foreground">
        Adaugă categorii produselor tale ca să le poți mapa la categoriile Trendyol.
      </div>
    );
  }

  const runSearch = (q: string) => {
    setQuery(q);
    if (q.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    startTransition(async () => {
      const res = await searchTrendyolCategories(businessId, q);
      setSearching(false);
      if ("error" in res) { toast.error(res.error); return; }
      setResults(res.categories);
    });
  };

  const choose = (cat: string, ty: { id: number; label: string }) => {
    startTransition(async () => {
      const prev = mapped[cat];
      const entry: TrendyolCategoryMapEntry = { category_id: ty.id, label: ty.label, brand_id: prev?.brand_id, attributes: prev?.attributes };
      const res = await saveTrendyolCategoryMapEntry(businessId, cat, entry);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Categorie mapată.");
      setOpenFor(null); setQuery(""); setResults([]);
      router.refresh();
    });
  };

  const unmap = (cat: string) => {
    startTransition(async () => {
      const res = await saveTrendyolCategoryMapEntry(businessId, cat, null);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Mapare eliminată.");
      router.refresh();
    });
  };

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-base font-semibold text-foreground mb-1">Mapare categorii</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Leagă fiecare categorie din magazin de o categorie Trendyol (doar categorii finale, fără subcategorii).
      </p>

      <div className="divide-y divide-border">
        {edinioCategories.map((cat) => {
          const m = mapped[cat];
          const isOpen = openFor === cat;
          return (
            <div key={cat} className="py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{cat}</p>
                  {m ? (
                    <p className="text-xs text-green-700 flex items-center gap-1 mt-0.5"><Check className="h-3 w-3" /> {m.label}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-0.5">Nemapat</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {m && (
                    <button onClick={() => unmap(cat)} disabled={pending}
                      className="text-xs text-muted-foreground hover:text-red-600 disabled:opacity-60">Elimină</button>
                  )}
                  <button onClick={() => { setOpenFor(isOpen ? null : cat); setQuery(""); setResults([]); }}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">
                    {m ? "Schimbă" : "Mapează"}
                  </button>
                </div>
              </div>

              {isOpen && (
                <div className="mt-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <input autoFocus value={query} onChange={(e) => runSearch(e.target.value)}
                      placeholder="Caută categoria Trendyol (ex. tricou, rochie)"
                      className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm" />
                    {query && (
                      <button onClick={() => { setQuery(""); setResults([]); }} className="absolute right-3 top-2.5">
                        <X className="h-4 w-4 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                  {searching && <p className="text-xs text-muted-foreground mt-2">Se caută...</p>}
                  {results.length > 0 && (
                    <div className="mt-2 max-h-60 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                      {results.map((r) => (
                        <button key={r.id} onClick={() => choose(cat, r)} disabled={pending}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted disabled:opacity-60">{r.label}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
