"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ChevronRight } from "lucide-react";
import { removeTrendyolListing, syncTrendyolProduct, type TrendyolListingRow } from "@/lib/actions/trendyol.actions";
import { TrendyolListingEditor } from "@/components/dashboard/TrendyolListingEditor";

interface ProductLite { id: string; name: string; category: string | null; is_active: boolean }

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

export function TrendyolListings({
  businessId, products, listings, cargoCompanyIdDefault,
}: {
  businessId: string; products: ProductLite[]; listings: TrendyolListingRow[]; cargoCompanyIdDefault: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);

  const byProduct = new Map(listings.map((l) => [l.product_id, l]));

  const remove = (productId: string) => {
    if (!window.confirm("Elimini această listare de pe Trendyol?")) return;
    startTransition(async () => {
      const res = await removeTrendyolListing(businessId, productId);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Listare eliminată.");
      router.refresh();
    });
  };
  const retry = (productId: string) => startTransition(async () => {
    const res = await syncTrendyolProduct(businessId, productId);
    if ("error" in res) { toast.error(res.error); return; }
    toast.success("Retrimis pe Trendyol.");
    router.refresh();
  });

  if (products.length === 0) {
    return <div className="rounded-xl border border-border bg-surface p-5 text-sm text-muted-foreground">Nu ai produse de listat încă.</div>;
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-base font-semibold text-foreground mb-1">Produse</h2>
      <p className="text-sm text-muted-foreground mb-4">Completează detaliile de listare pentru fiecare produs, apoi trimite-l pe Trendyol.</p>

      <div className="divide-y divide-border">
        {products.map((p) => {
          const listing = byProduct.get(p.id);
          const status = listing ? (STATUS_LABEL[listing.status] ?? { text: listing.status, cls: "bg-muted text-muted-foreground" }) : null;
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
                  {listing?.status === "error" && (
                    <button onClick={() => retry(p.id)} disabled={pending} className="text-xs text-primary hover:underline disabled:opacity-60">Reîncearcă</button>
                  )}
                  {listing && (
                    <button onClick={() => remove(p.id)} disabled={pending} className="text-xs text-muted-foreground hover:text-red-600 disabled:opacity-60">Elimină</button>
                  )}
                </div>
              </div>

              {listing?.error && <p className="text-xs text-red-600 mt-1 ml-6">{listing.error}</p>}

              {isOpen && (
                <div className="mt-3 ml-6">
                  <TrendyolListingEditor businessId={businessId} productId={p.id} cargoCompanyIdDefault={cargoCompanyIdDefault} onClose={() => setOpenId(null)} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
