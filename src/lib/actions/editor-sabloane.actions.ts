"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Un produs pentru previzualizarea unui sablon de produs (etapa 4b din
 * `docs/editor-magazin/PLAN.md`): intai o exceptie a sablonului, apoi un produs din categoriile pe
 * care le acopera. `null` cand niciun produs activ nu-l foloseste inca: editorul impune atunci
 * sablonul pe produsul obisnuit al previzualizarii (`sablon=` in adresa).
 *
 * ⚠ Produsele isi tin categoria dupa NUME (`products.category`), deci editorul trimite numele
 * categoriilor acoperite, nu id-urile din sablon. Listele se plafoneaza: merg in adresa cererii.
 */
export async function produsPentruSablon(businessId: string, produse: string[], numeCategorii: string[]): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: magazin } = await supabase.from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).maybeSingle();
  if (!magazin) return null;

  const iduri = produse.filter((v) => typeof v === "string" && /^[0-9a-zA-Z-]{1,64}$/.test(v)).slice(0, 50);
  if (iduri.length) {
    const { data } = await supabase.from("products").select("slug")
      .eq("business_id", businessId).eq("is_active", true).in("id", iduri).not("slug", "is", null).limit(1);
    if (data?.[0]?.slug) return data[0].slug;
  }

  const nume = numeCategorii.filter((v) => typeof v === "string" && v.trim()).map((v) => v.trim()).slice(0, 100);
  if (nume.length) {
    const { data } = await supabase.from("products").select("slug")
      .eq("business_id", businessId).eq("is_active", true).in("category", nume).not("slug", "is", null)
      .order("is_featured", { ascending: false }).order("sort_order").limit(1);
    if (data?.[0]?.slug) return data[0].slug;
  }
  return null;
}
