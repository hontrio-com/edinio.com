import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { SettingsClient } from "@/components/dashboard/SettingsClient";
import { resolvePaymentMethods, parseCardDiscountConfig } from "@/lib/payment-methods";
import { parseCookieBannerConfig, detectConsentCategories } from "@/lib/cookie-consent";
import type { MarketingConfig } from "@/lib/marketing";
import { parseStoreSeo, deriveStoreTitle, deriveStoreDescription, storeBaseUrl } from "@/lib/seo";
import { parseStoreMode } from "@/lib/storefront/store-mode";

interface Props {
  searchParams: Promise<{ plan_success?: string; domain_success?: string }>;
}

export default async function SettingsPage({ searchParams }: Props) {
  const { plan_success, domain_success } = await searchParams;
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: bizRow }] = await Promise.all([
    supabase.from("users_profile").select("*").eq("id", user.id).single(),
    supabase
      .from("businesses")
      .select("id, business_name, slug, store_name, store_city, tagline, description, cover_url, address, city, county, phone, email, cui, custom_domain, store_settings(store_policies, order_number_format, vat_enabled, vat_rate, prices_include_vat, show_vat_breakdown, notifications_config, smso_config, shipping_enabled, free_shipping_threshold, min_order_amount, shipping_zones, fan_courier_config, dpd_config, cargus_config, sameday_config, woot_config, colete_config, payment_methods, netopia_config, stripe_config, ipay_config, card_discount_config, cookie_banner_config, marketing_config, page_content)")
      .eq("user_id", user.id)
      .order("created_at")
      .limit(1)
      .single(),
  ]);

  if (!profile) redirect("/login");

  const business = bizRow ? { id: bizRow.id, business_name: bizRow.business_name, address: bizRow.address, city: bizRow.city, county: bizRow.county, phone: bizRow.phone, email: bizRow.email, cui: bizRow.cui, custom_domain: bizRow.custom_domain } : null;
  const rawSettings = bizRow?.store_settings;
  const storeSettings = Array.isArray(rawSettings) ? rawSettings[0] ?? null : rawSettings ?? null;

  // One Product Store (Settings > Tip magazin): current mode + active products picker.
  const storeMode = parseStoreMode(storeSettings?.page_content ?? null);
  let opsProducts: { id: string; name: string }[] = [];
  if (bizRow?.id) {
    const { data } = await supabase
      .from("products")
      .select("id, name")
      .eq("business_id", bizRow.id)
      .eq("is_active", true)
      .order("is_featured", { ascending: false })
      .order("sort_order");
    opsProducts = data ?? [];
  }

  // Store-level SEO: current overrides + the auto-derived defaults shown as
  // placeholders / in the live Google preview (single source of truth: @/lib/seo).
  const displayName = bizRow?.store_name ?? bizRow?.business_name ?? "magazin";
  const storeSeo = parseStoreSeo(storeSettings?.page_content ?? null);
  const seoDefaults = {
    title: deriveStoreTitle(displayName, bizRow?.store_city ?? null),
    description: deriveStoreDescription({ tagline: bizRow?.tagline ?? null, description: bizRow?.description ?? null, displayName }),
    ogImage: bizRow?.cover_url ?? null,
  };
  const seoPreviewUrl = bizRow?.slug
    ? storeBaseUrl({ slug: bizRow.slug, custom_domain: bizRow.custom_domain })
    : "https://www.edinio.com";

  type CourierCfg = Record<string, unknown>;
  const fc = storeSettings?.fan_courier_config as CourierCfg | null;
  const dg = storeSettings?.dpd_config as CourierCfg | null;
  const cg = storeSettings?.cargus_config as CourierCfg | null;
  const sg = storeSettings?.sameday_config as CourierCfg | null;
  const wc = storeSettings?.woot_config as CourierCfg | null;
  const cc = storeSettings?.colete_config as CourierCfg | null;

  const activeCourierIds: string[] = [
    ...(fc?.enabled && fc?.username && fc?.client_id ? ["fan-courier"] : []),
    ...(dg?.enabled && dg?.username && dg?.client_id ? ["dpd"] : []),
    ...(cg?.enabled && cg?.username && cg?.subscription_key && cg?.location_id ? ["cargus"] : []),
    ...(sg?.enabled && sg?.username && sg?.pickup_point_id ? ["sameday"] : []),
    ...(wc?.enabled && wc?.public_key && wc?.secret_key ? ["woot"] : []),
    ...(cc?.enabled && cc?.client_id && cc?.client_secret ? ["colete"] : []),
    "own",
    "pickup",
  ];

  const ncfg = storeSettings?.netopia_config as { enabled?: boolean; pos_signature?: string; api_key?: string } | null;
  const scfg = storeSettings?.stripe_config as { enabled?: boolean; charges_enabled?: boolean; account_id?: string } | null;
  const icfg = storeSettings?.ipay_config as { enabled?: boolean; username?: string; password?: string } | null;
  const paymentReadiness = {
    netopia: !!(ncfg?.enabled && ncfg?.pos_signature && ncfg?.api_key),
    stripe: !!(scfg?.enabled && scfg?.charges_enabled && scfg?.account_id),
    ipay: !!(icfg?.enabled && icfg?.username && icfg?.password),
  };
  const paymentMethods = resolvePaymentMethods(storeSettings?.payment_methods, paymentReadiness);

  return (
    <SettingsClient
      profile={profile}
      email={user.email ?? ""}
      businessId={business?.id ?? null}
      businessData={business ?? null}
      storePolicies={(storeSettings?.store_policies as Record<string, unknown>) ?? {}}
      orderNumberFormat={storeSettings?.order_number_format ?? "sequential"}
      vatSettings={{
        vat_enabled: storeSettings?.vat_enabled ?? false,
        vat_rate: storeSettings?.vat_rate ?? 19,
        prices_include_vat: storeSettings?.prices_include_vat ?? true,
        show_vat_breakdown: storeSettings?.show_vat_breakdown ?? true,
      }}
      notificationsConfig={{
        notification_email: (storeSettings?.notifications_config as Record<string, unknown>)?.notification_email as string ?? "",
        new_order: (storeSettings?.notifications_config as Record<string, unknown>)?.new_order !== false,
      }}
      smsoConfig={{
        enabled: (storeSettings?.smso_config as Record<string, unknown>)?.enabled === true,
        api_key: (storeSettings?.smso_config as Record<string, unknown>)?.api_key as string ?? "",
        sender_id: (storeSettings?.smso_config as Record<string, unknown>)?.sender_id as string ?? "",
      }}
      shippingConfig={{
        shipping_enabled: storeSettings?.shipping_enabled ?? false,
        free_shipping_threshold: storeSettings?.free_shipping_threshold ?? null,
        min_order_amount: storeSettings?.min_order_amount ?? null,
        shipping_zones: (storeSettings?.shipping_zones as Record<string, { enabled: boolean; price: number; label?: string }> | null) ?? {},
      }}
      activeCourierIds={activeCourierIds}
      paymentMethods={paymentMethods}
      paymentReadiness={paymentReadiness}
      cardDiscount={parseCardDiscountConfig(storeSettings?.card_discount_config)}
      cookieBanner={parseCookieBannerConfig(storeSettings?.cookie_banner_config)}
      cookieCategories={detectConsentCategories(storeSettings?.marketing_config as MarketingConfig | null)}
      storeSeo={storeSeo}
      seoDefaults={seoDefaults}
      seoPreviewUrl={seoPreviewUrl}
      storeMode={storeMode.mode}
      oneProductId={storeMode.productId}
      products={opsProducts}
      mfaEmailEnabled={profile?.mfa_email_enabled ?? false}
      planSuccess={plan_success === "1"}
      domainSuccess={domain_success === "1"}
    />
  );
}
