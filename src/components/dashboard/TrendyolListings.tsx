"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ChevronLeft, ChevronRight, Loader2, Search, X } from "lucide-react";
import {
  getTrendyolProductPage, removeTrendyolListing, syncTrendyolProduct,
  type TrendyolProductPage, type TrendyolProductStatusFilter,
} from "@/lib/actions/trendyol.actions";
import { TrendyolListingEditor } from "@/components/dashboard/TrendyolListingEditor";
import type { TrendyolStoreFront } from "@/lib/trendyol/types";

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  approved: { text: "Aprobat", cls: "bg-green-100 text-green-700" },
  active: { text: "Activ", cls: "bg-green-100 text-green-700" },
  pending: { text: "Trimis", cls: "bg-amber-100 text-amber-700" },
  created: { text: "În aprobare", cls: "bg-amber-100 text-amber-700" },
  draft: { text: "Ciornă", cls: "bg-muted text-muted-foreground" },
  inactive: { text: "Inactiv", cls: "bg-muted text-muted-foreground" },
  rejected: { text: "Respins", cls: "bg-red-100 text-red-700" },
  error: { text: "Eroare", cls: "bg-red-100 text-red-700" },
};

const FILTRE: { value: TrendyolProductStatusFilter; label: string }[] = [
  { value: "toate", label: "Toate produsele" },
  { value: "nelistate", label: "Nelistate" },
  { value: "aprobate", label: "Aprobate pe Trendyol" },
  { value: "in_asteptare", label: "În așteptare" },
  { value: "eroare", label: "Cu erori" },
  { value: "listate", label: "Configurate (orice stare)" },
];

