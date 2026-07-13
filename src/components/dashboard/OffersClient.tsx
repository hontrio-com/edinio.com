"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles, Plus, Pencil, Trash2, Search, Layers, Package, ShoppingCart, Eye, MousePointerClick } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toggleOffer, deleteOffer, type OfferRow } from "@/lib/actions/offer.actions";
import type { OfferType } from "@/lib/offers/offer.types";

const TYPE_LABEL: Record<OfferType, string> = {
  frequently_bought: "Cumparate impreuna",
  cross_sell: "Recomandari",
  order_bump: "Oferta la checkout",
  post_purchase: "Dupa cumparare",
  volume: "Reducere cantitate",
  bogo: "Cumpara X, primesti Y",
  gift: "Cadou",
  spend_reward: "Spend & save",
};

const TYPE_ICON: Record<string, typeof Layers> = {
  frequently_bought: Layers,
  cross_sell: Package,
  order_bump: ShoppingCart,
};

// Short "where it shows / what it offers" summary for the list row.
function summarize(o: OfferRow): string {
  const scope = o.trigger.scope === "all"
    ? "toate produsele"
    : o.trigger.scope === "categories"
      ? `${o.trigger.categories.length} categorii`
      : `${o.trigger.productIds.length} produse`;
  const offered = o.config.autoByCategory
    ? "auto din categorie"
    : `${o.config.productIds.length} ${o.config.productIds.length === 1 ? "produs" : "produse"}`;
  return `Apare la ${scope} · ofera ${offered}`;
}

export function OffersClient({ businessId, offers }: { businessId: string; offers: OfferRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return offers;
    return offers.filter((o) => o.name.toLowerCase().includes(q) || TYPE_LABEL[o.type].toLowerCase().includes(q));
  }, [offers, search]);

  function toggle(o: OfferRow) {
    startTransition(async () => {
      const res = await toggleOffer(o.id, businessId, !o.is_active);
      if ("error" in res) { toast.error(res.error); return; }
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await deleteOffer(id, businessId);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Oferta stearsa.");
      setConfirmId(null);
      router.refresh();
    });
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Sparkles className="h-6 w-6" /> Oferte</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Upsell, cross-sell si &quot;cumparate impreuna&quot; ca sa cresti valoarea comenzii.</p>
        </div>
        <Link href="/dashboard/offers/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-primary rounded-lg transition-all hover:opacity-90 shrink-0">
          <Plus className="h-4 w-4" /> Oferta noua
        </Link>
      </div>

      {offers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card py-16 text-center px-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
            <Sparkles className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">Nicio oferta inca</p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-5">
            Sugereaza produse care merg impreuna, adauga un produs la checkout sau grupeaza-le &quot;cumparate frecvent impreuna&quot;. Cresti valoarea medie a comenzii fara reclame in plus.
          </p>
          <Link href="/dashboard/offers/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-primary rounded-lg hover:opacity-90 transition-all">
            <Plus className="h-4 w-4" /> Creeaza prima oferta
          </Link>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cauta o oferta..."
              className="w-full pl-9 pr-3 py-2.5 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors" />
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card py-12 text-center px-4">
              <p className="text-sm text-muted-foreground">Nicio oferta pentru cautarea ta.</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
              {filtered.map((o) => {
                const Icon = TYPE_ICON[o.type] ?? Sparkles;
                return (
                  <div key={o.id} className="flex items-center gap-4 px-4 py-3">
                    <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Icon className="h-5 w-5" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-foreground truncate">{o.name}</p>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">{TYPE_LABEL[o.type]}</span>
                        {!o.is_active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">Inactiv</span>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{summarize(o)}</p>
                      {(o.impressions > 0 || o.conversions > 0) && (
                        <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" /> {o.impressions}</span>
                          <span className="inline-flex items-center gap-1"><MousePointerClick className="h-3 w-3" /> {o.conversions}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Switch checked={o.is_active} onCheckedChange={() => toggle(o)} disabled={pending} />
                      <Link href={`/dashboard/offers/${o.id}/edit`}
                        className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                        <Pencil className="h-3.5 w-3.5" />
                      </Link>
                      {confirmId === o.id ? (
                        <button onClick={() => remove(o.id)} disabled={pending}
                          className="px-2.5 h-9 rounded-lg bg-destructive text-white text-xs font-semibold hover:opacity-90 disabled:opacity-60">
                          Confirma
                        </button>
                      ) : (
                        <button onClick={() => setConfirmId(o.id)}
                          className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
