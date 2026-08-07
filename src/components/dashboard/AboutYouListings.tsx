"use client";

import { useCallback, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { useCautareIntarziata } from "@/lib/hooks/cautare-intarziata";
import {
  getAboutYouProductPage, publishAllAboutYou, removeAboutYouListing, syncAboutYouProduct,
  syncAllAboutYou, type AboutYouListingRow, type AboutYouProductPage,
} from "@/lib/actions/aboutyou.actions";
import { AboutYouListingEditor, type AboutYouPricing } from "@/components/dashboard/AboutYouListingEditor";

interface ProductLite { id: string; name: string; category: string | null; is_active: boolean }

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  active: { text: "Activ pe About You", cls: "bg-green-100 text-green-700" },
  pending: { text: "În așteptare", cls: "bg-amber-100 text-amber-700" },
  pending_approval: { text: "În aprobare", cls: "bg-amber-100 text-amber-700" },
  pending_active: { text: "Se activează", cls: "bg-amber-100 text-amber-700" },
  draft: { text: "Ciornă", cls: "bg-muted text-muted-foreground" },
  inactive: { text: "Inactiv", cls: "bg-muted text-muted-foreground" },
  rejected: { text: "Respins", cls: "bg-red-100 text-red-700" },
  problem: { text: "Problemă", cls: "bg-red-100 text-red-700" },
  error: { text: "Eroare", cls: "bg-red-100 text-red-700" },
};

