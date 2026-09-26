import { Package } from "lucide-react";
import { formatPrice, formatPriceRange } from "@/lib/utils/format";
import { AddToCartButton } from "./AddToCartButton";
import type { PageProduct } from "./ProductsBlock";
import { LegaturaProdus } from "./LegaturaProdus";

export function PageProductCard({ p, color, basePath, storeSlug, addToCart, className }: {
  p: PageProduct; color: string; basePath: string; storeSlug: string; addToCart?: boolean; className?: string;
}) {
  const img = p.images?.[0] ?? null;
  // Pretul vandabil, nu cel de baza: blocurile publicate ale eSAFE scriau 92,80
  // pentru o geaca ale carei marimi costa toate 116.
  // Pretul taiat numai la un pret unic: peste un interval („100 - 200 lei”) nu spune nimic (ca `ProductCard` din magazin).
  const hasDiscount = !p.price_range.hasRange && p.compare_at_price && p.compare_at_price > p.price_range.min;
  // Fara stoc, sau cu variante dintre care niciuna nu se poate cumpara.
  const indisponibil = !!p.epuizat || p.price_range.faraOferta;
  return (
    <div className={`group bg-white border border-border rounded-2xl overflow-hidden hover:shadow-xl transition-all flex flex-col ${className ?? ""}`}>
      {/* Prefixul din Setari > Permalink-uri vine din context, pe client; cardul ramane de server. */}
      <LegaturaProdus basePath={basePath} slugSauId={p.slug ?? p.id} className="block">
        <div className="relative aspect-square bg-gray-50 overflow-hidden">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt={p.name} className="w-full h-full object-contain p-2 group-hover:scale-[1.04] transition-transform duration-500" />
          ) : (
            <div className="w-full h-full flex items-center justify-center"><Package className="h-10 w-10 text-gray-200" /></div>
          )}
        </div>
      </LegaturaProdus>
      <div className="p-3 pg-sm:p-4 flex flex-col flex-1">
        <LegaturaProdus basePath={basePath} slugSauId={p.slug ?? p.id} className="flex-1">
          <h3 className="font-semibold text-gray-900 text-sm leading-snug mb-1.5 line-clamp-2">{p.name}</h3>
        </LegaturaProdus>
        {/* Pe telefon cardul are ~170px: pretul taiat coboara sub pret, nu iese din card. */}
        <div className="flex flex-wrap items-baseline gap-x-2 mt-auto">
          <span className="font-black text-base pg-sm:text-lg" style={{ color }}>
            {/* ⚠ „de la" cand numarul e o PODEA — vezi `getProductPriceRange`. */}
            {p.price_range.dePornire && !p.price_range.hasRange
              ? `de la ${formatPrice(p.price_range.min)}`
              : formatPriceRange(p.price_range.min, p.price_range.max)}
          </span>
          {hasDiscount && <span className="text-xs pg-sm:text-sm text-gray-400 line-through">{formatPrice(p.compare_at_price!)}</span>}
        </div>
        {indisponibil ? (
          <p className="mt-2 rounded-lg bg-gray-100 py-2 text-center text-xs font-semibold text-gray-500">Stoc epuizat</p>
        ) : addToCart && storeSlug && (
          <AddToCartButton
            product={{ id: p.id, name: p.name, slug: p.slug, price: p.price, compareAtPrice: p.compare_at_price, image: img, images: p.images, pageSections: p.page_sections, priceRange: p.price_range }}
            storeSlug={storeSlug} basePath={basePath} color={color} />
        )}
      </div>
    </div>
  );
}
