"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SmartbillConfig } from "@/lib/smartbill";
import { logError } from "@/lib/error-logger";
import type { Json } from "@/types/database.types";
import { checkoutPaymentMethods, sanitizePaymentMethods, type PaymentMethodEntry, type PaymentMethodType } from "@/lib/payment-methods";

/**
 * Public, secret-free view of a store's checkout configuration.
 * Used by the anonymous storefront (checkout modals). Reads via the service role
 * so it works regardless of who is viewing, and returns ONLY non-sensitive fields
 * plus readiness booleans — raw payment/courier credentials never leave the server.
 */
export async function getPublicStoreConfig(businessId: string): Promise<{
  page_content: Json | null;
  vat_enabled: boolean;
  vat_rate: number;
  prices_include_vat: boolean;
  show_vat_breakdown: boolean;
  shipping_zones: Json | null;
  payment_methods: { type: PaymentMethodType; label: string }[];
} | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("store_settings")
    .select("page_content, vat_enabled, vat_rate, prices_include_vat, show_vat_breakdown, shipping_zones, stripe_config, netopia_config, ipay_config, payment_methods")
    .eq("business_id", businessId)
    .single();
  if (!data) return null;

  const sc = data.stripe_config as { enabled?: boolean; charges_enabled?: boolean; account_id?: string } | null;
  const nc = data.netopia_config as { enabled?: boolean; pos_signature?: string; api_key?: string } | null;
  const ic = data.ipay_config as { enabled?: boolean; username?: string; password?: string } | null;

  const ready = {
    netopia: !!(nc?.enabled && nc?.pos_signature && nc?.api_key),
    stripe: !!(sc?.enabled && sc?.charges_enabled && sc?.account_id),
    ipay: !!(ic?.enabled && ic?.username && ic?.password),
  };

  return {
    page_content: (data.page_content as Json) ?? null,
    vat_enabled: data.vat_enabled ?? false,
    vat_rate: Number(data.vat_rate ?? 19),
    prices_include_vat: data.prices_include_vat ?? true,
    show_vat_breakdown: data.show_vat_breakdown ?? true,
    shipping_zones: (data.shipping_zones as Json) ?? null,
    payment_methods: checkoutPaymentMethods(data.payment_methods, ready),
  };
}

/**
 * Save the merchant's "Metode de plata" config (order, enabled, labels).
 * Sanitized server-side; COD is always guaranteed and at least one method stays enabled.
 */
export async function updatePaymentMethods(
  businessId: string,
  methods: PaymentMethodEntry[],
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id, slug").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Magazin negasit" };

  const sanitized = sanitizePaymentMethods(methods);
  const { error } = await supabase
    .from("store_settings")
    .update({ payment_methods: sanitized as never })
    .eq("business_id", businessId);

  if (error) {
    logError({ action: "updatePaymentMethods", message: error.message, details: { code: error.code, businessId }, userId: user.id });
    return { error: "Eroare la salvarea metodelor de plata." };
  }

  if (biz.slug) revalidatePath(`/${biz.slug}`);
  revalidatePath("/dashboard/settings");
  return { success: true };
}

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

  // Compute default_shipping_cost from the first enabled courier
  const enabledZone = Object.values(config.shipping_zones).find(z => z.enabled);
  const defaultShippingCost = enabledZone ? enabledZone.price : 20;

  const { data: existing } = await supabase
    .from("store_settings").select("id").eq("business_id", businessId).single();

  let error;
  if (existing) {
    ({ error } = await supabase.from("store_settings")
      .update({
        shipping_enabled: config.shipping_enabled,
        free_shipping_threshold: config.free_shipping_threshold,
        shipping_zones: config.shipping_zones as never,
        default_shipping_cost: defaultShippingCost,
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
        default_shipping_cost: defaultShippingCost,
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
