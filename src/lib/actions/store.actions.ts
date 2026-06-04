"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SmartbillConfig } from "@/lib/smartbill";
import { logError } from "@/lib/error-logger";

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

  if (error) {
    logError({ action: "updatePageContent", message: error.message, details: { code: error.code, businessId }, userId: user.id });
    return { error: "Eroare la salvare." };
  }

  revalidatePath("/dashboard/editor");
  if (biz.slug) revalidatePath(`/${biz.slug}`);

  return { success: true };
}

export async function updateGeneralSettings(
  businessId: string,
  business: { business_name: string; address: string; city: string; county: string; phone: string; email: string; cui: string },
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
    cui: business.cui || null,
    updated_at: new Date().toISOString(),
  }).eq("id", businessId);
  if (bizError) {
    logError({ action: "updateGeneralSettings.business", message: bizError.message, details: { code: bizError.code, businessId }, userId: user.id });
    return { error: "Eroare la salvarea datelor magazinului." };
  }

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
  if (settingsError) {
    logError({ action: "updateGeneralSettings.settings", message: settingsError.message, details: { code: settingsError.code, businessId }, userId: user.id });
    return { error: "Eroare la salvarea setarilor." };
  }

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard", "layout");
  if (biz.slug) revalidatePath(`/${biz.slug}`);
  return { success: true };
}

export async function updateNotificationsSettings(
  businessId: string,
  config: { notification_email: string; new_order: boolean },
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
      .update({ notifications_config: config as never, updated_at: new Date().toISOString() })
      .eq("business_id", businessId));
  } else {
    ({ error } = await supabase.from("store_settings")
      .insert({ business_id: businessId, notifications_config: config as never }));
  }

  if (error) return { error: "Eroare la salvare." };
  revalidatePath("/dashboard/settings");
  return { success: true };
}

export async function updateVatSettings(
  businessId: string,
  settings: { vat_enabled: boolean; vat_rate: number; prices_include_vat: boolean; show_vat_breakdown: boolean },
): Promise<{ error: string } | { success: true }> {
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
      .update({ ...settings, updated_at: new Date().toISOString() })
      .eq("business_id", businessId));
  } else {
    ({ error } = await supabase.from("store_settings")
      .insert({ business_id: businessId, ...settings }));
  }

  if (error) return { error: "Eroare la salvare." };
  revalidatePath("/dashboard/settings");
  if (biz.slug) revalidatePath(`/${biz.slug}`);
  return { success: true };
}

export async function updateSmsoConfig(
  businessId: string,
  config: { enabled: boolean; api_key: string; sender_id: string },
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
      .update({ smso_config: config as never, updated_at: new Date().toISOString() })
      .eq("business_id", businessId));
  } else {
    ({ error } = await supabase.from("store_settings")
      .insert({ business_id: businessId, smso_config: config as never }));
  }

  if (error) return { error: "Eroare la salvare." };
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/sms");
  return { success: true };
}

export async function updateSmartbillConfig(
  businessId: string,
  config: SmartbillConfig,
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
      .update({ smartbill_config: config as never, updated_at: new Date().toISOString() })
      .eq("business_id", businessId));
  } else {
    ({ error } = await supabase.from("store_settings")
      .insert({ business_id: businessId, smartbill_config: config as never }));
  }

  if (error) return { error: "Eroare la salvare." };
  revalidatePath("/dashboard/features/smartbill");
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
    .from("businesses").select("id, slug").eq("id", businessId).eq("user_id", user.id).single();
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
  if (biz.slug) revalidatePath(`/${biz.slug}`);
  return { success: true };
}

export async function updateShippingConfig(
  businessId: string,
  config: {
    shipping_enabled: boolean;
    free_shipping_threshold: number | null;
    shipping_zones: Record<string, { enabled: boolean; price: number; auto_price?: boolean; label?: string }>;
  },
): Promise<{ error: string } | { success: true }> {
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
      .update({
        shipping_enabled: config.shipping_enabled,
        free_shipping_threshold: config.free_shipping_threshold,
        shipping_zones: config.shipping_zones as never,
        updated_at: new Date().toISOString(),
      })
      .eq("business_id", businessId));
  } else {
    ({ error } = await supabase.from("store_settings")
      .insert({
        business_id: businessId,
        shipping_enabled: config.shipping_enabled,
        free_shipping_threshold: config.free_shipping_threshold,
        shipping_zones: config.shipping_zones as never,
      }));
  }

  if (error) return { error: "Eroare la salvare." };
  revalidatePath("/dashboard/settings");
  if (biz.slug) revalidatePath(`/${biz.slug}`);
  return { success: true };
}

export async function updateProfileName(
  fullName: string,
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { error } = await supabase
    .from("users_profile")
    .update({ full_name: fullName })
    .eq("id", user.id);

  if (error) return { error: "Nu am putut salva modificarile." };

  revalidatePath("/dashboard", "layout");
  return { success: true };
}
