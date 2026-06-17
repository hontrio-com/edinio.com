import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { Block, ProductsBlock } from "@/lib/pages/blocks.types";
import type { PageProduct } from "@/components/pages/blocks/ProductsBlock";

type DB = SupabaseClient<Database>;

const COLS = "id, name, slug, price, compare_at_price, images, category, is_featured";
const MAX = 24;

function toPageProduct(p: Record<string, unknown>): PageProduct {
  return {
    id: p.id as string,
    name: p.name as string,
    slug: (p.slug as string | null) ?? null,
    price: Number(p.price),
    compare_at_price: p.compare_at_price != null ? Number(p.compare_at_price) : null,
    images: Array.isArray(p.images) ? (p.images as unknown[]).map(String).filter(Boolean) : [],
    category: (p.category as string | null) ?? null,
    is_featured: !!p.is_featured,
  };
}

/**
 * Resolve the products a single products-block should show, with a hard cap so a
 * store with thousands/tens-of-thousands of products never loads them all.
 */
export async function resolveBlockProducts(supabase: DB, businessId: string, block: ProductsBlock): Promise<PageProduct[]> {
  const limit = Math.min(Math.max(block.limit ?? 8, 1), MAX);

  let q = supabase.from("products").select(COLS).eq("business_id", businessId).eq("is_active", true);
  if (block.mode === "featured") q = q.eq("is_featured", true);
  else if (block.mode === "category" && block.category) q = q.eq("category", block.category);
  else if (block.mode === "selected") {
    const ids = (block.productIds ?? []).slice(0, MAX);
    if (ids.length === 0) return [];
    q = q.in("id", ids);
  }

  const { data } = await q.order("is_featured", { ascending: false }).order("sort_order").limit(MAX);
  let list = (data ?? []).map(toPageProduct);

  if (block.mode === "selected" && block.productIds) {
    const order = new Map(block.productIds.map((id, i) => [id, i]));
    list = list.slice().sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
  }
  return list.slice(0, limit);
}

/** Resolve products for every products-block on a page (one bounded query each). */
export async function resolveAllProductsBlocks(supabase: DB, businessId: string, blocks: Block[]): Promise<Record<string, PageProduct[]>> {
  const map: Record<string, PageProduct[]> = {};
  const productBlocks = blocks.filter((b): b is ProductsBlock => b.type === "products");
  await Promise.all(productBlocks.map(async (b) => { map[b.id] = await resolveBlockProducts(supabase, businessId, b); }));
  return map;
}
