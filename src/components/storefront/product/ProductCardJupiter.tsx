"use client";

import Image from "next/image";
import { Check, Package, Settings2, ShoppingCart } from "lucide-react";
import { formatPrice, formatPriceRange, formatPriceValue } from "@/lib/utils/format";
import { useDateCardProdus, type ProductCardProps } from "./ProductCard";

/** Rosul preturilor la oferta si al insignei „Super preț”, ca pe modelul temei. */
const ROSU = "#D7141A";

const SIZES_IMAGINE = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 300px";

/**
 * Cardul de produs al temei Jupiter, varianta „jupiter” a cardului (etapa 16.3 din `docs/editor-magazin/PLAN.md`),
 * dupa dedeman.ro: insigna rosie „Super preț” la oferta, titlul pe trei randuri, pretul vechi taiat si pretul mare cu
 * zecimalele mici, butonul plin in culoarea principala cu patratul cosului in culoarea de accent.
 *
 * Ce spune despre produs (pretul, „de la”, eticheta butonului) vine din `useDateCardProdus`, acelasi ca la cardul
 * clasic: butonul unui produs personalizabil spune „Personalizează”, al unuia cu variante „Alege opțiunile”.
 */
export function ProductCardJupiter(props: ProductCardProps) {
  const { product, onAddToCart, isAdded, priority = false } = props;
  const {
    imageUrl, isNew, priceRange, showPriceRange, hasDiscount, isOutOfStock, isVariable, cerePersonalizare, dePornire,
    fireSelect, productHref,
  } = useDateCardProdus(props);

  return (
    <div className="group h-full flex flex-col bg-[var(--st-surface)] border border-[var(--st-border)]/70 rounded-[3px] p-4 hover:shadow-[0_6px_18px_rgba(0,0,0,0.10)] transition-shadow">
      <a href={productHref} onClick={fireSelect} className="block">
        <div className="relative aspect-square overflow-hidden">
          {imageUrl ? (
            <Image src={imageUrl} alt={product.name} fill loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : undefined}
              sizes={SIZES_IMAGINE} className="object-contain group-hover:scale-[1.03] transition-transform duration-500 ease-out" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-[var(--st-bg)]">
              <Package className="h-10 w-10 text-[var(--st-muted)]/40" />
            </div>
          )}
          {hasDiscount ? (
            <span className="absolute top-0 left-0 px-2 py-1 rounded-[2px] text-[11px] font-bold uppercase tracking-wide text-white" style={{ backgroundColor: ROSU }}>
              Super preț
            </span>
          ) : isNew ? (
            <span className="absolute top-0 left-0 px-2 py-1 rounded-[2px] text-[11px] font-bold uppercase tracking-wide" style={{ backgroundColor: "var(--st-primary)", color: "var(--st-primary-contrast)" }}>
              Nou
            </span>
          ) : null}
          {product.is_bundle && (
            <span className="absolute bottom-0 left-0 px-2 py-1 rounded-[2px] text-[11px] font-bold uppercase tracking-wide" style={{ backgroundColor: "var(--st-primary)", color: "var(--st-primary-contrast)" }}>
              Pachet
            </span>
          )}
          {isOutOfStock && (
            <div className="absolute inset-0 bg-[var(--st-surface)]/75 flex items-center justify-center">
              <span className="text-xs font-semibold text-[var(--st-muted)] bg-[var(--st-surface)] border border-[var(--st-border)] px-3 py-1.5 rounded-[3px]">Stoc epuizat</span>
            </div>
          )}
        </div>
      </a>

      <a href={productHref} onClick={fireSelect} className="mt-3 flex-1">
        <h3 className="text-[14px] leading-[1.45] text-[var(--st-text)] line-clamp-3 min-h-[4.35em] group-hover:text-[var(--st-primary)] transition-colors">
          {product.name}
        </h3>
      </a>

      <div className="mt-3 min-h-[46px] flex flex-col justify-end">
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
        className="mt-3 h-10 w-full flex items-stretch rounded-[3px] overflow-hidden text-[14px] font-bold transition-opacity hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--st-primary)]"
        style={{ backgroundColor: "var(--st-primary)", color: "var(--st-primary-contrast)" }}>
        <span className="flex-1 min-w-0 flex items-center justify-center px-2 truncate">
          {isAdded ? "Adăugat!" : isVariable ? "Alege opțiunile" : cerePersonalizare ? "Personalizează" : "Adaugă în coș"}
        </span>
        <span className="w-10 shrink-0 flex items-center justify-center" style={{ backgroundColor: "var(--st-accent)", color: "var(--st-accent-contrast)" }}>
          {isAdded ? <Check className="h-[18px] w-[18px]" strokeWidth={3} /> : cerePersonalizare ? <Settings2 className="h-[18px] w-[18px]" /> : <ShoppingCart className="h-[18px] w-[18px]" />}
        </span>
      </button>
    </div>
  );
}

/** Pretul mare: partea intreaga mare, zecimalele si „lei” mai mici, ca pe modelul temei. */
function PretMare({ valoare, dePornire, culoare }: { valoare: number; dePornire: boolean; culoare: string }) {
  const [intreg, zecimale] = formatPriceValue(valoare).split(",");
  return (
    <p className="font-bold leading-none tabular-nums" style={{ color: culoare }}>
      {dePornire && <span className="text-[13px] font-semibold mr-1">de la</span>}
      <span className="text-[22px]">{intreg}</span>
      {zecimale && <span className="text-[14px]">,{zecimale}</span>}
      <span className="text-[14px] font-semibold"> lei</span>
    </p>
  );
}
