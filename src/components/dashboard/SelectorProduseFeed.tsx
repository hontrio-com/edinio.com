"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Search, X } from "lucide-react";
import { cautaProduseFeed, type ProdusPentruAles } from "@/lib/actions/facebook-feeds.actions";

/**
 * Alegerea produselor dintr-un feed Meta, dintr-un catalog de orice marime.
 *
 * ⚠ Nu se randeaza catalogul. Cel mai mare magazin are 3351 de produse active:
 * o lista intreaga in browser ar fi facut ecranul de nefolosit exact acolo unde
 * selectia conteaza. Se cauta pe server, cate 40 odata.
 *
 * ⚠ Produsele DEJA alese se aduc si cand nu se potrivesc cautarii, si se arata
 * primele. Altfel, scriind ceva in caseta, bifele dispar din lista si omul crede
 * ca le-a pierdut — sau bifeaza a doua oara acelasi lucru.
 */
export function SelectorProduseFeed({
  titlu,
  descriere,
  alese,
  onSchimba,
  onInchide,
}: {
  titlu: string;
  descriere: string;
  alese: string[];
  onSchimba: (ids: string[]) => void;
  onInchide: () => void;
}) {
  const [q, setQ] = useState("");
  const [produse, setProduse] = useState<ProdusPentruAles[]>([]);
  const [total, setTotal] = useState(0);
  const [seIncarca, startIncarcare] = useTransition();

  useEffect(() => {
    /* Cu intarziere: altfel fiecare litera e o cerere la server. */
    const t = setTimeout(() => {
      startIncarcare(async () => {
        const r = await cautaProduseFeed(q, alese);
        if ("error" in r) return;
        setProduse(r.produse);
        setTotal(r.total);
      });
    }, 250);
    return () => clearTimeout(t);
    // `alese` lipseste dinadins: bifarea unui produs n-are de ce sa reincarce lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const comuta = (id: string) => {
    onSchimba(alese.includes(id) ? alese.filter((x) => x !== id) : [...alese, id]);
  };

  /* Alesele sus, ca omul sa vada ce a bifat fara sa caute prin lista. */
  const ordonate = [...produse].sort((a, b) => {
    const A = alese.includes(a.id) ? 0 : 1;
    const B = alese.includes(b.id) ? 0 : 1;
    return A - B || a.name.localeCompare(b.name);
  });

  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-foreground">{titlu}</p>
          <p className="text-[11px] text-muted-foreground">{descriere}</p>
        </div>
        <button type="button" onClick={onInchide} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cauta dupa nume..."
          className="h-8 w-full rounded-lg border border-input bg-background pl-7 pr-2 text-xs"
        />
        {seIncarca && <Loader2 className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>

      <div className="mb-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{alese.length} {alese.length === 1 ? "produs ales" : "produse alese"}</span>
        {alese.length > 0 && (
          <button type="button" onClick={() => onSchimba([])} className="underline hover:text-foreground">
            Deselecteaza tot
          </button>
        )}
      </div>

      <div className="max-h-64 space-y-0.5 overflow-y-auto rounded-lg border border-border p-1">
        {ordonate.length === 0 && !seIncarca && (
          <p className="p-3 text-center text-[11px] text-muted-foreground">Niciun produs gasit.</p>
        )}
        {ordonate.map((p) => (
          <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-muted/60">
            <input type="checkbox" checked={alese.includes(p.id)} onChange={() => comuta(p.id)} />
            {p.imagine
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={p.imagine} alt="" className="h-7 w-7 shrink-0 rounded object-cover" />
              : <span className="h-7 w-7 shrink-0 rounded bg-muted" />}
            <span className="min-w-0 flex-1 truncate text-xs text-foreground">{p.name}</span>
            <span className="shrink-0 text-[11px] text-muted-foreground">{p.category || "fara categorie"}</span>
          </label>
        ))}
      </div>

      {/*
        Cate mai sunt dincolo de cele 40 aduse. Fara randul asta, un catalog mare
        arata ca si cum ar avea doar atatea produse — iar omul cauta degeaba ceva
        ce exista.
      */}
      {total > produse.length && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Se arata {produse.length} din {total}. Cauta ca sa gasesti restul.
        </p>
      )}
    </div>
  );
}
