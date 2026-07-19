"use client";

import { Fragment, useState } from "react";
import Image from "next/image";
import { Package, ArrowRight, Plus, Check } from "lucide-react";
import { formatPrice } from "@/lib/utils/format";
import type { ResolvedOffer, OfferProduct } from "@/lib/offers/offer.types";
import { distributeFbtSavings } from "@/lib/offers/offer.types";

/**
 * Storefront offers on the product page:
 *  - "cumparate frecvent impreuna" (FBT): the anchor + companions at a combined price,
 *    added together via the buy-now modal (the discount is enforced server-side).
 *  - "merge bine cu" (cross_sell): a pure recommendation (no discount) — each card
 *    links to the product and, when onAddToCart is provided, offers a one-tap "Adauga".
 *
 * Fully additive: with no applicable offers this renders nothing and the product page
 * is byte-for-byte unchanged.
 */
export function ProductOffers({ offers, basePath, color, anchor, onBuyTogether, onAddToCart }: {
  offers: ResolvedOffer[];
  basePath: string;
  color: string;
  /** Current product, shown as the first item of an FBT set. */
  anchor?: { name: string; price: number; imageUrl: string | null };
  onBuyTogether?: (offer: ResolvedOffer) => void;
  onAddToCart?: (p: OfferProduct) => void;
}) {
  const fbt = offers.filter((o) => o.type === "frequently_bought" && o.products.length > 0 && o.pricing);
  const crossSell = offers.filter((o) => o.type === "cross_sell" && o.products.length > 0);
  if (fbt.length === 0 && crossSell.length === 0) return null;

  return (
    <section className="py-8 md:py-14 px-4 md:px-6 bg-background border-t border-border">
      <div className="max-w-6xl mx-auto space-y-10">
        {anchor && onBuyTogether && fbt.map((offer) => (
          <FbtCard key={offer.id} offer={offer} anchor={anchor} color={color} onBuyTogether={onBuyTogether} />
        ))}

        {crossSell.map((offer) => (
          <div key={offer.id}>
            <h2 className="text-xl md:text-2xl font-bold text-foreground tracking-tight mb-5">{offer.title}</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5">
              {offer.products.map((p) => (
                <OfferCard key={p.id} product={p} basePath={basePath} color={color} onAddToCart={onAddToCart} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─── Frequently bought together ──────────────────────────────────────────── */

function SetThumb({ name, imageUrl }: { name: string; imageUrl: string | null }) {
  return (
    <div className="relative w-16 h-16 md:w-20 md:h-20 rounded-xl overflow-hidden border border-border bg-muted/40 shrink-0">
      {imageUrl
        ? <Image src={imageUrl} alt={name} fill sizes="80px" className="object-contain p-1.5" />
        : <div className="w-full h-full flex items-center justify-center"><Package className="h-6 w-6 text-muted-foreground/40" /></div>}
    </div>
  );
}

function FbtCard({ offer, anchor, color, onBuyTogether }: {
  offer: ResolvedOffer;
  anchor: { name: string; price: number; imageUrl: string | null };
  color: string;
  onBuyTogether: (offer: ResolvedOffer) => void;
}) {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const compPrices = offer.products.map((p) => p.price);
  // Set price = current anchor price (variant-aware) + companions after their FBT share,
  // computed exactly like the checkout modal — so card, modal and charge always agree.
  const distributed = distributeFbtSavings(compPrices, offer.pricing!.savings);
  const setPrice = round2(anchor.price + distributed.reduce((s, p) => s + p, 0));
  const setCompareAt = round2(anchor.price + compPrices.reduce((s, p) => s + p, 0));
  const setSavings = round2(setCompareAt - setPrice);
  const hasSaving = setSavings > 0 && setCompareAt > setPrice;

  return (
    <div>
      <h2 className="text-xl md:text-2xl font-bold text-foreground tracking-tight mb-5">{offer.title}</h2>
      <div className="rounded-2xl border border-border bg-surface p-4 md:p-6 flex flex-col lg:flex-row lg:items-center gap-5">
        <div className="flex items-center gap-2 md:gap-3 flex-wrap flex-1">
          <SetThumb name={anchor.name} imageUrl={anchor.imageUrl} />
          {offer.products.map((p) => (
            <Fragment key={p.id}>
              <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
              <SetThumb name={p.name} imageUrl={p.imageUrl} />
            </Fragment>
          ))}
        </div>

        <div className="shrink-0 lg:text-right lg:min-w-[220px]">
          <div className="flex items-baseline gap-2 lg:justify-end mb-1">
            <span className="text-2xl font-bold text-foreground">{formatPrice(setPrice)}</span>
            {hasSaving && <span className="text-sm text-muted-foreground line-through">{formatPrice(setCompareAt)}</span>}
          </div>
          {hasSaving && (
            <p className="text-xs font-semibold mb-3" style={{ color }}>Economisesti {formatPrice(setSavings)}</p>
          )}
          <button type="button" onClick={() => onBuyTogether(offer)}
            className="w-full lg:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-bold text-white rounded-xl transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ backgroundColor: color, boxShadow: `0px 2px 12px ${color}55` }}>
            {offer.buttonLabel || "Cumpara impreuna"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Cross-sell card (link + optional one-tap add) ───────────────────────── */

function OfferCard({ product, basePath, color, onAddToCart }: {
  product: OfferProduct; basePath: string; color: string; onAddToCart?: (p: OfferProduct) => void;
}) {
  const [added, setAdded] = useState(false);
  const href = product.slug ? `${basePath}/product/${product.slug}` : basePath || "/";
  const hasDiscount = product.compareAtPrice != null && product.compareAtPrice > product.price;

  function handleAdd() {
    if (!onAddToCart || product.outOfStock) return;
    onAddToCart(product);
    setAdded(true);
    setTimeout(() => setAdded(false), 1600);
  }

  return (
    <div className="group bg-surface border border-border rounded-2xl overflow-hidden flex flex-col hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
      <a href={href} className="block relative aspect-square bg-muted/40 overflow-hidden">
        {product.imageUrl
          ? <Image src={product.imageUrl} alt={product.name} fill sizes="(max-width:1024px) 50vw, 25vw" className="object-contain p-2 group-hover:scale-105 transition-transform duration-300" />
          : <div className="w-full h-full flex items-center justify-center"><Package className="h-8 w-8 text-muted-foreground/40" /></div>}
        {hasDiscount && (
          <span className="absolute top-2 right-2 text-white text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: color }}>
            -{Math.round((1 - product.price / product.compareAtPrice!) * 100)}%
          </span>
        )}
        {product.outOfStock && (
          <span className="absolute top-2 left-2 bg-black/60 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">Stoc epuizat</span>
        )}
      </a>
      <div className="p-3 flex flex-col flex-1 gap-2">
        <a href={href} className="block">
          <p className="text-sm font-medium text-foreground leading-snug line-clamp-2 hover:opacity-70 transition-opacity">{product.name}</p>
        </a>
        <div className="mt-auto flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className="text-sm font-bold text-foreground">{formatPrice(product.price)}</span>
            {hasDiscount && <span className="text-xs text-muted-foreground line-through">{formatPrice(product.compareAtPrice!)}</span>}
          </div>
          {onAddToCart && !product.hasVariants ? (
            <button type="button" onClick={handleAdd} disabled={product.outOfStock} aria-label={`Adauga ${product.name}`}
              className="shrink-0 inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs font-semibold text-white transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: color }}>
              {product.outOfStock ? "Epuizat" : added ? <><Check className="h-3.5 w-3.5" /> Adaugat</> : <><Plus className="h-3.5 w-3.5" /> Adauga</>}
            </button>
          ) : (
            /* Variable product (or link-only card): send the shopper to its page to choose options. */
            <a href={href} aria-label={`Vezi ${product.name}`} className="shrink-0">
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" style={{ color }} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
