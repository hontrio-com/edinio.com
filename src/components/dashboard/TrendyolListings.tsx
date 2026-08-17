"use client";

import { useCallback, useEffect, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ChevronLeft, ChevronRight, Loader2, Search, Send, X } from "lucide-react";
import {
  bulkPublishTrendyol, getTrendyolProductIds, getTrendyolProductPage, pushTrendyolInventory,
  removeTrendyolListing, syncTrendyolProduct,
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
  // „Revizuire necesară" e chiar cuvantul din panoul Trendyol: produsul e la ei,
  // dar nu se vinde pana nu repari ce-ti cer. Nu e o respingere definitiva —
  // odata reparat, reintra singur in aprobare.
  rejected: { text: "Revizuire necesară", cls: "bg-amber-100 text-amber-800" },
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

  // Selectia traieste peste paginare: bifezi pe pagina 1, treci pe 2, bifezi si
  // acolo, apoi trimiti tot. Un Set, nu un vector: verificarea e pe fiecare rand.
  const [selectate, setSelectate] = useState<Set<string>>(new Set());
  const [trimite, setTrimite] = useState(false);
  const [progres, setProgres] = useState<{ facut: number; total: number } | null>(null);
  const [raport, setRaport] = useState<{ submitted: number; failed: number; errors: { product: string; message: string }[] } | null>(null);

  const comuta = (id: string) => setSelectate((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

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

  // Eliminarea sterge listarea, deci produsul ramane sigur "Nelistat". O aratam pe
  // loc, ca sa nu astepte doua drumuri la server (actiunea + reincarcarea paginii).
  // Trimiterea in masa si "Reincearca" nu intra aici: acolo raspunsul serverului
  // spune ce s-a intamplat, nu-l putem ghici.
  const [datePagina, aplicaOptimistElimina] = useOptimistic(
    date,
    (stare: TrendyolProductPage | null, productId: string) => stare && {
      ...stare,
      items: stare.items.map((i) => (i.id === productId ? { ...i, status: null, error: null } : i)),
    },
  );

  const remove = (productId: string) => {
    if (!window.confirm("Elimini această listare de pe Trendyol?")) return;
    startTransition(async () => {
      aplicaOptimistElimina(productId);
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
  /*
   * Preluarea stocului pe o listare adoptata.
   *
   * Din clipa asta, Edinio incepe sa impinga stocul si pretul si pentru produsul
   * ala — deci merita spus, nu doar facut.
   */
  const impingeStocul = (productId: string) => startTransition(async () => {
    const res = await pushTrendyolInventory(businessId, productId);
    if ("error" in res) { toast.error(res.error); return; }
    toast.success(res.trimis
      ? "Stocul și prețul au plecat spre Trendyol."
      : "Nu era nimic de trimis: produsul nu e (încă) listat pe Trendyol.");
    await incarcaPagina();
    router.refresh();
  });

  const idPagina = (date?.items ?? []).map((i) => i.id);
  const totPagina = idPagina.length > 0 && idPagina.every((id) => selectate.has(id));

  const comutaPagina = () => setSelectate((p) => {
    const n = new Set(p);
    if (totPagina) idPagina.forEach((id) => n.delete(id));
    else idPagina.forEach((id) => n.add(id));
    return n;
  });

  const selecteazaTot = () => startTransition(async () => {
    const res = await getTrendyolProductIds(businessId, { q: cautare, category: categorie, status });
    if ("error" in res) { toast.error(res.error); return; }
    setSelectate(new Set(res.ids));
    if (res.truncat) toast.info(`Am selectat primele ${res.ids.length}. Restrânge filtrele pentru restul.`);
  });

  /**
   * Trimiterea in masa, pe transe.
   *
   * O singura actiune cu mii de produse ar depasi timpul functiei si s-ar opri
   * fara sa spuna cat a apucat sa faca. Pe transe, progresul e vizibil si o transa
   * cazuta nu le anuleaza pe cele deja trimise.
   */
  const trimiteSelectia = async () => {
    const ids = [...selectate];
    if (ids.length === 0) return;
    if (!window.confirm(`Trimiți ${ids.length} ${ids.length === 1 ? "produs" : "produse"} pe Trendyol?`)) return;

    setTrimite(true);
    setRaport(null);
    setProgres({ facut: 0, total: ids.length });
    const cumulat = { submitted: 0, failed: 0, errors: [] as { product: string; message: string }[] };

    for (let i = 0; i < ids.length; i += 100) {
      const transa = ids.slice(i, i + 100);
      const res = await bulkPublishTrendyol(businessId, transa);
      if ("error" in res) { toast.error(res.error); break; }
      cumulat.submitted += res.submitted;
      cumulat.failed += res.failed;
      cumulat.errors.push(...res.errors);
      setProgres({ facut: Math.min(i + transa.length, ids.length), total: ids.length });
    }

    setTrimite(false);
    setProgres(null);
    setRaport(cumulat);
    if (cumulat.submitted > 0) {
      toast.success(`${cumulat.submitted} ${cumulat.submitted === 1 ? "produs trimis" : "produse trimise"} pe Trendyol.`);
      setSelectate(new Set());
    }
    if (cumulat.failed > 0 && cumulat.submitted === 0) toast.error("Niciun produs nu a putut fi trimis.");
    await incarcaPagina();
    router.refresh();
  };

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
        <span className="flex items-center gap-2">
          {idPagina.length > 0 && (
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={totPagina} onChange={comutaPagina} className="rounded" />
              Selectează pagina
            </label>
          )}
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

      {/* Bara de selecție: apare doar când există ceva selectat, ca să nu ocupe loc degeaba. */}
      {selectate.size > 0 && (
        <div className="flex items-center gap-3 flex-wrap rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 mb-3">
          <span className="text-sm font-medium text-foreground">
            {selectate.size} {selectate.size === 1 ? "produs selectat" : "produse selectate"}
          </span>
          {total > selectate.size && (
            <button onClick={selecteazaTot} disabled={pending || trimite}
              className="text-xs text-primary hover:underline disabled:opacity-60">
              Selectează toate cele {total}
            </button>
          )}
          <button onClick={() => setSelectate(new Set())} disabled={trimite}
            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-60">
            Deselectează
          </button>
          <button onClick={trimiteSelectia} disabled={trimite}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-60">
            {trimite ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {progres ? `Se trimite ${progres.facut}/${progres.total}...` : "Trimite pe Trendyol"}
          </button>
        </div>
      )}

      {/* Raportul rămâne pe ecran: la sute de produse, un toast trece prea repede. */}
      {raport && (
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 mb-3 text-xs">
          <div className="flex items-center justify-between gap-3">
            <span className="text-foreground">
              {raport.submitted} trimise, {raport.failed} cu probleme. Aprobarea durează câteva ore.
            </span>
            <button onClick={() => setRaport(null)} className="text-muted-foreground hover:text-foreground" aria-label="Închide raportul">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {raport.errors.length > 0 && (
            <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto">
              {raport.errors.map((e, i) => (
                <li key={i} className="text-red-600"><span className="font-medium">{e.product}:</span> {e.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}

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
        {(datePagina?.items ?? []).map((p) => {
          const status = p.status ? (STATUS_LABEL[p.status] ?? { text: p.status, cls: "bg-muted text-muted-foreground" }) : null;
          const isOpen = openId === p.id;
          return (
            <div key={p.id} className="py-3">
              <div className="flex items-center justify-between gap-3">
                <input type="checkbox" checked={selectate.has(p.id)} onChange={() => comuta(p.id)}
                  className="rounded flex-shrink-0" aria-label={`Selectează ${p.name}`} />
                <button onClick={() => setOpenId(isOpen ? null : p.id)} className="flex items-center gap-2 min-w-0 flex-1 text-left">
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
                  {/*
                    Listare ADOPTATA: produsul exista deja in contul Trendyol al
                    comerciantului, listat manual sau cu alt tool. L-am legat ca
                    sa curga comenzile, dar nu-i atingem pretul si stocul puse
                    acolo — asta o spune eticheta, iar butonul e cum preia el.
                  */}
                  {p.adoptata && (
                    <>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-700"
                        title="Produsul exista deja pe Trendyol, listat pe alta cale. Edinio l-a legat, dar nu-i schimba stocul si pretul.">
                        Preluat
                      </span>
                      <button onClick={() => impingeStocul(p.id)} disabled={pending}
                        className="text-xs text-primary hover:underline disabled:opacity-60"
                        title="Trimite acum stocul si pretul din Edinio catre Trendyol, pentru acest produs.">
                        Trimite stocul
                      </button>
                    </>
                  )}
                  {p.status === "error" && (
                    <button onClick={() => retry(p.id)} disabled={pending} className="text-xs text-primary hover:underline disabled:opacity-60">Reîncearcă</button>
                  )}
                  {p.status && (
                    <button onClick={() => remove(p.id)} disabled={pending} className="text-xs text-muted-foreground hover:text-red-600 disabled:opacity-60">Elimină</button>
                  )}
                </div>
              </div>

              {/*
                Motivul respingerii vine de la Trendyol tradus in romana si e
                lung (contine si indrumarea lor). Il aratam INTREG: e singurul
                lucru din care comerciantul poate afla ce sa repare. Pana acum
                nu-l vedea deloc — produsul aparea „in aprobare" la nesfarsit.
              */}
              {p.error && (
                <p className={`text-xs mt-1 ml-6 whitespace-pre-line ${p.status === "rejected" ? "text-amber-700" : "text-red-600"}`}>
                  {p.status === "rejected" && <span className="font-semibold">Trendyol cere o corectură: </span>}
                  {p.error}
                </p>
              )}

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
