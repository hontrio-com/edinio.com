"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SmartbillConfig } from "@/lib/smartbill";
import { logError } from "@/lib/error-logger";
import type { Json } from "@/types/database.types";
import { checkoutPaymentMethods, processorReadiness, sanitizePaymentMethods, parseCardDiscountConfig, sanitizeCardDiscountConfig, parseCodFeeConfig, sanitizeCodFeeConfig, type PaymentMethodEntry, type PaymentMethodType, type CardDiscountConfig, type CodFeeConfig } from "@/lib/payment-methods";
import { parseCookieBannerConfig, type CookieBannerConfig } from "@/lib/cookie-consent";
import { parseShippingClasses, parseShippingRules, type ShippingClass, type ShippingRule } from "@/lib/shipping/rules";

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
  /** Eticheta „(TVA inclus)" / „(fara TVA)" de langa pret. */
  show_vat_label: boolean;
  shipping_zones: Json | null;
  min_order_amount: number | null;
  payment_methods: { type: PaymentMethodType; label: string }[];
  card_discount: CardDiscountConfig;
  cod_discount: CardDiscountConfig;
  cod_fee: CodFeeConfig;
  international_shipping: boolean;
  mailchimp_newsletter: boolean;
  brevo_newsletter: boolean;
  klaviyo_newsletter: boolean;
} | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("store_settings")
    .select("page_content, vat_enabled, vat_rate, prices_include_vat, show_vat_breakdown, show_vat_label, shipping_zones, min_order_amount, stripe_config, netopia_config, ipay_config, klarna_config, revolut_config, dpd_config, payment_methods, card_discount_config, cod_discount_config, cod_fee_config, mailchimp_config, brevo_config, klaviyo_config")
    .eq("business_id", businessId)
    .single();
  if (!data) return null;

  // International (EU) checkout is available only when DPD is enabled as a courier,
  // opted into international, and credentialed. Booleans only — no secrets leak.
  // `use_product_weight` NU mai pleaca spre browser: greutatea nu se mai
  // calculeaza acolo, ci din cosul incarcat din baza la cotare.
  const dc = data.dpd_config as { enabled?: boolean; international_enabled?: boolean; username?: string; client_id?: number } | null;
  const zonesCfg = (data.shipping_zones ?? {}) as Record<string, { enabled?: boolean }>;
  const internationalShipping = !!(dc?.enabled && dc?.international_enabled && dc?.username && dc?.client_id && zonesCfg["dpd"]?.enabled);

  // Aceeasi regula pe care o foloseste si verificarea de la plasarea comenzii:
  // daca ecranul si serverul ar decide separat ce procesator e gata, dezacordul
  // dintre ele ar refuza comenzi bune.
  const ready = processorReadiness(data);

  // Checkout newsletter opt-in is offered only when Mailchimp is connected, an
  // audience is chosen, and the checkout source is on. Booleans only — no secrets leak.
  const mc = data.mailchimp_config as { enabled?: boolean; audience_id?: string; sources?: { checkout?: boolean } } | null;
  const bv = data.brevo_config as { enabled?: boolean; list_id?: number; sources?: { checkout?: boolean } } | null;
  const kv = data.klaviyo_config as { enabled?: boolean; list_id?: string; sources?: { checkout?: boolean } } | null;

  return {
    page_content: (data.page_content as Json) ?? null,
    vat_enabled: data.vat_enabled ?? false,
    vat_rate: Number(data.vat_rate ?? 19),
    prices_include_vat: data.prices_include_vat ?? true,
    show_vat_breakdown: data.show_vat_breakdown ?? true,
    show_vat_label: data.show_vat_label ?? true,
    shipping_zones: (data.shipping_zones as Json) ?? null,
    min_order_amount: data.min_order_amount != null ? Number(data.min_order_amount) : null,
    payment_methods: checkoutPaymentMethods(data.payment_methods, ready),
    card_discount: parseCardDiscountConfig(data.card_discount_config),
    cod_discount: parseCardDiscountConfig(data.cod_discount_config),
    cod_fee: parseCodFeeConfig(data.cod_fee_config),
    international_shipping: internationalShipping,
    mailchimp_newsletter: !!(mc?.enabled && mc?.audience_id && mc?.sources?.checkout !== false),
    brevo_newsletter: !!(bv?.enabled && bv?.list_id && bv?.sources?.checkout !== false),
    klaviyo_newsletter: !!(kv?.enabled && kv?.list_id && kv?.sources?.checkout !== false),
  };
}

