import { Package } from "lucide-react";
import { formatPrice } from "@/lib/utils/format";
import { AddToCartButton } from "./AddToCartButton";
import type { PageProduct } from "./ProductsBlock";

export function PageProductCard({ p, color, basePath, storeSlug, addToCart, className }: {
  p: PageProduct; color: string; basePath: string; storeSlug: string; addToCart?: boolean; className?: string;
}) {
  const img = p.images?.[0] ?? null;
  const hasDiscount = p.compare_at_price && p.compare_at_price > p.price;
  return (
    <div className={`group bg-white border border-gray-100 rounded-2xl overflow-hidden hover:shadow-xl transition-all flex flex-col ${className ?? ""}`}>
      <a href={`${basePath}/product/${p.slug ?? p.id}`} className="block">
        <div className="relative aspect-square bg-gray-50 overflow-hidden">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt={p.name} className="w-full h-full object-contain p-2 group-hover:scale-[1.04] transition-transform duration-500" />
          ) : (
            <div className="w-full h-full flex items-center justify-center"><Package className="h-10 w-10 text-gray-200" /></div>
          )}
        </div>
      </a>
      <div className="p-3 sm:p-4 flex flex-col flex-1">
        <a href={`${basePath}/product/${p.slug ?? p.id}`} className="flex-1">
          <h3 className="font-semibold text-gray-900 text-sm leading-snug mb-1.5 line-clamp-2">{p.name}</h3>
        </a>
        <div className="flex items-baseline gap-2 mt-auto">
          <span className="font-black text-lg" style={{ color }}>{formatPrice(p.price)}</span>
          {hasDiscount && <span className="text-sm text-gray-400 line-through">{formatPrice(p.compare_at_price!)}</span>}
        </div>
        {addToCart && storeSlug && (
          <AddToCartButton
            product={{ id: p.id, name: p.name, slug: p.slug, price: p.price, compareAtPrice: p.compare_at_price, image: img, images: p.images, pageSections: p.page_sections }}
            storeSlug={storeSlug} color={color} />
        )}
      </div>
    </div>
  );
}
