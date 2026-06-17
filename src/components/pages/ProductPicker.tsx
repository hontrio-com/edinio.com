"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { Search, X, Check, Loader2 } from "lucide-react";
import { searchProductsForPicker, getProductsByIds } from "@/lib/actions/product-picker.actions";
import type { PageProduct } from "./blocks/ProductsBlock";

/**
 * Scalable manual product selector for the page builder. Selected products are
 * resolved by id; search queries the server (debounced, limited) so a catalog of
 * thousands/tens-of-thousands never loads into the editor.
 */
export function ProductPicker({ businessId, selectedIds, onChange }: {
  businessId: string; selectedIds: string[]; onChange: (ids: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PageProduct[]>([]);
  const [selected, setSelected] = useState<PageProduct[]>([]);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idsKey = selectedIds.join(",");

  useEffect(() => {
    let cancelled = false;
    start(async () => {
      if (selectedIds.length === 0) { if (!cancelled) setSelected([]); return; }
      const r = await getProductsByIds(businessId, selectedIds);
      if (!cancelled) setSelected(r);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, idsKey]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) return;
    timer.current = setTimeout(() => {
      start(async () => { setResults(await searchProductsForPicker(businessId, q)); });
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [businessId, q]);

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground">{selected.length} produse selectate</p>
          {selected.map((p) => (
            <div key={p.id} className="flex items-center gap-2 p-1.5 rounded-lg bg-muted/40 border border-border">
              {p.images[0]
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={p.images[0]} alt="" className="w-7 h-7 rounded object-cover shrink-0" />
                : <div className="w-7 h-7 rounded bg-muted shrink-0" />}
              <span className="text-xs truncate flex-1 min-w-0">{p.name}</span>
              <button type="button" onClick={() => toggle(p.id)} className="shrink-0"><X className="h-3.5 w-3.5 text-red-500" /></button>
            </div>
          ))}
        </div>
      )}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        {pending && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cauta produse dupa nume..."
          className="w-full pl-8 pr-8 py-2 text-sm border border-border rounded-lg bg-surface text-foreground focus:outline-none focus:border-primary" />
      </div>
      {q.trim() && (
        <div className="max-h-52 overflow-y-auto border border-border rounded-lg divide-y divide-border">
          {results.map((p) => {
            const sel = selectedIds.includes(p.id);
            return (
              <button key={p.id} type="button" onClick={() => toggle(p.id)} className="w-full flex items-center gap-2 p-2 text-left hover:bg-muted">
                {p.images[0]
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={p.images[0]} alt="" className="w-7 h-7 rounded object-cover shrink-0" />
                  : <div className="w-7 h-7 rounded bg-muted shrink-0" />}
                <span className="text-xs truncate flex-1 min-w-0">{p.name}</span>
                {sel && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
              </button>
            );
          })}
          {results.length === 0 && !pending && <p className="p-3 text-xs text-muted-foreground">Niciun rezultat.</p>}
        </div>
      )}
    </div>
  );
}
