import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { SettingsClient } from "@/components/dashboard/SettingsClient";
import { Skeleton } from "@/components/ui/skeleton";
import { processorReadiness, resolvePaymentMethods, parseCardDiscountConfig, parseCodFeeConfig } from "@/lib/payment-methods";
import { parseCookieBannerConfig, detectConsentCategories } from "@/lib/cookie-consent";
import { parseShippingClasses, parseShippingRules } from "@/lib/shipping/rules";
import type { MarketingConfig } from "@/lib/marketing";
import { parseStoreSeo, deriveStoreTitle, deriveStoreDescription, storeBaseUrl } from "@/lib/seo";
import { parseEmailConfig } from "@/lib/email/config";
import { parseStoreMode } from "@/lib/storefront/store-mode";
import type { Database } from "@/types/database.types";

interface Props {
  searchParams: Promise<{ plan_success?: string; domain_success?: string }>;
}

/** Exact campurile trimise mai departe — aceleasi cu selectul de mai jos. */
type ProfilSetari = Pick<
  Database["public"]["Tables"]["users_profile"]["Row"],
  "full_name" | "plan" | "plan_interval" | "plan_expires_at" | "payment_failed_at" | "mfa_email_enabled"
>;

/**
 * Setarile se despart in DOUA, nu pe sectiuni.
 *
 * Ecranul e o singura Client Component cu 14 file care primesc totul dintr-un
 * foc, deci nu se poate livra fila cu fila fara sa o rup in bucati. Ce se poate
 * insa: interogarea grea sa nu mai tina coaja pe loc. Selectul de magazin cere
 * ~30 de coloane de setari, iar lista de produse pentru „Tip magazin" umbla
 * baza in ferestre de cate 1000 de randuri — la un catalog mare, mai multe
 * dus-intors inainte sa apara ceva pe ecran.
 *
 * Profilul ramane in parinte fiindca de el atarna `redirect("/login")`: un
 * `redirect` de sub `<Suspense>` ar ajunge dupa ce coaja a plecat deja. Costa o
 * interogare de un rand pusa inaintea celorlalte (inainte mergeau in paralel) —
 * in schimb scheletul pleaca imediat, nu dupa produse.
 */
export default async function SettingsPage({ searchParams }: Props) {
  const { plan_success, domain_success } = await searchParams;
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  /*
   * NU `select("*")`: randul intreg ajungea in payload-ul RSC al unei Client
   * Component, cu tot cu `admin_notes` — notitele INTERNE ale platformei despre
   * acel comerciant — plus `role`, `suspended_until`, `stripe_customer_id` si
   * hash-ul OTP. Componenta citeste cinci campuri.
   *
   * ATENTIE, ca sa nu se inchida constatarea prea devreme: asta e igiena de
   * payload, NU remedierea. Comerciantul poate citi `admin_notes` oricum, direct
   * din browser cu cheia anon, fiindca SELECT pe `users_profile` n-a fost
   * niciodata revocat de la `authenticated`. Remedierea reala e revocarea la
   * nivel de coloana — e RESTRICTIVA, deci se aplica DUPA deploy
   * (migrations/2026-08-04-DUPA-DEPLOY-coloane-profil.sql).
   */
  const { data: profile } = await supabase
    .from("users_profile")
    .select("full_name, plan, plan_interval, plan_expires_at, payment_failed_at, mfa_email_enabled")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  return (
    <Suspense fallback={<ScheletSetari />}>
      <ContinutSetari
        profile={profile}
        userId={user.id}
        email={user.email ?? ""}
        planSuccess={plan_success === "1"}
        domainSuccess={domain_success === "1"}
      />
    </Suspense>
  );
}

function ScheletSetari() {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      {/* coloana din stanga tine locul celor 14 file din NAV_SECTIONS */}
      <aside className="hidden lg:flex flex-col flex-shrink-0 w-52 border-r border-border py-6 px-2 space-y-1">
        {Array.from({ length: 14 }).map((_, i) => (
          <Skeleton key={i} className="h-9" />
        ))}
      </aside>
      <div className="flex-1 p-6 max-w-3xl space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex gap-2 lg:hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-24" />
          ))}
        </div>
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-10 w-32 rounded-xl" />
      </div>
    </div>
  );
}

