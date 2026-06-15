"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProductLimit } from "@/lib/plan-limits";
import { deleteFromR2, r2KeyFromUrl } from "@/lib/r2";
import { logError } from "@/lib/error-logger";
import { resolveUniqueProductSlug } from "@/lib/slug";
import { computeBundlePricing, type BundleConfig, type BundleComponent, type BundlePricingMode } from "@/lib/bundles";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export interface BundleFormData {
  name: string;
  slug?: string | null;
  description?: string;
  images: string[];
  category?: string;
  is_active: boolean;
  is_featured: boolean;
  seo?: { title: string; description: string };
  items: { product_id: string; quantity: number }[];
  pricing_mode: BundlePricingMode;
  fixed_price?: number;
  discount_percent?: number;
  discount_amount?: number;
}

async function ownsBusiness(supabase: ServerClient, businessId: string, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", userId).single();
  return !!data;
}

function firstImage(images: unknown): string | null {
  return Array.isArray(images) && images.length ? (images[0] as string) : null;
}

// Resolve chosen items to real component data (authoritative prices/stock),
// preserving order + quantities and dropping missing/nested-bundle products.
async function resolveComponents(
  supabase: ServerClient, businessId: string, items: { product_id: string; quantity: number }[],
): Promise<BundleComponent[]> {
  const ids = [...new Set(items.map((i) => i.product_id))];
  if (ids.length === 0) return [];
  const { data: rows } = await supabase
    .from("products")
    .select("id, name, price, images, is_bundle, is_active, track_inventory, stock_quantity")
    .eq("business_id", businessId)
    .in("id", ids);
  const map = new Map((rows ?? []).map((r) => [r.id, r]));
  const out: BundleComponent[] = [];
  for (const it of items) {
    const p = map.get(it.product_id);
    if (!p || p.is_bundle) continue; // skip missing or nested bundles
    out.push({
      product_id: p.id,
      quantity: Math.max(1, Math.floor(Number(it.quantity) || 1)),
      name: p.name,
      price: Number(p.price) || 0,
      image_url: firstImage(p.images),
      track_inventory: p.track_inventory,
      stock_quantity: p.stock_quantity,
    });
  }
  return out;
}

// Products that can go into a bundle (everything except other bundles).
export async function getBundleEligibleProducts(businessId: string): Promise<{
  id: string; name: string; price: number; image_url: string | null;
  track_inventory: boolean; stock_quantity: number | null;
}[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  if (!(await ownsBusiness(supabase, businessId, user.id))) return [];

  const { data } = await supabase
    .from("products")
    .select("id, name, price, images, track_inventory, stock_quantity")
    .eq("business_id", businessId)
    .eq("is_bundle", false)
    .order("name");

  return (data ?? []).map((p) => ({
    id: p.id, name: p.name, price: Number(p.price) || 0, image_url: firstImage(p.images),
    track_inventory: p.track_inventory, stock_quantity: p.stock_quantity,
  }));
}

function buildBundleWrite(data: BundleFormData, components: BundleComponent[]) {
  const { price, compareAt } = computeBundlePricing(components, data.pricing_mode, {
    fixedPrice: data.fixed_price,
    discountPercent: data.discount_percent,
    discountAmount: data.discount_amount,
  });
  const bundle: BundleConfig = {
    items: components.map((c) => ({ product_id: c.product_id, quantity: c.quantity })),
    pricing_mode: data.pricing_mode,
    ...(data.pricing_mode === "discount_percent" ? { discount_percent: Number(data.discount_percent) || 0 } : {}),
    ...(data.pricing_mode === "discount_amount" ? { discount_amount: Number(data.discount_amount) || 0 } : {}),
  };
  const page_sections: Record<string, unknown> = { bundle };
  if (data.seo && (data.seo.title || data.seo.description)) page_sections.seo = data.seo;
  return { price, compareAt, page_sections };
}

