"use client";

import Image from "next/image";
import { Check, Package, Plus, Settings2 } from "lucide-react";
import { formatPrice, formatPriceRange } from "@/lib/utils/format";
import { procentReducere } from "@/lib/storefront/procent-reducere";
import { useDateCardProdus, type ProductCardProps } from "./ProductCard";

/**
 * Fondul pozei: o urma din culoarea textului peste suprafata, deci merge si pe magazinele deschise (gri foarte deschis),
 * si pe cele intunecate (o treapta peste fond), fara sa stie care sunt.
 */
const FOND_POZA = "color-mix(in srgb, var(--st-text) 6%, var(--st-surface))";

const SIZES_IMAGINE = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 300px";

/**
 * Cardul „minimal” (etapa 24 din `docs/editor-magazin/PLAN.md`, temele Terra si Marte, dupa XStore): fara chenar, poza
 * pe o placa rotunjita, numele si pretul dedesubt, iar adaugarea in cos ca un cerc in coltul pozei.
 *
 * ⚠ Butonul NU sta in linkul pozei (un `<button>` in `<a>` nu e voie si ar fi deschis produsul la clic): e frate cu el,
 * asezat peste. Eticheta lui citita de cititorul de ecran spune ce face, ca la celelalte carduri.
 */
export function ProductCardMinimal(props: ProductCardProps) {
  const { product, onAddToCart, isAdded, priority = false, showCategoryBadge = true } = props;
  const {
    imageUrl, isNew, priceRange, showPriceRange, hasDiscount, isOutOfStock, isVariable, cerePersonalizare, dePornire,
    fireSelect, productHref,
  } = useDateCardProdus(props);
  const reducere = hasDiscount ? procentReducere(priceRange.min, Number(product.compare_at_price)) : null;
  const eticheta = isAdded ? "Adaugat" : isVariable ? "Alege optiunile" : cerePersonalizare ? "Personalizeaza" : "Adauga in cos";
  const insigna = "absolute top-3 left-3 px-2.5 py-1 rounded-full text-[11.5px] font-bold leading-none tabular-nums";

  return (
    <div className="group h-full flex flex-col">
      <div className="relative">
        <a href={productHref} onClick={fireSelect} className="block relative aspect-square overflow-hidden rounded-[var(--st-radius-lg)]"
          style={{ backgroundColor: FOND_POZA }}>
          {imageUrl ? (
            <Image src={imageUrl} alt={product.name} fill loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : undefined}
              sizes={SIZES_IMAGINE} className="object-contain p-5 group-hover:scale-[1.05] transition-transform duration-500 ease-out" />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center">
              <Package className="h-10 w-10 text-[var(--st-muted)]/40" />
            </span>
          )}
          {reducere !== null ? (
            <span className={`${insigna} bg-[var(--st-text)] text-[var(--st-surface)]`}>-{reducere}%</span>
          ) : isNew ? (
            <span className={insigna} style={{ backgroundColor: "var(--st-primary)", color: "var(--st-primary-contrast)" }}>Nou</span>
          ) : null}
          {isOutOfStock && (
            <span className="absolute inset-x-3 bottom-3 text-center text-xs font-semibold text-[var(--st-muted)] bg-[var(--st-surface)]/90 px-3 py-1.5 rounded-full">
              Stoc epuizat
            </span>
          )}
        </a>
        {!isOutOfStock && (
          <button type="button" onClick={onAddToCart} aria-label={eticheta} title={eticheta}
            className="absolute bottom-3 right-3 w-11 h-11 rounded-full flex items-center justify-center shadow-[0_6px_16px_-4px_rgba(0,0,0,0.35)] transition-[transform,filter] sm:translate-y-1 sm:opacity-0 group-hover:translate-y-0 group-hover:opacity-100 focus-visible:translate-y-0 focus-visible:opacity-100 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--st-primary)]"
            style={{ backgroundColor: "var(--st-primary)", color: "var(--st-primary-contrast)" }}>
            {isAdded ? <Check className="h-5 w-5" strokeWidth={3} /> : cerePersonalizare || isVariable ? <Settings2 className="h-5 w-5" /> : <Plus className="h-5 w-5" strokeWidth={2.4} />}
          </button>
        )}
      </div>

      <a href={productHref} onClick={fireSelect} className="mt-3 flex-1 block">
        {showCategoryBadge && product.category && (
          <p className="mb-1 text-[12px] text-[var(--st-muted)] truncate">{product.category}</p>
        )}
        <h3 className="text-[14.5px] leading-snug font-medium text-[var(--st-text)] line-clamp-2 group-hover:text-[var(--st-primary)] transition-colors">
          {product.name}
        </h3>
      </a>
      <div className="mt-2 flex items-baseline flex-wrap gap-x-2 tabular-nums">
        {showPriceRange ? (
          <span className="text-[15px] font-semibold text-[var(--st-text)]">{formatPriceRange(priceRange.min, priceRange.max)}</span>
        ) : (
          <span className="text-[15.5px] font-semibold text-[var(--st-text)]">
            {dePornire && <span className="text-[12.5px] font-normal text-[var(--st-muted)] mr-1">de la</span>}
            {formatPrice(priceRange.min)}
          </span>
        )}
        {hasDiscount && (
          <span className="text-[13px] text-[var(--st-muted)] line-through">{formatPrice(Number(product.compare_at_price))}</span>
        )}
      </div>
    </div>
  );
}
