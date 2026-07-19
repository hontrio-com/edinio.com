"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  publishAllAboutYou, removeAboutYouListing, syncAboutYouProduct, syncAllAboutYou,
  type AboutYouListingRow,
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
  businessId, products, listings, pricing,
}: {
  businessId: string; products: ProductLite[]; listings: AboutYouListingRow[]; pricing: AboutYouPricing;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);

  const byProduct = new Map(listings.map((l) => [l.product_id, l]));

  const remove = (productId: string) => {
    if (!window.confirm("Elimini această listare de pe About You?")) return;
    startTransition(async () => {
      const res = await removeAboutYouListing(businessId, productId);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Listare eliminată.");
      router.refresh();
    });
  };

  const syncAll = () => startTransition(async () => {
    const res = await syncAllAboutYou(businessId);
    if ("error" in res) { toast.error(res.error); return; }
    toast.success(res.queued > 0 ? `${res.queued} produse trimise în coadă.` : "Nu există listări de trimis.");
    router.refresh();
  });

  const publishAll = () => startTransition(async () => {
    const res = await publishAllAboutYou(businessId);
    if ("error" in res) { toast.error(res.error); return; }
    toast.success(res.queued > 0 ? `${res.queued} produse programate pentru publicare.` : "Nu există ciorne de publicat.");
    router.refresh();
  });

  const retry = (productId: string) => startTransition(async () => {
    const res = await syncAboutYouProduct(businessId, productId);
    if ("error" in res) { toast.error(res.error); return; }
    toast.success("Retrimis pe About You.");
    router.refresh();
  });

  if (products.length === 0) {
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
      <p className="text-sm text-muted-foreground mb-4">
        Completează detaliile de listare pentru fiecare produs, apoi trimite-l pe About You.
      </p>

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
    </div>
  );
}
