"use client";

import { ArrowLeft } from "lucide-react";
import { CartRecommendations } from "@/components/ministore/CartRecommendations";
import { lineKey, useCart } from "@/components/storefront/cart/CartProvider";
import { computeCartPricing } from "@/lib/storefront/cart/pricing";
import { CartLine, CosGol, ProgresTransport, RezumatCos, ScheletCos } from "./_shared/CartPieces";
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

  // Cosul vine din localStorage dupa montare: pana atunci nu se stie nici ce e in
  // el, nici daca e gol. Un ecran de cos gol aratat o clipa sperie degeaba, iar
  // lista si totalurile randate cu cosul inca necitit arata cifre false.
  if (!hydrated) return <ScheletCos latime="max-w-6xl" />;
  if (items.length === 0) return <CosGol basePath={basePath} color={color} />;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 lg:py-12 pb-28 lg:pb-12">
      <h1 className="text-2xl lg:text-3xl font-bold text-foreground mb-6 lg:mb-8">Cosul tau</h1>

      <div className="lg:grid lg:grid-cols-[1fr_360px] lg:gap-10 lg:items-start">
        <div className="min-w-0">
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

        {/* Rezumatul ramane la vedere cat timp se deruleaza lista, oprit sub
            headerul lipit. Inaltimea headerului depinde de varianta aleasa (si
            creste cu bara de anunt), asa ca un decalaj scris de mana ii baga
            primele randuri — titlul si subtotalul — sub header, adica exact ce
            trebuia sa ramana la vedere. Rezerva acopera headerul classic cu bara
            de anunt (64 + 36 px) pana cand headerele emit `--st-header-offset`.
            `top` sta in stil, nu in clasa: sub `lg` cardul e ascuns si pozitionat
            static, deci valoarea n-are ce afecta. */}
        <aside className="hidden lg:block lg:sticky rounded-2xl border border-border bg-surface p-5"
          style={{ top: "calc(var(--st-header-offset, 100px) + 1rem)" }}>
          <h2 className="text-sm font-semibold text-foreground mb-4">Rezumatul comenzii</h2>
          <RezumatCos total={total} pricing={pricing} color={color} minOrderAmount={minOrderAmount} onCheckout={onCheckout} />
        </aside>
      </div>

      {/* Pe telefon rezumatul coboara sub lista, iar actiunea ramane la indemana. */}
      <div className="lg:hidden mt-8 rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4">Rezumatul comenzii</h2>
        <RezumatCos total={total} pricing={pricing} color={color} minOrderAmount={minOrderAmount} onCheckout={onCheckout} />
      </div>

      {/*
        Fara bara lipita jos.
        Pe telefon rezumatul coboara chiar sub lista si isi poarta propriul buton
        de finalizare, deci bara insemna acelasi buton de doua ori pe acelasi
        ecran — clientul se intreba care e „cel adevarat". Pe pagina de produs
        bara are sens: acolo actiunea e departe de degetul care deruleaza.
      */}
    </div>
  );
}
