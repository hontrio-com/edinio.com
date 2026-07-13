"use client";

import Image from "next/image";
import { Package, Check } from "lucide-react";
import { formatPrice } from "@/lib/utils/format";
import type { ResolvedOffer } from "@/lib/offers/offer.types";

/**
 * Checkout order bump: a real, discounted product the customer adds with one tap,
 * right before placing the order. The special price is authoritative (computed
 * server-side in resolveCartOffers); accepting a bump sends its offer id so the
 * order path re-prices the line — the client price is only a preview.
 *
 * Renders nothing when there are no applicable bumps, so checkout is unchanged.
 */
export function OrderBump({ bumps, color, acceptedIds, onToggle }: {
  bumps: ResolvedOffer[];
  color: string;
  acceptedIds: Set<string>;
  onToggle: (offer: ResolvedOffer, checked: boolean) => void;
}) {
  const valid = bumps.filter((o) => o.type === "order_bump" && o.products.length > 0 && o.pricing);
  if (valid.length === 0) return null;

  return (
    <div className="space-y-2">
      {valid.map((o) => {
        const p = o.products[0];
        const checked = acceptedIds.has(o.id);
        const price = o.pricing!.price;
        const compareAt = o.pricing!.compareAt;
        const hasDiscount = compareAt > price;
        return (
          <button key={o.id} type="button" onClick={() => onToggle(o, !checked)}
            className="w-full text-left rounded-xl border-2 border-dashed p-3 transition-all"
            style={checked
              ? { borderColor: color, backgroundColor: `${color}0d` }
              : { borderColor: "var(--color-border)", backgroundColor: "transparent" }}>
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded flex items-center justify-center border-2 flex-shrink-0 transition-colors"
                style={checked ? { borderColor: color, backgroundColor: color } : { borderColor: "var(--color-border)" }}>
                {checked && <Check size={12} className="text-white" strokeWidth={3} />}
              </div>
              <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-border bg-muted/40 shrink-0">
                {p.imageUrl
                  ? <Image src={p.imageUrl} alt={p.name} fill sizes="48px" className="object-contain p-1" />
                  : <div className="w-full h-full flex items-center justify-center"><Package size={16} className="text-muted-foreground/50" /></div>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wide truncate" style={{ color }}>{o.title}</p>
                <p className="text-sm font-semibold text-foreground leading-tight truncate">{p.name}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold" style={{ color }}>{formatPrice(price)}</p>
                {hasDiscount && <p className="text-xs text-muted-foreground line-through">{formatPrice(compareAt)}</p>}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
