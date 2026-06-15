"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Package, Plus, Pencil, Trash2, Layers, Sparkles } from "lucide-react";
import { formatPrice } from "@/lib/utils/format";
import { deleteProduct } from "@/lib/actions/product.actions";

export interface BundleListItem {
  id: string;
  name: string;
  image_url: string | null;
  price: number;
  compare_at_price: number | null;
  is_active: boolean;
  component_count: number;
  savings: number;
  in_stock: boolean;
}

export function BundlesClient({ businessId, bundles }: { businessId: string; bundles: BundleListItem[] }) {
  const router = useRouter();
  const [deleting, startDelete] = useTransition();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  function remove(id: string) {
    startDelete(async () => {
      const res = await deleteProduct(id, businessId);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Pachet șters.");
      setConfirmId(null);
      router.refresh();
    });
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Layers className="h-6 w-6" /> Pachete</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Vinde produse grupate la un preț avantajos și crește valoarea coșului.</p>
        </div>
        <Link href="/dashboard/products/bundles/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-primary rounded-lg transition-all hover:opacity-90 shrink-0">
          <Plus className="h-4 w-4" /> Pachet nou
        </Link>
      </div>

      {bundles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card py-16 text-center px-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
            <Layers className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">Niciun pachet încă</p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-5">
            Grupează produse existente (ex: Șampon + Balsam + Mască) la un preț special. Pachetul apare ca un produs în magazin.
          </p>
          <Link href="/dashboard/products/bundles/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-primary rounded-lg hover:opacity-90 transition-all">
            <Plus className="h-4 w-4" /> Creează primul pachet
          </Link>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
          {bundles.map((b) => (
            <div key={b.id} className="flex items-center gap-4 px-4 py-3">
              <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-muted border border-border shrink-0">
                {b.image_url ? <Image src={b.image_url} alt={b.name} fill sizes="56px" className="object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Package className="h-5 w-5 text-muted-foreground" /></div>}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-foreground truncate">{b.name}</p>
                  {!b.is_active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">Inactiv</span>}
                  {!b.in_stock && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 dark:bg-amber-950/40 font-medium">Indisponibil</span>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{b.component_count} produse</p>
              </div>

              <div className="text-right shrink-0">
                <div className="flex items-center gap-2 justify-end">
                  <span className="text-sm font-bold text-foreground">{formatPrice(b.price)}</span>
                  {b.compare_at_price && b.compare_at_price > b.price && (
                    <span className="text-xs text-muted-foreground line-through">{formatPrice(b.compare_at_price)}</span>
                  )}
                </div>
                {b.savings > 0 && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-600"><Sparkles className="h-3 w-3" /> -{formatPrice(b.savings)}</span>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <Link href={`/dashboard/products/bundles/${b.id}/edit`}
                  className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                  <Pencil className="h-3.5 w-3.5" />
                </Link>
                {confirmId === b.id ? (
                  <button onClick={() => remove(b.id)} disabled={deleting}
                    className="px-2.5 h-9 rounded-lg bg-destructive text-white text-xs font-semibold hover:opacity-90 disabled:opacity-60">
                    Confirmă
                  </button>
                ) : (
                  <button onClick={() => setConfirmId(b.id)}
                    className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