/**
 * Save the merchant's card-payment discount config (Setari > Metode de plata).
 * Sanitized server-side; a zero/invalid value is coerced to disabled.
 */
export async function updateCardDiscount(
  businessId: string,
  config: CardDiscountConfig,
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id, slug").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Magazin negasit" };

  const sanitized = sanitizeCardDiscountConfig(config);
  const { error } = await supabase
    .from("store_settings")
    .update({ card_discount_config: sanitized as never })
    .eq("business_id", businessId);

  if (error) {
    logError({ action: "updateCardDiscount", message: error.message, details: { code: error.code, businessId }, userId: user.id });
    return { error: "Eroare la salvarea discountului la plata cu cardul." };
  }

  if (biz.slug) revalidatePath(`/${biz.slug}`);
  revalidatePath("/dashboard/settings");
  return { success: true };
}

/**
 * Save the merchant's ramburs (cash-on-delivery) discount config. Mirror of
 * updateCardDiscount, persisted to store_settings.cod_discount_config.
 */
export async function updateCodDiscount(
  businessId: string,
  config: CardDiscountConfig,
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id, slug").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Magazin negasit" };

  const sanitized = sanitizeCardDiscountConfig(config);
  const { error } = await supabase
    .from("store_settings")
    .update({ cod_discount_config: sanitized as never })
    .eq("business_id", businessId);

  if (error) {
    logError({ action: "updateCodDiscount", message: error.message, details: { code: error.code, businessId }, userId: user.id });
    return { error: "Eroare la salvarea discountului la plata ramburs." };
  }

  if (biz.slug) revalidatePath(`/${biz.slug}`);
  revalidatePath("/dashboard/settings");
  return { success: true };
}

/**
 * Salveaza taxa la plata ramburs. Aceeasi forma ca cele doua reduceri de mai sus,
 * dar cu un camp in plus: daca suma fixa scrisa de comerciant contine deja TVA.
 */
export async function updateCodFee(
  businessId: string,
  config: CodFeeConfig,
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id, slug").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Magazin negasit" };

  const sanitized = sanitizeCodFeeConfig(config);
  const { error } = await supabase
    .from("store_settings")
    .update({ cod_fee_config: sanitized as never })
    .eq("business_id", businessId);

  if (error) {
    logError({ action: "updateCodFee", message: error.message, details: { code: error.code, businessId }, userId: user.id });
    return { error: "Eroare la salvarea taxei la plata ramburs." };
  }

  if (biz.slug) revalidatePath(`/${biz.slug}`);
  revalidatePath("/dashboard/settings");
  return { success: true };
}

/**
 * Save the merchant's cookie banner appearance (enabled + position). The consent
 * categories themselves are derived from active integrations, not stored here.
 */
