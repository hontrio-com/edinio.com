"use server";

import { createClient } from "@/lib/supabase/server";
import type { PageProduct } from "@/components/pages/blocks/ProductsBlock";

const COLS = "id, name, slug, price, compare_at_price, images, category, is_featured";

function toPageProduct(p: {
  id: string; name: string; slug: string | null; price: number | string;
  compare_at_price: number | string | null; images: unknown; category: string | null; is_featured: boolean | null;
}): PageProduct {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    price: Number(p.price),
    compare_at_price: p.compare_at_price != null ? Number(p.compare_at_price) : null,
    images: Array.isArray(p.images) ? (p.images as unknown[]).map(String).filter(Boolean) : [],
    category: p.category,
    is_featured: !!p.is_featured,
  };
}

/** Owner-scoped product search for the page-builder picker (scales to large catalogs). */
export async function searchProductsForPicker(businessId: string, query: string): Promise<PageProduct[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: biz } = await supabase.from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return [];

  let q = supabase.from("products").select(COLS).eq("business_id", businessId).eq("is_active", true);
  const term = query.trim();
  if (term) q = q.ilike("name", `%${term}%`);
  const { data } = await q.order("is_featured", { ascending: false }).order("sort_order").limit(24);
  return (data ?? []).map(toPageProduct);
}

/** Resolve a specific set of product IDs (for showing the current selection). */
export async function getProductsByIds(businessId: string, ids: string[]): Promise<PageProduct[]> {
  if (!ids || ids.length === 0) return [];
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: biz } = await supabase.from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return [];

  const { data } = await supabase.from("products").select(COLS).eq("business_id", businessId).in("id", ids.slice(0, 100));
  const map = new Map((data ?? []).map((p) => [p.id, toPageProduct(p)]));
  // Preserve the caller's order.
  return ids.map((id) => map.get(id)).filter((p): p is PageProduct => !!p);
}
