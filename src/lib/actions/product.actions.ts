"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProductLimit } from "@/lib/plan-limits";
import { deleteOrphanImages } from "@/lib/r2-cleanup";
import { logError } from "@/lib/error-logger";
import { resolveUniqueProductSlug } from "@/lib/slug";
import { enqueueGmcSync, enqueueGmcSyncMany } from "@/lib/google-merchant/queue";

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
  return resolveUniqueProductSlug(supabase, businessId, rawSlug, excludeProductId);
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

  const { data: created, error } = await supabase.from("products").insert({
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
  }).select("id").single();

  if (error) {
    logError({ action: "createProduct", message: error.message, details: { code: error.code, hint: error.hint, businessId }, userId: user.id });
    return { error: isSlugConflict(error) ? "Exista deja un produs cu acest link (slug). Alege altul." : "Eroare la salvare. Incearca din nou." };
  }
  if (created?.id) void enqueueGmcSync(businessId, created.id, created.id, "upsert");
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

  // Clean up removed images from R2 — but only those no other product still
  // references (duplicated products share the same image URLs).
  if (oldProduct?.images && Array.isArray(oldProduct.images)) {
    const newSet = new Set(data.images);
    const removed = (oldProduct.images as string[]).filter((url) => !newSet.has(url));
    void deleteOrphanImages(supabase, businessId, removed, { excludeProductId: productId });
  }

  void enqueueGmcSync(businessId, productId, productId, "upsert");
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

  // Clean up R2 images — but only those no other product still references
  // (the deleted product's row is already gone, so it won't self-match).
  if (product?.images && Array.isArray(product.images)) {
    void deleteOrphanImages(supabase, businessId, product.images as string[]);
  }

  // Remove from Google Merchant too (product_id is null — the row is now gone).
  void enqueueGmcSync(businessId, null, productId, "delete");
  revalidatePath("/dashboard/products");
  return { success: true };
}

// ── Bulk actions (Produsele mele: select many → one action) ──────────────────
export type BulkAction =
  | { kind: "active"; value: boolean }
  | { kind: "featured"; value: boolean }
  | { kind: "category"; value: string | null }
  | { kind: "price"; mode: "inc_pct" | "dec_pct" | "inc_amt" | "dec_amt" | "set"; amount: number }
  | { kind: "delete" };

const MAX_BULK = 1000;

export async function bulkProductAction(
  businessId: string,
  productIds: string[],
  action: BulkAction,
): Promise<{ success: true; count: number } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const ids = [...new Set((productIds ?? []).filter(Boolean))];
  if (ids.length === 0) return { error: "Niciun produs selectat." };
  if (ids.length > MAX_BULK) return { error: `Poti modifica cel mult ${MAX_BULK} produse odata.` };

  // Verify the business belongs to the user.
  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Magazin negasit" };

  const now = new Date().toISOString();

  try {
    if (action.kind === "active" || action.kind === "featured") {
      const patch = action.kind === "active" ? { is_active: action.value } : { is_featured: action.value };
      const { error, count } = await supabase
        .from("products").update({ ...patch, updated_at: now }, { count: "exact" })
        .eq("business_id", businessId).in("id", ids);
      if (error) throw error;
      void enqueueGmcSyncMany(businessId, ids);
      revalidatePath("/dashboard/products");
      return { success: true, count: count ?? ids.length };
    }

    if (action.kind === "category") {
      const value = action.value?.trim() || null;
      const { error, count } = await supabase
        .from("products").update({ category: value, updated_at: now }, { count: "exact" })
        .eq("business_id", businessId).in("id", ids);
      if (error) throw error;
      void enqueueGmcSyncMany(businessId, ids);
      revalidatePath("/dashboard/products");
      return { success: true, count: count ?? ids.length };
    }

    if (action.kind === "delete") {
      const { data: rows } = await supabase
        .from("products").select("id, images").eq("business_id", businessId).in("id", ids);
      const { error } = await supabase
        .from("products").delete().eq("business_id", businessId).in("id", ids);
      if (error) throw error;
      // Reference-safe R2 cleanup + remove from Google Merchant.
      for (const r of rows ?? []) {
        if (Array.isArray(r.images)) void deleteOrphanImages(supabase, businessId, r.images as string[]);
      }
      for (const id of ids) void enqueueGmcSync(businessId, null, id, "delete");
      revalidatePath("/dashboard/products");
      return { success: true, count: (rows ?? []).length || ids.length };
    }

    // Price: needs per-product computation, so read → compute → update.
    if (action.kind === "price") {
      const amt = Number(action.amount);
      if (!Number.isFinite(amt) || amt < 0) return { error: "Valoare invalida." };
      const { data: rows, error: readErr } = await supabase
        .from("products").select("id, price").eq("business_id", businessId).in("id", ids);
      if (readErr) throw readErr;

      const compute = (price: number): number => {
        let p = price;
        switch (action.mode) {
          case "inc_pct": p = price * (1 + amt / 100); break;
          case "dec_pct": p = price * (1 - amt / 100); break;
          case "inc_amt": p = price + amt; break;
          case "dec_amt": p = price - amt; break;
          case "set": p = amt; break;
        }
        return Math.max(0, Math.round(p * 100) / 100);
      };

      let count = 0;
      // Update in small concurrent batches to avoid a long serial loop.
      const batch = 20;
      for (let i = 0; i < (rows ?? []).length; i += batch) {
        const slice = (rows ?? []).slice(i, i + batch);
        const results = await Promise.all(slice.map((r) =>
          supabase.from("products")
            .update({ price: compute(Number(r.price) || 0), updated_at: now })
            .eq("id", r.id).eq("business_id", businessId),
        ));
        count += results.filter((res) => !res.error).length;
      }
      void enqueueGmcSyncMany(businessId, ids);
      revalidatePath("/dashboard/products");
      return { success: true, count };
    }

    return { error: "Actiune necunoscuta." };
  } catch (e) {
    logError({ action: "bulkProductAction", message: (e as Error).message, details: { businessId, kind: action.kind, n: ids.length }, userId: user.id });
    return { error: "Eroare la actiunea in masa. Incearca din nou." };
  }
}
