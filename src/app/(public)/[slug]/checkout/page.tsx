import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { StorePageShell } from "@/components/storefront/StorePageShell";
import { StorefrontThemeScope } from "@/components/storefront/StorefrontThemeScope";
import { buildChromeData, loadSearchCategories } from "@/lib/storefront/chrome-value";
import { checkoutOnPage } from "@/lib/storefront/design/commerce";
import { radacinaMagazin } from "@/lib/storefront/category-href";
import { resolveDesign } from "@/lib/storefront/design/parse";
import type { StorePageContent } from "@/lib/storefront/store-content.types";
import { CheckoutPageClient } from "@/components/storefront/sections/checkout/CheckoutPageClient";
import { pragTransportGratuit } from "@/lib/storefront/prag-transport-gratuit";

/**
 * Pagina de finalizare a comenzii.
 *
 * Exista doar pentru magazinele care si-au ales-o din catalogul de design-uri;
 * restul comanda in fereastra, peste magazin, iar aici sunt trimise inapoi.
 *
 * Nu se indexeaza: e un pas personal, cu cosul fiecarui vizitator in el.
 */
// `absolute` scoate sablonul „%s | Edinio" al layout-ului: pe domeniul
// comerciantului, taman la pasul de plata, nu are ce cauta numele platformei.
export const metadata: Metadata = { title: { absolute: "Finalizeaza comanda" }, robots: { index: false, follow: false } };

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ code?: string }>;
}

export default async function CheckoutPage({ params, searchParams }: Props) {
  const { slug } = await params;
  // Codul de reducere vine din linkul de recuperare a cosului abandonat.
  const { code } = await searchParams;

  const supabase = await createClient();
  const [{ data: business }, { data: { user } }] = await Promise.all([
    supabase
      .from("businesses")
      .select("id, user_id, slug, business_name, store_name, tagline, description, phone, whatsapp, email, address, city, county, cui, reg_com, store_address, store_city, store_county, logo_url, cover_url, primary_color, is_published, suspended_until, custom_domain, social, gallery, features")
      .eq("slug", slug)
      .single(),
    supabase.auth.getUser(),
  ]);
  if (!business) notFound();

  const isOwner = user?.id === business.user_id;

  const admin = createAdminClient();
  const [{ data: storeSettings }] = await Promise.all([
    admin
      .from("store_settings")
      .select("page_content, storefront_design, default_shipping_cost, free_shipping_threshold")
      .eq("business_id", business.id)
      .single(),
  ]);

  const pageContent = (storeSettings?.page_content ?? {}) as StorePageContent;
  const resolved = resolveDesign(storeSettings?.storefront_design, {
    primaryColor: business.primary_color ?? "#1AB554",
    pageContent: pageContent as Record<string, unknown>,
    features: (business.features as Record<string, unknown>) ?? {},
    coverUrl: business.cover_url,
    tagline: business.tagline,
  });

  const host = (await headers()).get("host")?.split(":")[0] ?? "";
  const isCustomDomain = business.custom_domain && host === business.custom_domain;
  const basePath = isCustomDomain ? "" : `/${slug}`;

  if (!checkoutOnPage(resolved.design)) redirect(radacinaMagazin(basePath));

  // Magazin suspendat sau abonament expirat: pagina magazinului arata deja
  // „suspendat", dar aici se putea comanda mai departe cu cosul din localStorage.
  // Aceeasi verificare ca pe pagina de magazin si pe paginile personalizate;
  // proprietarul trece, ca sa isi poata vedea magazinul.
  if (!isOwner) {
    let suspendat = business.suspended_until ? new Date(business.suspended_until) < new Date() : false;
    if (!suspendat) {
      const { data: ownerProfile } = await admin
        .from("users_profile")
        .select("plan, plan_expires_at")
        .eq("id", business.user_id)
        .single();
      if ((ownerProfile?.plan === "free" || ownerProfile?.plan === "trial") && ownerProfile?.plan_expires_at) {
        suspendat = new Date(ownerProfile.plan_expires_at) < new Date();
      }
    }
    if (suspendat) redirect(radacinaMagazin(basePath));
  }

  const searchCategories = await loadSearchCategories(business.id, resolved.design);
  const chrome = buildChromeData({
    searchCategories,
    business: business as never,
    pageContent,
    basePath,
    design: resolved.design,
  });

  return (
    <StorefrontThemeScope style={resolved.style}>
      <StorePageShell chrome={chrome} design={resolved.design} className="min-h-screen flex flex-col">
        <main className="flex-1">
          <CheckoutPageClient
            variant={resolved.design.commerce.checkout.variant}
            color={business.primary_color ?? "#1AB554"}
            basePath={basePath}
            businessId={business.id}
            shippingCost={Number(storeSettings?.default_shipping_cost ?? 20)}
            freeShippingThreshold={pragTransportGratuit(storeSettings?.free_shipping_threshold)}
            emailFieldConfig={pageContent.checkout_config?.email_field ?? { enabled: true, required: false }}
            initialDiscountCode={code ?? null}
          />
        </main>
      </StorePageShell>
    </StorefrontThemeScope>
  );
}
