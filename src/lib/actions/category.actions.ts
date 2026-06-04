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

  const { data: cat, error } = await supabase
    .from("categories")
    .insert({
      business_id: businessId,
      name: data.name.trim(),
      parent_id: data.parent_id ?? null,
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

  const { error } = await supabase
    .from("categories")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("business_id", businessId);

  if (error) return { error: "Eroare la actualizare." };

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
