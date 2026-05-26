"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updatePageContent(businessId: string, pageContent: Record<string, unknown>): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id, slug").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Magazin negasit" };

  const { data: existing } = await supabase
    .from("store_settings").select("id").eq("business_id", businessId).single();

  let error;
  if (existing) {
    ({ error } = await supabase.from("store_settings")
      .update({ page_content: pageContent as never, updated_at: new Date().toISOString() })
      .eq("business_id", businessId));
  } else {
    ({ error } = await supabase.from("store_settings")
      .insert({ business_id: businessId, page_content: pageContent as never }));
  }

  if (error) return { error: "Eroare la salvare." };

  revalidatePath("/dashboard/editor");
  if (biz.slug) revalidatePath(`/${biz.slug}`);

  return { success: true };
}

export async function updateGeneralSettings(
  businessId: string,
  business: { business_name: string; address: string; city: string; county: string; phone: string; email: string },
  orderNumberFormat: string,
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id, slug").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Magazin negasit" };

  const { error: bizError } = await supabase.from("businesses").update({
    business_name: business.business_name,
    address: business.address || null,
    city: business.city || null,
    county: business.county || null,
    phone: business.phone || null,
    email: business.email || null,
    updated_at: new Date().toISOString(),
  }).eq("id", businessId);
  if (bizError) return { error: "Eroare la salvarea datelor magazinului." };

  const { data: existing } = await supabase
    .from("store_settings").select("id").eq("business_id", businessId).single();

  let settingsError;
  if (existing) {
    ({ error: settingsError } = await supabase.from("store_settings")
      .update({ order_number_format: orderNumberFormat, updated_at: new Date().toISOString() })
      .eq("business_id", businessId));
  } else {
    ({ error: settingsError } = await supabase.from("store_settings")
      .insert({ business_id: businessId, order_number_format: orderNumberFormat }));
  }
  if (settingsError) return { error: "Eroare la salvarea setarilor." };

  revalidatePath("/dashboard/settings");
  if (biz.slug) revalidatePath(`/${biz.slug}`);
  return { success: true };
}

export async function updateStorePolicies(
  businessId: string,
  policies: Record<string, { content: string; enabled: boolean }>,
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Magazin negasit" };

  const { data: existing } = await supabase
    .from("store_settings").select("id").eq("business_id", businessId).single();

  let error;
  if (existing) {
    ({ error } = await supabase.from("store_settings")
      .update({ store_policies: policies as never, updated_at: new Date().toISOString() })
      .eq("business_id", businessId));
  } else {
    ({ error } = await supabase.from("store_settings")
      .insert({ business_id: businessId, store_policies: policies as never }));
  }

  if (error) return { error: "Eroare la salvare." };
  revalidatePath("/dashboard/settings");
  return { success: true };
}