export async function updateCookieBannerConfig(
  businessId: string,
  config: CookieBannerConfig,
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id, slug").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Magazin negasit" };

  const sanitized = parseCookieBannerConfig(config);
  const { error } = await supabase
    .from("store_settings")
    .update({ cookie_banner_config: sanitized as never })
    .eq("business_id", businessId);

  if (error) {
    logError({ action: "updateCookieBannerConfig", message: error.message, details: { code: error.code, businessId }, userId: user.id });
    return { error: "Eroare la salvarea bannerului de cookie-uri." };
  }

  if (biz.slug) revalidatePath(`/${biz.slug}`);
  revalidatePath("/dashboard/settings");
  return { success: true };
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
    .from("store_settings").select("id, page_content").eq("business_id", businessId).single();

  // Shallow-merge over the existing JSON so keys managed by OTHER editors are not
  // wiped — e.g. the nav menu set in /dashboard/pages, or hero_banners. Callers
  // pass their full known set of fields, so overwriting per-key is the intent.
  const merged = { ...((existing?.page_content as Record<string, unknown>) ?? {}), ...pageContent };

  let error;
  if (existing) {
    ({ error } = await supabase.from("store_settings")
      .update({ page_content: merged as never, updated_at: new Date().toISOString() })
      .eq("business_id", businessId));
  } else {
    ({ error } = await supabase.from("store_settings")
      .insert({ business_id: businessId, page_content: merged as never }));
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
  business: { business_name: string; address: string; city: string; county: string; phone: string; email: string; cui: string; reg_com: string },
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
    reg_com: business.reg_com || null,
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
  settings: { vat_enabled: boolean; vat_rate: number; prices_include_vat: boolean; show_vat_breakdown: boolean; show_vat_label: boolean },
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
  config: { enabled: boolean; api_key: string; sender_id: string; notify_status_change?: boolean },
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
    min_order_amount: number | null;
    shipping_zones: Record<string, { enabled: boolean; price: number; auto_price?: boolean; label?: string }>;
    // Clase de transport + reguli condiționale (Faza 1). Sanitizate defensiv la salvare.
    shipping_classes?: ShippingClass[];
    shipping_rules?: ShippingRule[];
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

  // Re-parse clasele/regulile prin parserele partajate — garanteaza forma jsonb valida.
  const classesRow = parseShippingClasses(config.shipping_classes ?? []);
  const rulesRow = parseShippingRules(config.shipping_rules ?? []);

  const { data: existing } = await supabase
    .from("store_settings").select("id").eq("business_id", businessId).single();

  let error;
  if (existing) {
    ({ error } = await supabase.from("store_settings")
      .update({
        shipping_enabled: config.shipping_enabled,
        free_shipping_threshold: config.free_shipping_threshold,
        min_order_amount: config.min_order_amount,
        shipping_zones: config.shipping_zones as never,
        shipping_classes: classesRow as never,
        shipping_rules: rulesRow as never,
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
        min_order_amount: config.min_order_amount,
        shipping_zones: config.shipping_zones as never,
        shipping_classes: classesRow as never,
        shipping_rules: rulesRow as never,
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

/**
 * Preturile autoritare ale produselor dintr-un cos: pretul de baza, preturile
 * variantelor si configuratia de trepte.
 *
 * Cosul din browser tine identitati si cantitati, nu preturi de incredere: ce s-a
 * salvat in localStorage la adaugare poate fi vechi de zile. Serverul recalculeaza
 * oricum totul la plasarea comenzii, deci fara pasul asta cosul afiseaza un pret
 * si comanda pleaca cu altul. Aceleasi date alimenteaza si motorul de trepte, ca
 * pretul de pachet sa se vada in cos, nu doar la finalizare.
 *
 * Public si fara secrete: doar produse active ale magazinului cerut.
 */
export async function getCartPricing(
  businessId: string,
  productIds: string[],
): Promise<Record<string, { price: number; combos: Record<string, number>; tiers: Json | null }>> {
  const ids = [...new Set((productIds ?? []).filter((id) => typeof id === "string" && id))].slice(0, 200);
  if (!businessId || ids.length === 0) return {};

  const admin = createAdminClient();
  const { data } = await admin
    .from("products")
    .select("id, price, page_sections")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .in("id", ids);

  const { enabledComboPriceMap } = await import("@/lib/storefront/variants");
  const out: Record<string, { price: number; combos: Record<string, number>; tiers: Json | null }> = {};
  for (const p of data ?? []) {
    const base = Math.round((Number(p.price) || 0) * 100) / 100;
    out[p.id] = {
      price: base,
      combos: Object.fromEntries(enabledComboPriceMap(p.page_sections, base)),
      tiers: ((p.page_sections ?? {}) as { quantity_tiers?: Json }).quantity_tiers ?? null,
    };
  }
  return out;
}
