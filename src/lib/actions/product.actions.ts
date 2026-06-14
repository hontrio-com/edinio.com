"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProductLimit } from "@/lib/plan-limits";
import { deleteFromR2, r2KeyFromUrl } from "@/lib/r2";
import { logError } from "@/lib/error-logger";

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
    customization?: {
      enabled: boolean;
      fields: {
        id: string;
        type: string;
        label: string;
        placeholder?: string;
        required: boolean;
        max_length?: number;
        max_files?: number;
        max_file_size_mb?: number;
        options?: string[];
        default_color?: string;
        helper_text?: string;
      }[];
    };
  };
}

type ServerClient = Awaited<ReturnType<typeof createClient>>;

// Garanteaza slug unic per magazin: daca "tricou" e luat, returneaza "tricou-2", "tricou-3", etc.
// excludeProductId: la editare, ignora produsul curent (ca sa nu se auto-incrementeze inutil).
async function resolveUniqueSlug(
  supabase: ServerClient,
  businessId: string,
  rawSlug: string | null | undefined,
  excludeProductId?: string,
): Promise<string | null> {
  const base = rawSlug?.trim() || null;
  if (!base) return null;

  const { data: rows } = await supabase
    .from("products")
    .select("id, slug")
    .eq("business_id", businessId)
    .like("slug", `${base}%`);

  const taken = new Set(
    (rows ?? [])
      .filter((r) => r.id !== excludeProductId && r.slug)
      .map((r) => r.slug as string),
  );

  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

// Mesaj prietenos cand o coliziune de slug scapa de dedup (ex. race intre 2 salvari).
function isSlugConflict(error: { code?: string | null; message: string }) {
  return error.code === "23505" && error.message.includes("slug");
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

  const slug = await resolveUniqueSlug(supabase, businessId, data.slug);

  const { error } = await supabase.from("products").insert({
    business_id: businessId,
    name: data.name.trim(),
    slug,
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

  if (error) {
    logError({ action: "createProduct", message: error.message, details: { code: error.code, hint: error.hint, businessId }, userId: user.id });
    return { error: isSlugConflict(error) ? "Exista deja un produs cu acest link (slug). Alege altul." : "Eroare la salvare. Incearca din nou." };
  }
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

  // Fetch old images to detect removals
  const { data: oldProduct } = await supabase
    .from("products")
    .select("images")
    .eq("id", productId)
    .eq("business_id", businessId)
    .single();

  const slug = await resolveUniqueSlug(supabase, businessId, data.slug, productId);

  const { error } = await supabase.from("products").update({
    name: data.name.trim(),
    slug,
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

  if (error) {
    logError({ action: "updateProduct", message: error.message, details: { code: error.code, hint: error.hint, productId, businessId }, userId: user.id });
    return { error: isSlugConflict(error) ? "Exista deja un produs cu acest link (slug). Alege altul." : "Eroare la salvare. Incearca din nou." };
  }

  // Clean up removed images from R2 (fire-and-forget)
  if (oldProduct?.images && Array.isArray(oldProduct.images)) {
    const newSet = new Set(data.images);
    for (const url of oldProduct.images as string[]) {
      if (!newSet.has(url)) {
        const key = r2KeyFromUrl(url);
        if (key) deleteFromR2(key).catch(() => {});
      }
    }
  }

  revalidatePath("/dashboard/products");
  return { success: true };
}

export async function duplicateProduct(productId: string, businessId: string) {
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
    return { error: `Ai atins limita de ${limit} produse. Upgradeaza planul.` };
  }

  const { data: original } = await supabase
    .from("products")
    .select("*")
    .eq("id", productId)
    .eq("business_id", businessId)
    .single();

  if (!original) return { error: "Produs negasit" };

  const slug = await resolveUniqueSlug(
    supabase,
    businessId,
    original.slug ? `${original.slug}-copie` : null,
  );

  const { error } = await supabase.from("products").insert({
    business_id: businessId,
    name: `${original.name} (copie)`,
    slug,
    description: original.description,
    price: original.price,
    compare_at_price: original.compare_at_price,
    category: original.category,
    sku: original.sku ? `${original.sku}-COPY` : null,
    images: original.images,
    track_inventory: original.track_inventory,
    stock_quantity: original.stock_quantity,
    is_featured: false,
    is_active: false,
    weight_grams: original.weight_grams,
    page_sections: original.page_sections as never,
  });

  if (error) {
    logError({ action: "duplicateProduct", message: error.message, details: { code: error.code, hint: error.hint, productId, businessId }, userId: user.id });
    return { error: isSlugConflict(error) ? "Exista deja un produs cu acest link (slug). Alege altul." : "Eroare la duplicare." };
  }
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

  // Fetch images before deleting
  const { data: product } = await supabase
    .from("products")
    .select("images")
    .eq("id", productId)
    .eq("business_id", businessId)
    .single();

  const { error } = await supabase.from("products").delete()
    .eq("id", productId).eq("business_id", businessId);

  if (error) {
    logError({ action: "deleteProduct", message: error.message, details: { code: error.code, hint: error.hint, productId, businessId }, userId: user.id });
    return { error: "Eroare la stergere." };
  }

  // Clean up R2 images (fire-and-forget)
  if (product?.images && Array.isArray(product.images)) {
    for (const url of product.images as string[]) {
      const key = r2KeyFromUrl(url);
      if (key) deleteFromR2(key).catch(() => {});
    }
  }

  revalidatePath("/dashboard/products");
  return { success: true };
}
