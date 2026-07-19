"use client";

// Fulfillment panel for a Trendyol marketplace order, shown in the order detail in
// place of the courier-AWB panel. Trendyol ships with its own cargo, so the seller
// only advances the package Picking -> Invoiced; the cargo tracking number arrives
// automatically afterwards (via webhook/poll). Self-contained: loads its own state.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Package, Truck, Loader2, CheckCircle2 } from "lucide-react";
import {
  getTrendyolOrderFulfillment, markTrendyolPicking, markTrendyolInvoiced,
} from "@/lib/actions/trendyol.actions";
import type { TrendyolFulfillmentState } from "@/lib/trendyol/fulfillment";

const CARD = "rounded-2xl border border-border bg-card";
const SHIPPED = ["shipped", "delivered", "atcollectionpoint"];
const TERMINAL = ["cancelled", "unsupplied", "returned"];

function statusLabel(status: string): string {
  const s = (status || "").toLowerCase();
  if (SHIPPED.includes(s)) return "Expediat de Trendyol";
  if (TERMINAL.includes(s)) return "Anulat / retur";
  if (s === "invoiced") return "Facturat — se predă curierului Trendyol";
  if (s === "picking") return "În pregătire (Picking)";
  return "Comandă nouă";
}

export default function TrendyolFulfillmentPanel({ businessId, orderId }: { businessId: string; orderId: string }) {
  const router = useRouter();
  const [state, setState] = useState<TrendyolFulfillmentState | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    getTrendyolOrderFulfillment(businessId, orderId).then((res) => {
      if (!active) return;
      setState(res && "error" in res ? null : res);
      setLoading(false);
    });
    return () => { active = false; };
  }, [businessId, orderId]);

  function refresh() {
    getTrendyolOrderFulfillment(businessId, orderId).then((res) => {
      if (res && !("error" in res)) setState(res);
    });
    router.refresh();
  }

  function advance(fn: () => Promise<{ success: true; status: string } | { error: string }>, okMsg: string) {
    startTransition(async () => {
      const res = await fn();
      if ("error" in res) { toast.error(res.error); return; }
      toast.success(okMsg);
      refresh();
    });
  }

  if (loading) {
    return (
      <div className={`${CARD} p-4 flex items-center gap-2 text-sm text-muted-foreground`}>
        <Loader2 className="h-4 w-4 animate-spin" /> Se încarcă starea Trendyol...
      </div>
    );
  }
  if (!state) return null;

  const s = state.status.toLowerCase();
  const shipped = SHIPPED.includes(s);
  const terminal = TERMINAL.includes(s);
  const canPicking = ["created", "awaiting", "unpacked", "verified", ""].includes(s);
  const canInvoiced = s === "picking";

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
        <Truck className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">Expediere Trendyol</span>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/20 border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/integrations/trendyol.svg" alt="Trendyol" className="h-7 w-7 object-contain flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Pachet #{state.shipmentPackageId}</p>
            <p className="text-sm font-semibold text-foreground">{statusLabel(state.status)}</p>
          </div>
        </div>

        {state.cargoTrackingNumber && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-success/5 border border-success/20">
            <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
            <p className="text-sm font-mono font-bold text-success truncate">Cargo: {state.cargoTrackingNumber}</p>
          </div>
        )}

        {!shipped && !terminal && (canPicking || canInvoiced) && (
          <div className="space-y-2">
            <button type="button" disabled={pending || !canPicking}
              onClick={() => advance(() => markTrendyolPicking(businessId, orderId), "Pachet marcat „În pregătire” pe Trendyol.")}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg border border-border bg-muted/40 hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
              1. Marchează „În pregătire”
            </button>
            <button type="button" disabled={pending || !canInvoiced}
              onClick={() => advance(() => markTrendyolInvoiced(businessId, orderId), "Pachet marcat „Facturat” — Trendyol preia expedierea.")}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
              2. Marchează „Facturat” (predă curierului)
            </button>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Trendyol preia expedierea cu curierul contractat. După predarea coletului, statusul devine automat „Expediat” și primești numărul de tracking.
            </p>
          </div>
        )}

        {!shipped && !terminal && !canPicking && !canInvoiced && (
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Pachet facturat. Trendyol preia expedierea cu curierul contractat; statusul devine automat „Expediat” după predare.
          </p>
        )}
      </div>
    </div>
  );
}
