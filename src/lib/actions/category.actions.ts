"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function getBusinessId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("businesses")
    .select("id")
    .eq("user_id", userId)
    .order("created_at")
    .limit(1)
    .single();
  return data?.id ?? null;
}

function escapeIlikePattern(value: string): string {
  return value.replace(/([%_\\])/g, "\\$1");
}

/**
 * Case-insensitive duplicate check among siblings. Needed because the DB
 * unique (business_id, parent_id, name) never fires for root categories —
 * parent_id NULL rows are always distinct in Postgres.
 */
async function siblingNameExists(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  parentId: string | null,
  name: string,
  excludeId?: string,
): Promise<boolean> {
  let query = supabase
    .from("categories")
    .select("id")
    .eq("business_id", businessId)
    .ilike("name", escapeIlikePattern(name))
    .limit(1);
  query = parentId ? query.eq("parent_id", parentId) : query.is("parent_id", null);
  if (excludeId) query = query.neq("id", excludeId);
  const { data } = await query.maybeSingle();
  return !!data;
}

export async function createCategory(data: {
  name: string;
  parent_id?: string | null;
  sort_order?: number;
}): Promise<{ error: string } | { id: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const businessId = await getBusinessId(supabase, user.id);
  if (!businessId) return { error: "Magazin negasit" };

  const name = data.name.trim();
  if (!name) return { error: "Numele categoriei este obligatoriu." };
  const parentId = data.parent_id ?? null;

  // The parent must be one of the merchant's own categories — otherwise a
  // crafted request could hang the subtree under a foreign business.
  if (parentId) {
    const { data: parent } = await supabase
      .from("categories")
      .select("id")
      .eq("id", parentId)
      .eq("business_id", businessId)
      .maybeSingle();
    if (!parent) return { error: "Categoria parinte nu exista." };
  }

  if (await siblingNameExists(supabase, businessId, parentId, name)) {
    return { error: "Aceasta categorie exista deja." };
  }

  const { data: cat, error } = await supabase
    .from("categories")
    .insert({
      business_id: businessId,
      name,
      parent_id: parentId,
      sort_order: data.sort_order ?? 0,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { error: "Aceasta categorie exista deja." };
    return { error: "Eroare la creare." };
  }

  revalidatePath("/dashboard/products/categories");
  revalidatePath("/dashboard/products");
  return { id: cat.id };
}

export async function updateCategory(
  id: string,
  data: { name?: string; sort_order?: number; image_url?: string | null },
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const businessId = await getBusinessId(supabase, user.id);
  if (!businessId) return { error: "Magazin negasit" };

  const payload = { ...data };
  if (payload.name !== undefined) {
    const name = payload.name.trim();
    if (!name) return { error: "Numele categoriei este obligatoriu." };
    payload.name = name;
    const { data: current } = await supabase
      .from("categories")
      .select("id, parent_id, name")
      .eq("id", id)
      .eq("business_id", businessId)
      .maybeSingle();
    if (!current) return { error: "Categoria nu exista." };
    if (current.name !== name
      && await siblingNameExists(supabase, businessId, current.parent_id, name, id)) {
      return { error: "Exista deja o categorie cu acest nume la acelasi nivel." };
    }
  }

  const { error } = await supabase
    .from("categories")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("business_id", businessId);

  if (error) {
    if (error.code === "23505") return { error: "Exista deja o categorie cu acest nume la acelasi nivel." };
    return { error: "Eroare la actualizare." };
  }

  revalidatePath("/dashboard/products/categories");
  revalidatePath("/dashboard/products");
  return { success: true };
}

export async function deleteCategory(id: string): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const businessId = await getBusinessId(supabase, user.id);
  if (!businessId) return { error: "Magazin negasit" };

  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", id)
    .eq("business_id", businessId);

  if (error) return { error: "Eroare la stergere." };

  revalidatePath("/dashboard/products/categories");
  revalidatePath("/dashboard/products");
  return { success: true };
}

export async function reorderCategories(
  items: { id: string; sort_order: number }[],
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const businessId = await getBusinessId(supabase, user.id);
  if (!businessId) return { error: "Magazin negasit" };

  const updates = items.map(({ id, sort_order }) =>
    supabase
      .from("categories")
      .update({ sort_order })
      .eq("id", id)
      .eq("business_id", businessId)
  );

  await Promise.all(updates);
  revalidatePath("/dashboard/products/categories");
  return { success: true };
}