export function AboutYouListings({
  businessId, pagina, pricing,
}: {
  businessId: string; pagina: AboutYouProductPage; pricing: AboutYouPricing;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);

  /*
   * Paginarea si cautarea se fac pe SERVER: la o mie de produse lista nici nu
   * incapea in pagina, iar produsele aflate dupa prima suta de listari se afisau
   * ca „Nelistat" chiar daca erau demult pe About You.
   *
   * Prima pagina vine de pe server; de aici incolo componenta isi tine singura
   * starea si si-o reimprospateaza dupa fiecare actiune. O sincronizare din prop
   * ar arunca cautarea si pagina curenta la fiecare `router.refresh()`.
   */
  const [stare, setStare] = useState<AboutYouProductPage>(pagina);
  const [seIncarca, setSeIncarca] = useState(false);

  const incarca = useCallback(async (p: number, q: string) => {
    setSeIncarca(true);
    try {
      const res = await getAboutYouProductPage(businessId, p, q);
      if ("error" in res) { toast.error(res.error); return null; }
      setStare(res);
      setOpenId(null);
      return res;
    } catch {
      // O actiune de server poate cadea si din retea, nu doar cu `{error}`.
      // Fara asta, indicatorul de incarcare ramanea aprins pentru totdeauna.
      toast.error("Nu am putut încărca lista de produse.");
      return null;
    } finally {
      setSeIncarca(false);
    }
  }, [businessId]);

  const { termen: cautare, setTermen: setCautare } = useCautareIntarziata<AboutYouProductPage | null>(
    (q) => incarca(1, q),
    { minLungime: 1 },
  );

  const products: ProductLite[] = stare.products;

  // Eliminarea sterge listarea, deci randul trece sigur pe "Nelistat": o aratam
  // imediat. Restul butoanelor (trimite / publica / reincearca) pun treaba la coada
  // pe server si nu au un rezultat pe care sa-l putem ghici, deci raman ca inainte.
  const [listariAfisate, aplicaOptimistElimina] = useOptimistic(
    stare.listings,
    (st: AboutYouListingRow[], productId: string) => st.filter((l) => l.product_id !== productId),
  );

  const byProduct = new Map(listariAfisate.map((l) => [l.product_id, l]));

  const remove = (productId: string) => {
    if (!window.confirm("Elimini această listare de pe About You?")) return;
    startTransition(async () => {
      aplicaOptimistElimina(productId);
      const res = await removeAboutYouListing(businessId, productId);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Listare eliminată.");
      await incarca(stare.page, cautare);
      router.refresh();
    });
  };

  const syncAll = () => startTransition(async () => {
    const res = await syncAllAboutYou(businessId);
    if ("error" in res) { toast.error(res.error); return; }
    toast.success(res.queued > 0 ? `${res.queued} produse trimise în coadă.` : "Nu există listări de trimis.");
    await incarca(stare.page, cautare);
    router.refresh();
  });

  const publishAll = () => startTransition(async () => {
    const res = await publishAllAboutYou(businessId);
    if ("error" in res) { toast.error(res.error); return; }
    toast.success(res.queued > 0 ? `${res.queued} produse programate pentru publicare.` : "Nu există ciorne de publicat.");
    await incarca(stare.page, cautare);
    router.refresh();
  });

  const retry = (productId: string) => startTransition(async () => {
    const res = await syncAboutYouProduct(businessId, productId);
    if ("error" in res) { toast.error(res.error); return; }
    toast.success("Retrimis pe About You.");
    await incarca(stare.page, cautare);
    router.refresh();
  });

  if (products.length === 0 && !cautare) {
    return (
      <div className="rounded-xl border border-border bg-surface p-5 text-sm text-muted-foreground">
        Nu ai produse de listat încă.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h2 className="text-base font-semibold text-foreground">Produse</h2>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={syncAll} disabled={pending}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60">
            Trimite toate
          </button>
          <button onClick={publishAll} disabled={pending}
            className="rounded-lg border border-primary text-primary px-3 py-1.5 text-xs font-medium hover:bg-primary/10 disabled:opacity-60">
            Publică toate
          </button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground mb-3">
        Completează detaliile de listare pentru fiecare produs, apoi trimite-l pe About You.
      </p>

      <div className="relative mb-3">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <input
          value={cautare}
          onChange={(e) => {
            const v = e.target.value;
            setCautare(v);
            // Sub lungimea minima, hook-ul doar anuleaza cautarea in zbor — nu
            // cere nimic nou. Fara reincarcarea de aici, stergerea termenului
            // lasa lista filtrata pe vecie, iar la zero rezultate ecranul devenea
            // o fundatura din care nu se mai putea iesi.
            if (!v.trim()) void incarca(1, "");
          }}
          placeholder="Caută produs după nume"
          className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm"
        />
      </div>

      {products.length === 0 && (
        <p className="text-sm text-muted-foreground py-3">Niciun produs pentru „{cautare}”.</p>
      )}

      <div className="divide-y divide-border">
        {products.map((p) => {
          const listing = byProduct.get(p.id);
          const status = listing ? (STATUS_LABEL[listing.status] ?? { text: listing.status, cls: "bg-muted text-muted-foreground" }) : null;
          const isOpen = openId === p.id;
          return (
            <div key={p.id} className="py-3">
              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={() => setOpenId(isOpen ? null : p.id)}
                  className="flex items-center gap-2 min-w-0 text-left"
                >
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
                  {listing?.status === "error" && (
                    <button onClick={() => retry(p.id)} disabled={pending}
                      className="text-xs text-primary hover:underline disabled:opacity-60">
                      Reîncearcă
                    </button>
                  )}
                  {listing && (
                    <button onClick={() => remove(p.id)} disabled={pending}
                      className="text-xs text-muted-foreground hover:text-red-600 disabled:opacity-60">
                      Elimină
                    </button>
                  )}
                </div>
              </div>

              {listing?.error && (
                <p className="text-xs text-red-600 mt-1 ml-6">{listing.error}</p>
              )}

              {isOpen && (
                <div className="mt-3 ml-6">
                  <AboutYouListingEditor
                    businessId={businessId}
                    productId={p.id}
                    pricing={pricing}
                    onClose={() => setOpenId(null)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {stare.pages > 1 && (
        <div className="flex items-center justify-between gap-3 pt-4 mt-1 border-t border-border">
          <span className="text-xs text-muted-foreground">
            {stare.total} produse · pagina {stare.page} din {stare.pages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => void incarca(stare.page - 1, cautare)}
              disabled={seIncarca || stare.page <= 1}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-40"
            >
              Înapoi
            </button>
            <button
              onClick={() => void incarca(stare.page + 1, cautare)}
              disabled={seIncarca || stare.page >= stare.pages}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-40"
            >
              Înainte
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
