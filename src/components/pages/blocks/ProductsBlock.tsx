import { BlockShell } from "../BlockShell";
import { PageProductCard } from "./PageProductCard";
import { ProductCarousel } from "./ProductCarousel";
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

/**
 * Editor-side filter from a (limited) product set — the fallback used by the live
 * preview. On the PUBLIC route products are resolved per block server-side
 * (resolve-products.ts) with a hard cap, so large catalogs never load fully.
 */
export function pickProducts(products: PageProduct[], block: ProductsBlock): PageProduct[] {
  const limit = block.limit ?? 8;
  let list = products;
  if (block.mode === "featured") list = products.filter((p) => p.is_featured);
  else if (block.mode === "category" && block.category) list = products.filter((p) => p.category === block.category);
  else if (block.mode === "selected" && block.productIds?.length) {
    const order = new Map(block.productIds.map((id, i) => [id, i]));
    list = products.filter((p) => order.has(p.id)).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }
  if (list.length === 0 && block.mode === "featured") list = products;
  return list.slice(0, limit);
}

export function ProductsBlockView({ block, products, color, basePath, storeSlug }: {
  block: ProductsBlock; products: PageProduct[]; color: string; basePath: string; storeSlug: string;
}) {
  if (products.length === 0) return null;
  const columns = block.columns ?? 4;
  const grid = columns === 2 ? "grid-cols-2" : columns === 3 ? "grid-cols-2 md:grid-cols-3" : "grid-cols-2 md:grid-cols-3 lg:grid-cols-4";
  const addToCart = !!block.showAddToCart && !!storeSlug;
  return (
    <BlockShell style={block.style}>
      {block.title && (
        <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground text-center mb-8">{block.title}</h2>
      )}
      {block.layout === "carousel" ? (
        <ProductCarousel products={products} color={color} basePath={basePath} storeSlug={storeSlug} columns={columns} addToCart={addToCart} />
      ) : (
        <div className={`grid ${grid} gap-3 sm:gap-4 text-left`}>
          {products.map((p) => (
            <PageProductCard key={p.id} p={p} color={color} basePath={basePath} storeSlug={storeSlug} addToCart={addToCart} />
          ))}
        </div>
      )}
    </BlockShell>
  );
}
