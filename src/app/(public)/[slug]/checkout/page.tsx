import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { StorePageShell } from "@/components/storefront/StorePageShell";
import { StorefrontThemeScope } from "@/components/storefront/StorefrontThemeScope";
import { buildChromeData, loadSearchCategories } from "@/lib/storefront/chrome-value";
import { checkoutOnPage } from "@/lib/storefront/design/commerce";
import { resolveDesign } from "@/lib/storefront/design/parse";
import type { StorePageContent } from "@/lib/storefront/store-content.types";
import { CheckoutPageClient } from "@/components/storefront/sections/checkout/CheckoutPageClient";

/**
 * Pagina de finalizare a comenzii.
 *
 * Exista doar pentru magazinele care si-au ales-o din catalogul de design-uri;
 * restul comanda in fereastra, peste magazin, iar aici sunt trimise inapoi.
 *
 * Nu se indexeaza: e un pas personal, cu cosul fiecarui vizitator in el.
 */
export const metadata: Metadata = { title: "Finalizeaza comanda", robots: { index: false, follow: false } };

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ code?: string }>;
}

export default async function CheckoutPage({ params, searchParams }: Props) {
  const { slug } = await params;
  // Codul de reducere vine din linkul de recuperare a cosului abandonat.
  const { code } = await searchParams;

  const supabase = await createClient();
  const { data: business } = await supabase
    .from("businesses")
    .select("id, user_id, slug, business_name, store_name, tagline, description, phone, whatsapp, email, address, city, county, cui, reg_com, store_address, store_city, store_county, logo_url, cover_url, primary_color, is_published, custom_domain, social, gallery, features")
    .eq("slug", slug)
    .single();
  if (!business) notFound();

  const admin = createAdminClient();
  const [{ data: storeSettings }, { data: produseCuGreutate }] = await Promise.all([
    admin
      .from("store_settings")
      .select("page_content, storefront_design, default_shipping_cost, free_shipping_threshold")
      .eq("business_id", business.id)
      .single(),
    // Greutatile produselor, pentru cotatia internationala DPD pe kilograme.
    // Doar cele care AU greutate: la un magazin fara livrare internationala
    // lista iese goala si interogarea nu costa nimic. Fara ele, acelasi cos ar
    // primi alt tarif pe pagina decat in fereastra.
    admin
      .from("products")
      .select("id, weight_grams")
      .eq("business_id", business.id)
      .not("weight_grams", "is", null),
  ]);

  const productWeights: Record<string, number> = {};
  for (const p of produseCuGreutate ?? []) if (p.weight_grams) productWeights[p.id] = p.weight_grams;

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

  if (!checkoutOnPage(resolved.design)) redirect(`${basePath}/`);

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
            freeShippingThreshold={storeSettings?.free_shipping_threshold ? Number(storeSettings.free_shipping_threshold) : null}
            emailFieldConfig={pageContent.checkout_config?.email_field ?? { enabled: true, required: false }}
            initialDiscountCode={code ?? null}
            productWeights={productWeights}
          />
        </main>
      </StorePageShell>
    </StorefrontThemeScope>
  );
}
