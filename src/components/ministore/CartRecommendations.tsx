"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Plus, Check, Package, ChevronRight } from "lucide-react";
import { formatPrice } from "@/lib/utils/format";
import { getCartCrossSell } from "@/lib/actions/offer.actions";
import type { OfferProduct } from "@/lib/offers/offer.types";

/**
 * Cross-sell row inside the cart drawer ("S-ar putea sa-ti placa"). Pure recommendation
 * (no discount): tapping "+" adds the product to the cart via the existing CartProvider.
 * Renders nothing when there are no applicable recommendations, so the drawer is
 * unchanged for stores without offers.
 */
export function CartRecommendations({ businessId, color, basePath, cartProductIds, onAdd }: {
  businessId: string;
  color: string;
  basePath: string;
  cartProductIds: string[];
  onAdd: (p: OfferProduct) => void;
}) {
  const [recs, setRecs] = useState<OfferProduct[]>([]);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const cartKey = cartProductIds.join(",");

  useEffect(() => {
    // Mounted only when the cart is non-empty (gated by the drawer), so no empty guard.
    let cancelled = false;
    getCartCrossSell(businessId, cartProductIds).then((offers) => {
      if (cancelled) return;
      // Flatten all cross-sell products, dedupe, drop cart items + out-of-stock.
      const seen = new Set(cartProductIds);
      const flat: OfferProduct[] = [];
      for (const o of offers) for (const p of o.products) {
        if (!seen.has(p.id) && !p.outOfStock) { seen.add(p.id); flat.push(p); }
      }
      setRecs(flat.slice(0, 6));
    }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, cartKey]);

  if (recs.length === 0) return null;

  function handleAdd(p: OfferProduct) {
    onAdd(p);
    setAdded((prev) => new Set(prev).add(p.id));
    setTimeout(() => setAdded((prev) => { const n = new Set(prev); n.delete(p.id); return n; }), 1500);
  }

  return (
    <div className="px-5 py-4 border-t border-border">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">S-ar putea sa-ti placa</p>
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
        {recs.map((p) => (
          <div key={p.id} className="w-32 shrink-0">
            <a href={p.slug ? `${basePath}/product/${p.slug}` : basePath || "/"}
              className="block relative w-32 h-32 rounded-xl overflow-hidden border border-border bg-muted/40">
              {p.imageUrl
                ? <Image src={p.imageUrl} alt={p.name} fill sizes="128px" className="object-contain p-2" />
                : <div className="w-full h-full flex items-center justify-center"><Package className="h-7 w-7 text-muted-foreground/40" /></div>}
            </a>
            <p className="text-xs font-medium text-foreground mt-1.5 line-clamp-2 leading-snug">{p.name}</p>
            <div className="flex items-center justify-between gap-1 mt-1">
              <span className="text-xs font-bold text-foreground">{formatPrice(p.price)}</span>
              {p.hasVariants ? (
                /* Variable product — send the shopper to its page to choose options. */
                <a href={p.slug ? `${basePath}/product/${p.slug}` : basePath || "/"} aria-label={`Alege optiunile pentru ${p.name}`}
                  className="w-6 h-6 rounded-md flex items-center justify-center text-white shrink-0 transition-transform active:scale-90"
                  style={{ backgroundColor: color }}>
                  <ChevronRight size={13} />
                </a>
              ) : (
                <button type="button" onClick={() => handleAdd(p)} aria-label={`Adauga ${p.name}`}
                  className="w-6 h-6 rounded-md flex items-center justify-center text-white shrink-0 transition-transform active:scale-90"
                  style={{ backgroundColor: color }}>
                  {added.has(p.id) ? <Check size={13} /> : <Plus size={13} />}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
