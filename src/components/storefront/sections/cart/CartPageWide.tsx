"use client";

import { ArrowLeft, ShieldCheck } from "lucide-react";
import { useStoreChromeOptional } from "@/components/storefront/StorefrontProvider";
import { CartRecommendations } from "@/components/ministore/CartRecommendations";
import { lineKey, useCart } from "@/components/storefront/cart/CartProvider";
import { computeCartPricing } from "@/lib/storefront/cart/pricing";
import { CartLine, CosGol, ProgresTransport, RezumatCos, ScheletCos } from "./_shared/CartPieces";
import type { CartPageProps } from "./cart-page.types";

/**
 * Pagina de cos, modelul „pe toata latimea".
 *
 * O singura coloana centrata, cu produsele mari si totalurile dedesubt, in
 * ordinea in care se citeste pagina: ce cumperi, cat costa, ce urmeaza. Fara
 * bara laterala si fara nimic lipit — potrivita magazinelor cu cosuri mici, unde
 * o coloana de rezumat langa doua produse arata goala.
 *
 * Pe telefon nu se schimba nimic structural, doar se stramteaza: aceeasi pagina,
 * nu alta.
 */
export function CartPageWide({
  color,
  basePath,
  businessId,
  shippingCost,
  freeShippingThreshold,
  minOrderAmount,
  vat,
  onCheckout,
  settings,
  preview = false,
}: CartPageProps) {
  /*
   * Iesirea din palnie duce la PRODUSE, nu la radacina magazinului.
   *
   * Cand catalogul si-a luat pagina lui, pagina principala nu mai are grila:
   * clientul care apasa „continua cumparaturile" ajungea intr-o pagina de
   * prezentare fara niciun produs. Optional fiindca miniatura din editor
   * randeaza fara chrome.
   */
  const chromeCatalog = useStoreChromeOptional();
  const catreProduse = chromeCatalog?.catalogRoot ?? `${basePath}/`;
  const { items, addItem, updateQty, removeItem, total, count, hydrated } = useCart();
  const pricing = computeCartPricing({ total, shippingCost, freeShippingThreshold, minOrderAmount, vat });
  const areRecomandari = settings.showRecommendations !== false && !preview;
  const arePrag = settings.showProgress !== false;

  // Cosul vine din localStorage dupa montare: pana atunci nu se stie nici ce e in
  // el, nici daca e gol. Un ecran de cos gol aratat o clipa sperie degeaba, iar
  // lista si totalurile randate cu cosul inca necitit arata cifre false.
  if (!hydrated) return <ScheletCos latime="max-w-3xl" />;
  if (items.length === 0) return <CosGol basePath={basePath} color={color} />;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 lg:py-12">
      <div className="flex items-baseline justify-between gap-3 mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Cosul tau</h1>
        {/* BUCATI, nu linii: insigna din header si celelalte modele de cos
            numara tot bucati, iar doua numere diferite pentru acelasi cos se vad
            simultan pe acelasi ecran. */}
        <span className="text-sm text-muted-foreground">
          {count} {count === 1 ? "produs" : "produse"}
        </span>
      </div>

      {arePrag && (
        <div className="mb-6">
          <ProgresTransport pricing={pricing} color={color} />
        </div>
      )}

      <div className="divide-y divide-border border-y border-border">
        {items.map((item) => (
          <CartLine key={lineKey(item)} item={item} color={color}
            basePath={basePath} onQty={updateQty} onRemove={removeItem} />
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <RezumatCos total={total} pricing={pricing} color={color} minOrderAmount={minOrderAmount} onCheckout={onCheckout} />
        <p className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          Plata securizata, retur in 14 zile
        </p>
      </div>

      <a href={catreProduse}
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