async function ContinutSetari({
  profile,
  userId,
  email,
  planSuccess,
  domainSuccess,
}: {
  profile: ProfilSetari;
  userId: string;
  email: string;
  planSuccess: boolean;
  domainSuccess: boolean;
}) {
  const supabase = await createClient();

  const { data: bizRow } = await supabase
    .from("businesses")
    .select("id, business_name, slug, store_name, store_city, tagline, description, cover_url, logo_url, primary_color, address, city, county, phone, email, cui, reg_com, custom_domain, store_settings(store_policies, order_number_format, vat_enabled, vat_rate, prices_include_vat, show_vat_breakdown, notifications_config, smso_config, shipping_enabled, free_shipping_threshold, min_order_amount, shipping_zones, shipping_classes, shipping_rules, fan_courier_config, dpd_config, cargus_config, sameday_config, woot_config, colete_config, payment_methods, netopia_config, stripe_config, ipay_config, klarna_config, revolut_config, card_discount_config, cod_discount_config, cod_fee_config, cookie_banner_config, marketing_config, email_config, page_content)")
    .eq("user_id", userId)
    .order("created_at")
    .limit(1)
    .single();

  const business = bizRow ? { id: bizRow.id, business_name: bizRow.business_name, address: bizRow.address, city: bizRow.city, county: bizRow.county, phone: bizRow.phone, email: bizRow.email, cui: bizRow.cui, reg_com: bizRow.reg_com, custom_domain: bizRow.custom_domain } : null;
  const rawSettings = bizRow?.store_settings;
  const storeSettings = Array.isArray(rawSettings) ? rawSettings[0] ?? null : rawSettings ?? null;

  // One Product Store (Settings > Tip magazin): current mode + active products picker.
  const storeMode = parseStoreMode(storeSettings?.page_content ?? null);
  // Windowed: la cataloage mari, un query simplu e taiat silentios la 1000 de
  // randuri (cap PostgREST) si produse valide ar lipsi din selectorul One Product.
  const opsProducts: { id: string; name: string; category: string | null }[] = [];
  if (bizRow?.id) {
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase
        .from("products")
        .select("id, name, category")
        .eq("business_id", bizRow.id)
        .eq("is_active", true)
        .order("is_featured", { ascending: false })
        .order("sort_order")
        .order("id")
        .range(from, from + 999);
      opsProducts.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
  }
  // Categoriile distincte folosite de produse — pentru conditia „Categorie" din regulile de transport.
  const shippingCategories = [...new Set(opsProducts.map((p) => p.category).filter((c): c is string => !!c && c.trim() !== ""))].sort();

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

  // Custom email (SMTP) — send the config WITHOUT the password (write-only field).
  const emailCfg = parseEmailConfig(storeSettings?.email_config);
  const emailSmtp = emailCfg.smtp ?? {};
  const emailInitial = {
    enabled: !!emailSmtp.enabled,
    host: emailSmtp.host ?? "",
    port: emailSmtp.port ?? 465,
    secure: emailSmtp.secure ?? true,
    user: emailSmtp.user ?? "",
    from_email: emailSmtp.from_email ?? "",
    from_name: emailSmtp.from_name ?? "",
    reply_to: emailSmtp.reply_to ?? "",
    hasPassword: !!emailSmtp.pass,
    templates: emailCfg.templates ?? {},
    branding: {
      storeName: bizRow?.store_name || bizRow?.business_name || "Magazinul meu",
      logoUrl: bizRow?.logo_url ?? null,
      color: bizRow?.primary_color || "#1AB554",
      storeUrl: seoPreviewUrl,
    },
    emailBranding: {
      logo: emailCfg.branding?.logo ?? null,
      color: emailCfg.branding?.color ?? null,
    },
  };

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

  // Acelasi ajutor ca magazinul si ca verificarea de la plasarea comenzii: „gata"
  // trebuie sa insemne acelasi lucru in toate trei, altfel panoul arata o metoda
  // pe care comanda o refuza.
  const paymentReadiness = processorReadiness(storeSettings);
  const paymentMethods = resolvePaymentMethods(storeSettings?.payment_methods, paymentReadiness);

  return (
    <SettingsClient
      profile={profile}
      email={email}
      businessId={business?.id ?? null}
      businessData={business ?? null}
      storePolicies={(storeSettings?.store_policies as Record<string, unknown>) ?? {}}
      orderNumberFormat={storeSettings?.order_number_format ?? "sequential"}
      vatSettings={{
        vat_enabled: storeSettings?.vat_enabled ?? false,
        vat_rate: storeSettings?.vat_rate ?? 19,
        prices_include_vat: storeSettings?.prices_include_vat ?? true,
        show_vat_breakdown: storeSettings?.show_vat_breakdown ?? true,
        show_vat_label: storeSettings?.show_vat_label ?? true,
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
        shipping_classes: parseShippingClasses(storeSettings?.shipping_classes),
        shipping_rules: parseShippingRules(storeSettings?.shipping_rules),
      }}
      activeCourierIds={activeCourierIds}
      paymentMethods={paymentMethods}
      paymentReadiness={paymentReadiness}
      cardDiscount={parseCardDiscountConfig(storeSettings?.card_discount_config)}
      codDiscount={parseCardDiscountConfig(storeSettings?.cod_discount_config)}
      codFee={parseCodFeeConfig(storeSettings?.cod_fee_config)}
      cookieBanner={parseCookieBannerConfig(storeSettings?.cookie_banner_config)}
      cookieCategories={detectConsentCategories(storeSettings?.marketing_config as MarketingConfig | null)}
      storeSeo={storeSeo}
      seoDefaults={seoDefaults}
      seoPreviewUrl={seoPreviewUrl}
      emailInitial={emailInitial}
      storeMode={storeMode.mode}
      oneProductId={storeMode.productId}
      products={opsProducts}
      shippingCategories={shippingCategories}
      mfaEmailEnabled={profile?.mfa_email_enabled ?? false}
      planSuccess={planSuccess}
      domainSuccess={domainSuccess}
    />
  );
}
