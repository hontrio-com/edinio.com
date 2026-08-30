"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { Search, X, Check, Loader2, ChevronUp, ChevronDown } from "lucide-react";
import { searchProductsForPicker, getProductsByIds } from "@/lib/actions/product-picker.actions";
import type { PageProduct } from "./blocks/ProductsBlock";

/**
 * Scalable manual product selector for the page builder. Selected products are
 * resolved by id; search queries the server (debounced, limited) so a catalog of
 * thousands/tens-of-thousands never loads into the editor.
 */
export function ProductPicker({ businessId, selectedIds, onChange, reordonabil = false, maxim }: {
  businessId: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /**
   * Lista aleasa capata sageti de mutat.
   *
   * Optional fiindca ordinea conteaza doar unde chiar inseamna ceva: la asezarea
   * grilei de pe prima pagina. In sectiunile de produse si in page-builder lista e
   * o multime, iar doua sageti pe fiecare rand ar fi doar zgomot.
   */
  reordonabil?: boolean;
  /** Cate produse pot fi alese. Peste atat, butoanele de adaugare se sting. */
  maxim?: number;
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

  const plin = maxim != null && selectedIds.length >= maxim;

  function toggle(id: string) {
    if (selectedIds.includes(id)) { onChange(selectedIds.filter((x) => x !== id)); return; }
    // Scoaterea ramane mereu posibila; doar adaugarea se opreste la plafon.
    if (plin) return;
    onChange([...selectedIds, id]);
  }

  /**
   * Muta produsul de pe pozitia `i` din lista AFISATA.
   *
   * ⚠ Indicii listei afisate NU sunt indicii lui `selectedIds`: `getProductsByIds`
   * arunca id-urile pe care nu le mai gaseste (produs sters intre timp), deci
   * lista afisata poate fi mai scurta. Interschimbate pe indicii afisati, doua
   * sageti ar fi mutat alte produse decat cele aratate — cu atat mai perfid cu cat
   * se intampla numai in magazinele care au sters ceva.
   *
   * Deci se cauta pozitiile REALE ale celor doua id-uri; id-urile moarte raman pe
   * locul lor si nu incurca pe nimeni (pe magazin nu se potrivesc oricum cu niciun
   * produs).
   */
  function muta(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= selected.length) return;
    const a = selectedIds.indexOf(selected[i].id);
    const b = selectedIds.indexOf(selected[j].id);
    if (a < 0 || b < 0) return;
    const next = selectedIds.slice();
    [next[a], next[b]] = [next[b], next[a]];
    onChange(next);
  }

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground">
            {selected.length} produse selectate{maxim != null ? ` (maxim ${maxim})` : ""}
          </p>
          {selected.map((p, i) => (
            <div key={p.id} className="flex items-center gap-2 p-1.5 rounded-lg bg-muted/40 border border-border">
              {/* Numarul de ordine: fara el, „al treilea produs" se numara cu degetul. */}
              {reordonabil && (
                <span className="w-5 shrink-0 text-center text-[10px] font-semibold text-muted-foreground tabular-nums">{i + 1}</span>
              )}
              {p.images[0]
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={p.images[0]} alt="" className="w-7 h-7 rounded object-cover shrink-0" />
                : <div className="w-7 h-7 rounded bg-muted shrink-0" />}
              <span className="text-xs truncate flex-1 min-w-0">{p.name}</span>
              {reordonabil && (
                <>
                  <button type="button" aria-label={`Muta „${p.name}” mai sus`} disabled={i === 0}
                    onClick={() => muta(i, -1)}
                    className="shrink-0 p-0.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed">
                    <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <button type="button" aria-label={`Muta „${p.name}” mai jos`} disabled={i === selected.length - 1}
                    onClick={() => muta(i, 1)}
                    className="shrink-0 p-0.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed">
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </>
              )}
              <button type="button" aria-label={`Scoate „${p.name}”`} onClick={() => toggle(p.id)} className="shrink-0">
                <X className="h-3.5 w-3.5 text-red-500" />
              </button>
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
              <button key={p.id} type="button" onClick={() => toggle(p.id)} disabled={plin && !sel}
                className="w-full flex items-center gap-2 p-2 text-left hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed">
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
