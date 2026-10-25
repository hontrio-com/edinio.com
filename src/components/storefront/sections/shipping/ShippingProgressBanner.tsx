"use client";

import { Check, Truck } from "lucide-react";
import { formatPrice } from "@/lib/utils/format";
import { useCart } from "@/components/storefront/cart/CartProvider";
import { useStorefront } from "@/components/storefront/StorefrontProvider";
import { computeCartPricing } from "@/lib/storefront/cart/pricing";

/**
 * Bara de progres catre pragul de livrare gratuita, varianta classic.
 * Se afiseaza doar cand sectiunea e pornita in design SI magazinul are un prag.
 *
 * ⚠ Fara a doua poarta pe `show_shipping_progress`: `enabled` din design se
 * deriva chiar din flagul acela cat timp ochiul din editor n-a spus altceva, iar
 * verificat inca o data aici, flagul bloca ochiul. Pragul ramane: fara el bara
 * n-are ce numara.
 */
export function ShippingProgressBanner() {
  const { color, freeShippingThreshold } = useStorefront();
  const { total } = useCart();

  if (!freeShippingThreshold) return null;

  // Aceeasi aritmetica pe care o folosesc sertarul si paginile de cos.
  const { shippingIsFree: isFree, freeShippingPct: pct } = computeCartPricing({
    total, shippingCost: 0, freeShippingThreshold, minOrderAmount: null,
  });

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
