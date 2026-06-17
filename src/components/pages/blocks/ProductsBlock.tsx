import { Package } from "lucide-react";
import { BlockShell } from "../BlockShell";
import { formatPrice } from "@/lib/utils/format";
import type { ProductsBlock } from "@/lib/pages/blocks.types";

export interface PageProduct {
  id: string;
  name: string;
  slug: string | null;
  price: number;
  compare_at_price: number | null;
  images: string[];
  category: string | null;
  is_featured: boolean;
}

function pick(products: PageProduct[], block: ProductsBlock): PageProduct[] {
  const limit = block.limit ?? 8;
  let list = products;
  if (block.mode === "featured") list = products.filter((p) => p.is_featured);
  else if (block.mode === "category" && block.category) list = products.filter((p) => p.category === block.category);
  else if (block.mode === "selected" && block.productIds?.length) {
    const set = new Set(block.productIds);
    list = products.filter((p) => set.has(p.id));
  }
  if (list.length === 0 && block.mode === "featured") list = products; // graceful fallback
  return list.slice(0, limit);
}

/** Pure presentational product grid; cards LINK to product pages (no cart needed here). */
export function ProductsBlockView({ block, products, color, basePath }: {
  block: ProductsBlock; products: PageProduct[]; color: string; basePath: string;
}) {
  const list = pick(products, block);
  if (list.length === 0) return null;
  return (
    <BlockShell style={block.style}>
      {block.title && (
        <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground text-center mb-8">{block.title}</h2>
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 text-left">
        {list.map((p) => {
          const img = p.images?.[0] ?? null;
          const hasDiscount = p.compare_at_price && p.compare_at_price > p.price;
          return (
            <a key={p.id} href={`${basePath}/product/${p.slug ?? p.id}`}
              className="group bg-white border border-gray-100 rounded-2xl overflow-hidden hover:shadow-xl hover:-translate-y-0.5 transition-all flex flex-col">
              <div className="relative aspect-square bg-gray-50 overflow-hidden">
                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img} alt={p.name} className="w-full h-full object-contain p-2 group-hover:scale-[1.04] transition-transform duration-500" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"><Package className="h-10 w-10 text-gray-200" /></div>
                )}
              </div>
              <div className="p-3 sm:p-4 flex flex-col flex-1">
                <h3 className="font-semibold text-gray-900 text-sm leading-snug mb-1.5 line-clamp-2">{p.name}</h3>
                <div className="flex items-baseline gap-2 mt-auto">
                  <span className="font-black text-lg" style={{ color }}>{formatPrice(p.price)}</span>
                  {hasDiscount && <span className="text-sm text-gray-400 line-through">{formatPrice(p.compare_at_price!)}</span>}
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </BlockShell>
  );
}
