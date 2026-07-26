"use client";

import { Check, Truck } from "lucide-react";
import { formatPrice } from "@/lib/utils/format";
import { useCart } from "@/components/storefront/cart/CartProvider";
import { useStorefront } from "@/components/storefront/StorefrontProvider";

/**
 * Bara de progres catre pragul de livrare gratuita, varianta classic.
 * Se afiseaza doar cand comerciantul a pornit-o SI a setat un prag.
 */
export function ShippingProgressBanner() {
  const { pageContent, color, freeShippingThreshold } = useStorefront();
  const { total } = useCart();

  const pornita = pageContent.show_shipping_progress === true && freeShippingThreshold !== null;
  if (!pornita || !freeShippingThreshold) return null;

  const isFree = total >= freeShippingThreshold;
  const pct = Math.min(100, Math.round((total / freeShippingThreshold) * 100));

  return (
    <div className="mb-6 p-3.5 rounded-2xl border border-border bg-surface">
      {isFree ? (
        <div className="flex items-center gap-2" style={{ color }}>
          <Check className="h-4 w-4 flex-shrink-0" strokeWidth={3} />
          <span className="text-sm font-semibold">Felicitari! Ai obtinut livrare gratuita.</span>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">
              {total > 0
                ? <>Mai adauga <strong className="text-foreground">{formatPrice(freeShippingThreshold - total)}</strong> pentru livrare gratuita</>
                : <>Livrare gratuita la comenzi peste <strong className="text-foreground">{formatPrice(freeShippingThreshold)}</strong></>
              }
            </span>
            <Truck className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          </div>
          <div className="h-1.5 bg-border rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, backgroundColor: color }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
