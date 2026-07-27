"use client";

import { ArrowLeft } from "lucide-react";
import { formatPrice } from "@/lib/utils/format";
import { CartRecommendations } from "@/components/ministore/CartRecommendations";
import { useCart } from "@/components/storefront/cart/CartProvider";
import { computeCartPricing } from "@/lib/storefront/cart/pricing";
import { CartLine, CosGol, ProgresTransport, RezumatCos } from "./_shared/CartPieces";
import type { CartPageProps } from "./cart-page.types";

/**
 * Pagina de cos, modelul „doua coloane".
 *
 * Asezarea pe care o are majoritatea magazinelor: produsele la stanga, pe toata
 * latimea de care au nevoie, si un card de rezumat la dreapta care ramane lipit
 * cand se deruleaza lista. Potrivita cosurilor mari, unde clientul vrea sa vada
 * totalul in timp ce ajusteaza cantitatile.
 *
 * Pe telefon coloanele dispar: lista curge normal, iar butonul de finalizare se
 * lipeste jos, ca sa nu trebuiasca derulat pana la capat pentru a comanda.
 */
export function CartPageSplit({
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
  const { items, addItem, updateQty, removeItem, total, hydrated } = useCart();
  const pricing = computeCartPricing({ total, shippingCost, freeShippingThreshold, minOrderAmount });
  const areRecomandari = settings.showRecommendations !== false && !preview;
  const arePrag = settings.showProgress !== false;

  // Cosul vine din localStorage dupa montare: pana atunci „gol" inca nu inseamna
  // gol, iar un ecran de cos gol aratat o clipa la fiecare incarcare sperie degeaba.
  if (hydrated && items.length === 0) return <CosGol basePath={basePath} color={color} />;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 lg:py-12 pb-28 lg:pb-12">
      <h1 className="text-2xl lg:text-3xl font-bold text-foreground mb-6 lg:mb-8">Cosul tau</h1>

      <div className="lg:grid lg:grid-cols-[1fr_360px] lg:gap-10 lg:items-start">
        <div className="min-w-0">
          {arePrag && (
            <div className="mb-6">
              <ProgresTransport pricing={pricing} color={color} areaPrag={freeShippingThreshold !== null} />
            </div>
          )}

          <div className="divide-y divide-border border-y border-border">
            {items.map((item) => (
              <CartLine key={`${item.productId}${item.variantTitle ?? ""}`} item={item} color={color}
                basePath={basePath} onQty={updateQty} onRemove={removeItem} />
            ))}
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

        {/* Rezumatul ramane la vedere cat timp se deruleaza lista. */}
        <aside className="hidden lg:block lg:sticky lg:top-24 rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Rezumatul comenzii</h2>
          <RezumatCos total={total} pricing={pricing} color={color} minOrderAmount={minOrderAmount} onCheckout={onCheckout} />
        </aside>
      </div>

      {/* Pe telefon rezumatul coboara sub lista, iar actiunea ramane la indemana. */}
      <div className="lg:hidden mt-8 rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4">Rezumatul comenzii</h2>
        <RezumatCos total={total} pricing={pricing} color={color} minOrderAmount={minOrderAmount} onCheckout={onCheckout} />
      </div>

      {!preview && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-surface border-t border-border px-4 py-3"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
          <button type="button" onClick={onCheckout} disabled={pricing.belowMinOrder}
            className="w-full flex items-center justify-between gap-3 py-3 px-4 rounded-xl text-white font-bold text-sm active:scale-[0.98] transition-transform disabled:opacity-50 disabled:pointer-events-none"
            style={{ backgroundColor: color }}>
            <span>Finalizeaza comanda</span>
            <span className="tabular-nums">{formatPrice(pricing.grandTotal)}</span>
          </button>
        </div>
      )}
    </div>
  );
}
