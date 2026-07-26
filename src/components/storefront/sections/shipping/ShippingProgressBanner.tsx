"use client";

import { Check, Truck } from "lucide-react";
import { formatPrice } from "@/lib/utils/format";
import { useCart } from "@/components/storefront/cart/CartProvider";

/**
 * Bara de progres catre pragul de livrare gratuita, varianta classic.
 * Extrasa din `MiniStoreRenderer` fara schimbari de comportament.
 */
export function ShippingProgressBanner({ color, threshold }: { color: string; threshold: number }) {
  const { total } = useCart();
  const isFree = total >= threshold;
  const pct = Math.min(100, Math.round((total / threshold) * 100));

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
                ? <>Mai adauga <strong className="text-foreground">{formatPrice(threshold - total)}</strong> pentru livrare gratuita</>
                : <>Livrare gratuita la comenzi peste <strong className="text-foreground">{formatPrice(threshold)}</strong></>
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
