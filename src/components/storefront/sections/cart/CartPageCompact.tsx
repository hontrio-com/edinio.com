"use client";

import { ArrowLeft } from "lucide-react";
import { formatPrice } from "@/lib/utils/format";
import { CartRecommendations } from "@/components/ministore/CartRecommendations";
import { useCart } from "@/components/storefront/cart/CartProvider";
import { computeCartPricing } from "@/lib/storefront/cart/pricing";
import { CartLine, CosGol, ProgresTransport } from "./_shared/CartPieces";
import type { CartPageProps } from "./cart-page.types";

/**
 * Pagina de cos, modelul „compact".
 *
 * Liniile sunt dese, cu imagine mica, iar totalul si butonul stau intr-o bara
 * lipita de marginea de jos a ecranului, vizibila tot timpul cat se deruleaza
 * lista. Cine are zece produse in cos nu mai trebuie sa ajunga la capatul
 * paginii ca sa comande.
 *
 * Jos, nu sus: o bara lipita sus ar aluneca sub header-ul magazinului, care e si
 * el lipit si are z-index mai mare, deci ar disparea exact cand incepe derularea.
 *
 * Aceeasi forma pe telefon si pe calculator.
 */
export function CartPageCompact({
  color,
  basePath,
  businessId,
  shippingCost,
  freeShippingThreshold,
  minOrderAmount,
  onCheckout,
  settings,
  preview = false,
}: CartPageProps) {
  const { items, addItem, updateQty, removeItem, total, count, hydrated } = useCart();
  const pricing = computeCartPricing({ total, shippingCost, freeShippingThreshold, minOrderAmount });
  const areRecomandari = settings.showRecommendations !== false && !preview;
  const arePrag = settings.showProgress !== false;

  // Cosul vine din localStorage dupa montare: pana atunci „gol" inca nu inseamna
  // gol, iar un ecran de cos gol aratat o clipa la fiecare incarcare sperie degeaba.
  if (hydrated && items.length === 0) return <CosGol basePath={basePath} color={color} />;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 lg:py-10">
      <div className="flex items-baseline justify-between gap-3 mb-5">
        <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Cosul tau</h1>
        <span className="text-sm text-muted-foreground">
          {count} {count === 1 ? "produs" : "produse"}
        </span>
      </div>

      {arePrag && (
        <div className="mb-5">
          <ProgresTransport pricing={pricing} color={color} areaPrag={freeShippingThreshold !== null} />
        </div>
      )}

      <div className="divide-y divide-border border-t border-border">
        {items.map((item) => (
          <CartLine key={`${item.productId}${item.variantTitle ?? ""}`} item={item} color={color}
            basePath={basePath} onQty={updateQty} onRemove={removeItem} dens="compact" />
        ))}
      </div>

      {pricing.belowMinOrder && minOrderAmount !== null && (
        <p className="mt-4 text-xs text-muted-foreground">
          Comanda minima este <strong className="text-foreground">{formatPrice(minOrderAmount)}</strong>.
          Mai adauga <strong className="text-foreground">{formatPrice(pricing.minOrderRemaining)}</strong> pentru a finaliza.
        </p>
      )}

      {/* Bara de actiune. In miniatura nu se lipeste: n-ar avea pe ce. */}
      <div className={`${preview ? "" : "sticky bottom-0 z-20"} -mx-4 sm:-mx-6 mt-5 bg-surface border-t border-border px-4 sm:px-6 py-3`}
        style={preview ? undefined : { paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
        <div className="flex items-center gap-4">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">
              {pricing.shipping === 0 ? "Livrare gratuita" : `Transport ${formatPrice(pricing.shipping)}`}
            </p>
            <p className="text-base font-bold text-foreground tabular-nums truncate">{formatPrice(pricing.grandTotal)}</p>
          </div>
          <button type="button" onClick={onCheckout} disabled={pricing.belowMinOrder}
            className="ml-auto shrink-0 h-11 px-5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-foreground/30"
            style={{ backgroundColor: color }}>
            Finalizeaza comanda
          </button>
        </div>
      </div>

      <a href={`${basePath}/`}
        className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" />
        Continua cumparaturile
      </a>

      {areRecomandari && (
        <div className="mt-10">
          <CartRecommendations businessId={businessId} color={color} basePath={basePath}
            cartProductIds={items.map((i) => i.productId)}
            onAdd={(p) => addItem({ productId: p.id, slug: p.slug ?? undefined, name: p.name, price: p.price, imageUrl: p.imageUrl })} />
        </div>
      )}
    </div>
  );
}
