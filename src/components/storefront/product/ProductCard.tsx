"use client";

import { useState } from "react";
import Image from "next/image";
import { Check, Layers, Package, ShoppingCart } from "lucide-react";
import { formatPrice, formatPriceRange } from "@/lib/utils/format";
import { getProductPriceRange } from "@/lib/utils/product-price";
import { parseVariants } from "@/lib/storefront/variants";
import { gtagEvent } from "@/lib/marketing";
import type { StorefrontProduct } from "@/lib/storefront/product.types";

/**
 * Cardul de produs al magazinului, varianta classic.
 *
 * Extras din `MiniStoreRenderer` fara schimbari de comportament. Este cardul
 * folosit de toate cele trei randuri ale paginii (Recomandate, randurile custom
 * si grila principala). Paginile custom au inca propriul card,
 * `components/pages/blocks/PageProductCard.tsx`; cele doua se unifica in faza
 * de unificare a header-ului si footer-ului.
 */
export interface ProductCardProps {
  product: StorefrontProduct;
  color: string;
  basePath: string;
  onAddToCart: () => void;
  isAdded: boolean;
  newBadgeDays: number;
  outOfStock?: boolean;
  showCategoryBadge?: boolean;
  priority?: boolean;
  priceLowestOnly?: boolean;
}

export function ProductCard({
  product,
  color,
  basePath,
  onAddToCart,
  isAdded,
  newBadgeDays,
  outOfStock,
  showCategoryBadge = true,
  priority = false,
  priceLowestOnly = false,
}: ProductCardProps) {
  const images = Array.isArray(product.images) ? product.images : [];
  const imageUrl = images[0] ? String(images[0]) : null;
  // Momentul se fixeaza la montare, printr-un initializator lene: `Date.now()`
  // apelat direct in randare e impur si poate da rezultate diferite intre
  // randari ale aceluiasi card.
  const [reper] = useState(() => Date.now());
  const isNew = newBadgeDays > 0 && reper - new Date(product.created_at).getTime() < newBadgeDays * 86400000;
  // Produs variabil cu preturi diferite -> afiseaza interval („De la X – Y") sau doar minimul.
  // Precalculat server-side cand payload-ul e slimuit; fallback pe derivarea
  // locala pentru apelanti care trimit page_sections complet.
  const priceRange = product.price_range ?? getProductPriceRange(Number(product.price), product.page_sections);
  const showPriceRange = priceRange.hasRange && !priceLowestOnly;
  const hasDiscount = !priceRange.hasRange && product.compare_at_price && Number(product.compare_at_price) > Number(product.price);
  const discountPct = hasDiscount
    ? Math.round((1 - Number(product.price) / Number(product.compare_at_price)) * 100)
    : 0;
  const isOutOfStock = outOfStock ?? (product.track_inventory && product.stock_quantity === 0);
  // Produs variabil: cardul deschide selectorul de optiuni in loc sa adauge direct.
  const isVariable = parseVariants(product.page_sections) !== null;

  const fireSelect = () => gtagEvent("select_item", { items: [{ item_id: product.id, item_name: product.name, price: Number(product.price) || 0, quantity: 1 }] });

  return (
    <div className="group bg-surface border border-border rounded-2xl overflow-hidden hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 flex flex-col">
      <a href={`${basePath}/product/${product.slug}`} className="block" onClick={fireSelect}>
        <div className="relative aspect-square bg-muted/40 overflow-hidden">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={product.name}
              fill
              priority={priority}
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="object-contain p-2 group-hover:scale-[1.04] transition-transform duration-500 ease-out"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="h-10 w-10 text-muted-foreground/40" />
            </div>
          )}

          {/* Top badges */}
          <div className="absolute top-2.5 left-2.5 flex flex-col gap-1.5">
            {product.is_bundle && (
              <span className="bg-foreground text-background text-[11px] font-bold px-2 py-0.5 rounded-lg shadow-sm inline-flex items-center gap-1">
                <Layers className="h-3 w-3" /> Pachet
              </span>
            )}
            {hasDiscount && (
              <span className="bg-red-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-lg shadow-sm">
                -{discountPct}%
              </span>
            )}
            {product.is_featured && !hasDiscount && (
              <span className="text-white text-[11px] font-bold px-2 py-0.5 rounded-lg shadow-sm"
                style={{ backgroundColor: color }}>
                Popular
              </span>
            )}
            {isNew && !hasDiscount && !product.is_featured && (
              <span className="text-white text-[11px] font-bold px-2 py-0.5 rounded-lg shadow-sm" style={{ backgroundColor: color }}>
                Nou
              </span>
            )}
          </div>

          {/* Category chip bottom */}
          {showCategoryBadge && product.category && (
            <div className="absolute bottom-2 left-2">
              <span className="bg-black/55 backdrop-blur-sm text-white text-[10px] font-medium px-2.5 py-0.5 rounded-full">
                {product.category}
              </span>
            </div>
          )}

          {isOutOfStock && (
            <div className="absolute inset-0 bg-surface/75 backdrop-blur-[2px] flex items-center justify-center">
              <span className="text-xs font-semibold text-muted-foreground bg-surface border border-border px-3 py-1.5 rounded-full shadow-sm">
                Stoc epuizat
              </span>
            </div>
          )}
        </div>
      </a>

      <div className="p-3 sm:p-4 flex flex-col flex-1">
        <a href={`${basePath}/product/${product.slug}`} className="flex-1" onClick={fireSelect}>
          <h3 className="font-semibold text-foreground text-sm leading-snug mb-1.5 line-clamp-2 hover:opacity-70 transition-opacity">
            {product.name}
          </h3>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="font-bold text-lg" style={{ color }}>
              {showPriceRange
                ? formatPriceRange(priceRange.min, priceRange.max)
                : formatPrice(priceRange.min)}
            </span>
            {hasDiscount && (
              <span className="text-sm text-muted-foreground line-through">{formatPrice(Number(product.compare_at_price))}</span>
            )}
          </div>
        </a>
        <button
          type="button"
          onClick={onAddToCart}
          disabled={isOutOfStock}
          className="w-full py-2.5 text-sm font-bold text-white rounded-xl transition-all active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-foreground/30"
          style={{
            backgroundColor: color,
            boxShadow: isAdded ? `0 0 0 3px ${color}33` : `0 2px 8px ${color}40`,
          }}
        >
          {isAdded ? (
            <>
              <Check className="h-4 w-4" strokeWidth={3} />
              Adaugat!
            </>
          ) : isVariable ? (
            <>
              <ShoppingCart className="h-4 w-4" />
              Alege optiunile
            </>
          ) : (
            <>
              <ShoppingCart className="h-4 w-4" />
              Adauga in cos
            </>
          )}
        </button>
      </div>
    </div>
  );
}