export function TrendyolListings({
  businessId, categories, storefront,
}: {
  businessId: string; categories: string[]; storefront: TrendyolStoreFront;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [cautare, setCautare] = useState("");
  const [categorie, setCategorie] = useState("");
  const [status, setStatus] = useState<TrendyolProductStatusFilter>("toate");
  const [pagina, setPagina] = useState(1);

  const [date, setDate] = useState<TrendyolProductPage | null>(null);
  const [incarca, setIncarca] = useState(true);
  const [eroare, setEroare] = useState<string | null>(null);

  const aplicaRezultatul = useCallback((res: TrendyolProductPage | { error: string }) => {
    if ("error" in res) { setEroare(res.error); setDate(null); }
    else { setEroare(null); setDate(res); }
    setIncarca(false);
  }, []);

  // Cautarea porneste la 350ms dupa ultima tasta: altfel un magazin cu multe
  // produse ar trimite o cerere pe litera si ar afisa rezultate care se bat cap
  // in cap, in ordinea in care se intorc.
  useEffect(() => {
    const t = setTimeout(() => { setIncarca(true); setCautare(q); setPagina(1); }, 350);
    return () => clearTimeout(t);
  }, [q]);

  // Raspunsurile vechi sunt aruncate: cine tasteaza repede primea altfel pagina
  // cererii anterioare, daca aceea se intorcea mai tarziu.
  useEffect(() => {
    let viu = true;
    getTrendyolProductPage(businessId, { q: cautare, category: categorie, status, page: pagina })
      .then((res) => { if (viu) aplicaRezultatul(res); });
    return () => { viu = false; };
  }, [businessId, cautare, categorie, status, pagina, aplicaRezultatul]);

  // Reimprospatare la cerere, din butoane (nu din efect).
  const incarcaPagina = useCallback(async () => {
    setIncarca(true);
    aplicaRezultatul(await getTrendyolProductPage(businessId, { q: cautare, category: categorie, status, page: pagina }));
  }, [businessId, cautare, categorie, status, pagina, aplicaRezultatul]);

  const remove = (productId: string) => {
    if (!window.confirm("Elimini această listare de pe Trendyol?")) return;
    startTransition(async () => {
      const res = await removeTrendyolListing(businessId, productId);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Listare eliminată.");
      await incarcaPagina();
      router.refresh();
    });
  };
  const retry = (productId: string) => startTransition(async () => {
    const res = await syncTrendyolProduct(businessId, productId);
    if ("error" in res) { toast.error(res.error); return; }
    toast.success("Retrimis pe Trendyol.");
    await incarcaPagina();
    router.refresh();
  });

  const areFiltre = cautare !== "" || categorie !== "" || status !== "toate";
  const total = date?.total ?? 0;
  const totalPagini = date?.totalPages ?? 1;

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-base font-semibold text-foreground mb-1">Produse</h2>
      <p className="text-sm text-muted-foreground mb-4">Completează detaliile de listare pentru fiecare produs, apoi trimite-l pe Trendyol.</p>

      {/* Căutare + filtre */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Caută după numele produsului"
            className="w-full rounded-lg border border-border bg-background pl-9 pr-8 py-2 text-sm" />
          {q && (
            <button onClick={() => setQ("")} className="absolute right-3 top-2.5" aria-label="Șterge căutarea">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
        <select value={status} onChange={(e) => { setIncarca(true); setStatus(e.target.value as TrendyolProductStatusFilter); setPagina(1); }}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
          {FILTRE.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        {categories.length > 0 && (
          <select value={categorie} onChange={(e) => { setIncarca(true); setCategorie(e.target.value); setPagina(1); }}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm max-w-[14rem]">
            <option value="">Toate categoriile</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 mb-2 text-xs text-muted-foreground">
        <span>
          {incarca ? "Se încarcă..." : (
            <>
              {total} {total === 1 ? "produs" : "produse"}
              {date?.truncat ? " (primele găsite; restrânge căutarea pentru toate)" : ""}
            </>
          )}
        </span>
        {areFiltre && (
          <button onClick={() => { setIncarca(true); setQ(""); setCategorie(""); setStatus("toate"); setPagina(1); }}
            className="text-primary hover:underline">Șterge filtrele</button>
        )}
      </div>

      {eroare && <p className="text-sm text-red-600 py-4">{eroare}</p>}

      {!eroare && !incarca && total === 0 && (
        <p className="text-sm text-muted-foreground py-6 text-center">
          {areFiltre ? "Niciun produs pentru filtrele alese." : "Nu ai produse de listat încă."}
        </p>
      )}

      {incarca && !date && (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Se încarcă produsele...
        </div>
      )}

      <div className={`divide-y divide-border ${incarca ? "opacity-60" : ""}`}>
        {(date?.items ?? []).map((p) => {
          const status = p.status ? (STATUS_LABEL[p.status] ?? { text: p.status, cls: "bg-muted text-muted-foreground" }) : null;
          const isOpen = openId === p.id;
          return (
            <div key={p.id} className="py-3">
              <div className="flex items-center justify-between gap-3">
                <button onClick={() => setOpenId(isOpen ? null : p.id)} className="flex items-center gap-2 min-w-0 text-left">
                  {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.category ?? "Fără categorie"}</p>
                  </div>
                </button>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {status ? (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${status.cls}`}>{status.text}</span>
                  ) : (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Nelistat</span>
                  )}
                  {p.status === "error" && (
                    <button onClick={() => retry(p.id)} disabled={pending} className="text-xs text-primary hover:underline disabled:opacity-60">Reîncearcă</button>
                  )}
                  {p.status && (
                    <button onClick={() => remove(p.id)} disabled={pending} className="text-xs text-muted-foreground hover:text-red-600 disabled:opacity-60">Elimină</button>
                  )}
                </div>
              </div>

              {p.error && <p className="text-xs text-red-600 mt-1 ml-6">{p.error}</p>}

              {isOpen && (
                <div className="mt-3 ml-6">
                  <TrendyolListingEditor businessId={businessId} productId={p.id} storefront={storefront}
                    onClose={() => setOpenId(null)} onSaved={incarcaPagina} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {totalPagini > 1 && (
        <div className="flex items-center justify-between gap-3 pt-4 mt-2 border-t border-border">
          <button onClick={() => { setIncarca(true); setPagina((p) => Math.max(1, p - 1)); }} disabled={pagina <= 1 || incarca}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed">
            <ChevronLeft className="h-3.5 w-3.5" /> Înapoi
          </button>
          <span className="text-xs text-muted-foreground">Pagina {pagina} din {totalPagini}</span>
          <button onClick={() => { setIncarca(true); setPagina((p) => Math.min(totalPagini, p + 1)); }} disabled={pagina >= totalPagini || incarca}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed">
            Înainte <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
