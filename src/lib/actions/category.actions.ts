"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { collectSubtreeIds } from "@/lib/categories/tree";

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

/**
 * Muta o categorie sub alt parinte, cu tot ce are sub ea.
 *
 * Pana acum nu se putea: greseala la adaugare se repara stergand ramura si
 * refacand-o de mana, subcategorie cu subcategorie.
 *
 * Produsele NU se ating. Ele isi tin categoria dupa NUME (`products.category` e
 * text, nu cheie straina), iar mutarea nu schimba niciun nume — deci nu se rupe
 * nicio legatura si nu e nimic de migrat.
 *
 * `newParentId` null inseamna „scoate-o la nivelul principal".
 */
export async function moveCategory(
  id: string,
  newParentId: string | null,
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const businessId = await getBusinessId(supabase, user.id);
  if (!businessId) return { error: "Magazin negasit" };

  const { data: cat } = await supabase
    .from("categories")
    .select("id, name, parent_id")
    .eq("id", id)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!cat) return { error: "Categoria nu exista." };
  if ((cat.parent_id ?? null) === newParentId) return { success: true };

  if (newParentId) {
    // Parintele trebuie sa fie tot al lui: altfel o cerere mestesugita ar agata
    // ramura sub alt magazin.
    const { data: parent } = await supabase
      .from("categories")
      .select("id")
      .eq("id", newParentId)
      .eq("business_id", businessId)
      .maybeSingle();
    if (!parent) return { error: "Categoria in care muti nu exista." };

    /*
     * Cea mai importanta oprire: nu poti muta o categorie in ea insasi sau in
     * ceva de sub ea.
     *
     * Ramura s-ar inchide intr-un cerc si ar iesi cu totul din arbore: n-ar mai
     * atarna de nicio radacina, deci n-ar mai aparea nicaieri in interfata si
     * n-ar mai putea fi nici mutata inapoi, nici stearsa din ecran. Se citesc
     * TOATE categoriile magazinului, ca sa se poata calcula subarborele.
     */
    const { data: toate } = await supabase
      .from("categories")
      .select("id, parent_id")
      .eq("business_id", businessId);
    if (collectSubtreeIds(toate ?? [], id).has(newParentId)) {
      return { error: "Nu poti muta o categorie in ea insasi sau intr-una dintre subcategoriile ei." };
    }
  }

  // Acelasi nume, doi frati: verificat in aplicatie fiindca la nivelul principal
  // regula din baza de date nu se declanseaza niciodata (vezi `siblingNameExists`).
  if (await siblingNameExists(supabase, businessId, newParentId, cat.name, id)) {
    return { error: "Acolo exista deja o categorie cu acest nume." };
  }

  const { error } = await supabase
    .from("categories")
    .update({ parent_id: newParentId, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("business_id", businessId);

  if (error) {
    if (error.code === "23505") return { error: "Acolo exista deja o categorie cu acest nume." };
    return { error: "Eroare la mutare." };
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