export async function createBundle(
  businessId: string, data: BundleFormData,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  if (!(await ownsBusiness(supabase, businessId, user.id))) return { error: "Magazin negasit" };

  if (!data.name.trim()) return { error: "Pachetul are nevoie de un nume." };
  const components = await resolveComponents(supabase, businessId, data.items);
  if (components.length < 2) return { error: "Un pachet trebuie sa contina cel putin 2 produse." };

  const { data: profile } = await supabase.from("users_profile").select("plan").eq("id", user.id).single();
  const limit = getProductLimit(profile?.plan ?? "free");
  const { count } = await supabase
    .from("products").select("id", { count: "exact", head: true }).eq("business_id", businessId);
  if (limit !== Infinity && (count ?? 0) >= limit) {
    return { error: `Ai atins limita de ${limit} produse pentru planul tau. Upgradeaza planul.` };
  }

  const slug = await resolveUniqueProductSlug(supabase, businessId, data.slug);
  const { price, compareAt, page_sections } = buildBundleWrite(data, components);

  const { error } = await supabase.from("products").insert({
    business_id: businessId,
    name: data.name.trim(),
    slug,
    description: data.description?.trim() || null,
    price,
    compare_at_price: compareAt > price ? compareAt : null,
    category: data.category?.trim() || null,
    images: data.images,
    is_bundle: true,
    track_inventory: false,
    stock_quantity: null,
    is_featured: data.is_featured,
    is_active: data.is_active,
    page_sections: page_sections as never,
  });

  if (error) {
    logError({ action: "createBundle", message: error.message, details: { code: error.code, businessId }, userId: user.id });
    return { error: "Eroare la salvarea pachetului. Incearca din nou." };
  }
  revalidatePath("/dashboard/products/bundles");
  return { success: true };
}

export async function updateBundle(
  bundleId: string, businessId: string, data: BundleFormData,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  if (!(await ownsBusiness(supabase, businessId, user.id))) return { error: "Magazin negasit" };

  if (!data.name.trim()) return { error: "Pachetul are nevoie de un nume." };
  const components = await resolveComponents(supabase, businessId, data.items);
  if (components.length < 2) return { error: "Un pachet trebuie sa contina cel putin 2 produse." };

  const { data: oldRow } = await supabase
    .from("products").select("images").eq("id", bundleId).eq("business_id", businessId).eq("is_bundle", true).single();
  if (!oldRow) return { error: "Pachet negasit" };

  const slug = await resolveUniqueProductSlug(supabase, businessId, data.slug, bundleId);
  const { price, compareAt, page_sections } = buildBundleWrite(data, components);

  const { error } = await supabase.from("products").update({
    name: data.name.trim(),
    slug,
    description: data.description?.trim() || null,
    price,
    compare_at_price: compareAt > price ? compareAt : null,
    category: data.category?.trim() || null,
    images: data.images,
    track_inventory: false,
    stock_quantity: null,
    is_featured: data.is_featured,
    is_active: data.is_active,
    page_sections: page_sections as never,
    updated_at: new Date().toISOString(),
  }).eq("id", bundleId).eq("business_id", businessId).eq("is_bundle", true);

  if (error) {
    logError({ action: "updateBundle", message: error.message, details: { code: error.code, bundleId, businessId }, userId: user.id });
    return { error: "Eroare la salvarea pachetului. Incearca din nou." };
  }

  // Clean up removed images from R2 (fire-and-forget).
  if (Array.isArray(oldRow.images)) {
    const keep = new Set(data.images);
    for (const url of oldRow.images as string[]) {
      if (!keep.has(url)) {
        const key = r2KeyFromUrl(url);
        if (key) deleteFromR2(key).catch(() => {});
      }
    }
  }

  revalidatePath("/dashboard/products/bundles");
  revalidatePath(`/dashboard/products/bundles/${bundleId}/edit`);
  return { success: true };
}
