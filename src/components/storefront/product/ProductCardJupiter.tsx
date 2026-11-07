"use client";

import Image from "next/image";
import { Check, Package, Settings2, ShoppingCart } from "lucide-react";
import { formatPrice, formatPriceRange, formatPriceValue } from "@/lib/utils/format";
import { procentReducere } from "@/lib/storefront/procent-reducere";
import { FOND_PLACA as FOND_POZA } from "@/components/storefront/sections/_shared/aspect-jupiter";
import { useDateCardProdus, type ProductCardProps } from "./ProductCard";

/** Rosul preturilor la oferta si al insignei cu reducerea. */
const ROSU = "#D92D20";

const SIZES_IMAGINE = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 300px";

/**
 * Cardul de produs al temei Jupiter, varianta „jupiter” a cardului (etapa 16.3 din `docs/editor-magazin/PLAN.md`).
 *
 * Aspectul propriu de la etapa 23 („sa nu fie identica 1 la 1 cu Dedeman”): poza pe o placa deschisa, rotunjita,
 * insigna cu procentul reducerii (in loc de „Super pret”), pretul mare cu zecimalele mici, butonul-pastila in culoarea
 * principala, cu iconita cosului in el.
 *
 * Ce spune despre produs (pretul, „de la”, eticheta butonului) vine din `useDateCardProdus`, acelasi ca la cardul
 * clasic: butonul unui produs personalizabil spune „Personalizeaza”, al unuia cu variante „Alege optiunile”. Tot ca la
 * el, comutatorul „Categoria pe card” din fila Stil arata categoria, aici deasupra titlului (16.5: era ignorat).
 */
export function ProductCardJupiter(props: ProductCardProps) {
  const { product, onAddToCart, isAdded, priority = false, showCategoryBadge = true } = props;
  const {
    imageUrl, isNew, priceRange, showPriceRange, hasDiscount, isOutOfStock, isVariable, cerePersonalizare, dePornire,
    fireSelect, productHref,
  } = useDateCardProdus(props);
  const reducere = hasDiscount ? procentReducere(priceRange.min, Number(product.compare_at_price)) : null;
  const insigna = "absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full text-[12px] font-bold leading-none tabular-nums";

  return (
    <div className="group h-full flex flex-col bg-[var(--st-surface)] border border-[var(--st-border)] rounded-[var(--st-radius-lg)] p-2.5 sm:p-3 hover:border-transparent hover:shadow-[0_14px_34px_-12px_rgba(16,24,40,0.22)] transition-[box-shadow,border-color] duration-300">
      <a href={productHref} onClick={fireSelect} className="block">
        <div className="relative aspect-square overflow-hidden rounded-[var(--st-radius)]" style={{ backgroundColor: FOND_POZA }}>
          {imageUrl ? (
            <Image src={imageUrl} alt={product.name} fill loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : undefined}
              sizes={SIZES_IMAGINE} className="object-contain p-3 mix-blend-multiply group-hover:scale-[1.04] transition-transform duration-500 ease-out" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="h-10 w-10 text-[var(--st-muted)]/40" />
            </div>
          )}
          {reducere !== null ? (
            <span className={`${insigna} text-white`} style={{ backgroundColor: ROSU }}>-{reducere}%</span>
          ) : hasDiscount ? (
            <span className={`${insigna} text-white`} style={{ backgroundColor: ROSU }}>Reducere</span>
          ) : isNew ? (
            <span className={insigna} style={{ backgroundColor: "var(--st-primary)", color: "var(--st-primary-contrast)" }}>Nou</span>
          ) : null}
          {product.is_bundle && (
            <span className="absolute bottom-2.5 left-2.5 px-2.5 py-1 rounded-full text-[12px] font-bold leading-none bg-[var(--st-surface)] text-[var(--st-text)] shadow-sm">
              Pachet
            </span>
          )}
          {isOutOfStock && (
            <div className="absolute inset-0 bg-[var(--st-surface)]/70 flex items-center justify-center">
              <span className="text-xs font-semibold text-[var(--st-muted)] bg-[var(--st-surface)] border border-[var(--st-border)] px-3 py-1.5 rounded-full">Stoc epuizat</span>
            </div>
          )}
        </div>
      </a>

      <a href={productHref} onClick={fireSelect} className="mt-3 px-1 flex-1">
        {/* Randul are inaltimea lui si fara categorie, ca titlurile din acelasi rand de carduri sa ramana aliniate. */}
        {showCategoryBadge && (
          <p className="mb-1 h-[18px] text-[11.5px] leading-[18px] font-semibold uppercase tracking-[0.06em] text-[var(--st-muted)] truncate">{product.category ?? ""}</p>
        )}
        <h3 className="text-[14.5px] leading-[1.45] font-medium text-[var(--st-text)] line-clamp-3 min-h-[4.35em] group-hover:text-[var(--st-primary)] transition-colors">
          {product.name}
        </h3>
      </a>

      <div className="mt-2.5 px-1 min-h-[46px] flex flex-col justify-end">
        {hasDiscount && (
          <p className="text-[13px] text-[var(--st-muted)] line-through tabular-nums">{formatPrice(Number(product.compare_at_price))}</p>
        )}
        {showPriceRange ? (
          <p className="text-[17px] font-bold text-[var(--st-text)] tabular-nums">{formatPriceRange(priceRange.min, priceRange.max)}</p>
        ) : (
          <PretMare valoare={priceRange.min} dePornire={dePornire} culoare={hasDiscount ? ROSU : "var(--st-text)"} />
        )}
      </div>

      {/* ⚠ Eticheta spune ce face butonul, din acelasi predicat ca hotararea din handler (vezi `ProductCard`). */}
      <button type="button" onClick={onAddToCart} disabled={isOutOfStock}
        className="mt-3 h-11 w-full inline-flex items-center justify-center gap-2 px-3 rounded-full text-[14px] font-semibold transition-[filter,box-shadow] enabled:hover:brightness-[0.88] enabled:hover:shadow-[0_3px_10px_rgba(0,0,0,0.22)] enabled:active:brightness-[0.8] disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--st-primary)]"
        style={{ backgroundColor: "var(--st-primary)", color: "var(--st-primary-contrast)" }}>
        {isAdded ? <Check className="h-[18px] w-[18px] shrink-0" strokeWidth={3} /> : cerePersonalizare ? <Settings2 className="h-[18px] w-[18px] shrink-0" /> : <ShoppingCart className="h-[18px] w-[18px] shrink-0" />}
        <span className="min-w-0 truncate">
          {isAdded ? "Adaugat!" : isVariable ? "Alege optiunile" : cerePersonalizare ? "Personalizeaza" : "Adauga in cos"}
        </span>
      </button>
    </div>
  );
}

/** Pretul mare: partea intreaga mare, zecimalele si „lei” mai mici. */
function PretMare({ valoare, dePornire, culoare }: { valoare: number; dePornire: boolean; culoare: string }) {
  const [intreg, zecimale] = formatPriceValue(valoare).split(",");
  return (
    <p className="font-extrabold leading-none tabular-nums tracking-tight" style={{ color: culoare, fontFamily: "var(--st-font-heading)" }}>
      {dePornire && <span className="text-[13px] font-semibold mr-1">de la</span>}
      <span className="text-[23px]">{intreg}</span>
      {zecimale && <span className="text-[14px]">,{zecimale}</span>}
      <span className="text-[14px] font-semibold"> lei</span>
    </p>
  );
}
