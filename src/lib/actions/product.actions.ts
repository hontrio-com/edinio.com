"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProductLimit } from "@/lib/plan-limits";

interface ProductData {
  name: string;
  slug?: string | null;
  description?: string;
  price: number;
  compare_at_price?: number | null;
  category?: string;
  sku?: string;
  images: string[];
  track_inventory: boolean;
  stock_quantity?: number | null;
  is_featured: boolean;
  is_active: boolean;
  weight_grams?: number | null;
  page_sections?: {
    specifications?: { label: string; value: string }[];
    quantity_tiers?: { enabled: boolean; tier2_price: number; tier2_badge: string; tier3_price: number; tier3_badge: string };
    stock_status?: string;
    low_stock_threshold?: number | null;
    dimensions?: { length: number; width: number; height: number };
    seo?: { title: string; description: string };
    variants?: {
      enabled: boolean;
      options: { id: string; name: string; values: string[] }[];
      combinations: { id: string; title: string; price: string; sku: string; enabled: boolean }[];
    };
  };
}

export async function createProduct(businessId: string, data: ProductData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("user_id", user.id)
    .single();
  if (!biz) return { error: "Magazin negasit" };

  // Check plan product limit
  const { data: profile } = await supabase
    .from("users_profile")
    .select("plan")
    .eq("id", user.id)
    .single();

  const plan = profile?.plan ?? "free";
  const limit = getProductLimit(plan);

  const { count } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId);

  if (limit !== Infinity && (count ?? 0) >= limit) {
    return { error: `Ai atins limita de ${limit} produse pentru planul tau. Upgradeaza planul pentru mai multe produse.` };
  }

  const { error } = await supabase.from("products").insert({
    business_id: businessId,
    name: data.name.trim(),
    slug: data.slug?.trim() || null,
    description: data.description?.trim() || null,
    price: data.price,
    compare_at_price: data.compare_at_price || null,
    category: data.category?.trim() || null,
    sku: data.sku?.trim() || null,
    images: data.images,
    track_inventory: data.track_inventory,
    stock_quantity: data.track_inventory ? (data.stock_quantity ?? 0) : null,
    is_featured: data.is_featured,
    is_active: data.is_active,
    weight_grams: data.weight_grams ?? null,
    page_sections: (data.page_sections ?? {}) as never,
  });

  if (error) return { error: "Eroare la salvare. Incearca din nou." };
  revalidatePath("/dashboard/products");
  return { success: true };
}

export async function updateProduct(productId: string, businessId: string, data: ProductData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("user_id", user.id)
    .single();
  if (!biz) return { error: "Magazin negasit" };

  const { error } = await supabase.from("products").update({
    name: data.name.trim(),
    slug: data.slug?.trim() || null,
    description: data.description?.trim() || null,
    price: data.price,
    compare_at_price: data.compare_at_price || null,
    category: data.category?.trim() || null,
    sku: data.sku?.trim() || null,
    images: data.images,
    track_inventory: data.track_inventory,
    stock_quantity: data.track_inventory ? (data.stock_quantity ?? 0) : null,
    is_featured: data.is_featured,
    is_active: data.is_active,
    weight_grams: data.weight_grams ?? null,
    page_sections: (data.page_sections ?? {}) as never,
    updated_at: new Date().toISOString(),
  }).eq("id", productId).eq("business_id", businessId);

  if (error) return { error: "Eroare la salvare. Incearca din nou." };
  revalidatePath("/dashboard/products");
  return { success: true };
}

export async function deleteProduct(productId: string, businessId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("user_id", user.id)
    .single();
  if (!biz) return { error: "Magazin negasit" };

  const { error } = await supabase.from("products").delete()
    .eq("id", productId).eq("business_id", businessId);

  if (error) return { error: "Eroare la stergere." };
  revalidatePath("/dashboard/products");
  return { success: true };
}
