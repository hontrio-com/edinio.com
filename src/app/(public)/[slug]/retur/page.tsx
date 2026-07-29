import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { StorePageShell } from "@/components/storefront/StorePageShell";
import { StorefrontThemeScope } from "@/components/storefront/StorefrontThemeScope";
import { buildChromeData, loadSearchCategories } from "@/lib/storefront/chrome-value";
import { resolveDesign } from "@/lib/storefront/design/parse";
import type { StorePageContent } from "@/lib/storefront/store-content.types";
import { ReturnRequestClient } from "@/components/ministore/ReturnRequestClient";

// Funcția de retragere din contract — OUG 18/2026. Pagină personală/tranzitorie: noindex.
export const metadata: Metadata = { robots: { index: false } };

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ order?: string }>;
}

export default async function ReturPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { order } = await searchParams;

  const supabase = await createClient();
  const { data: business } = await supabase
    .from("businesses")
    .select("id, user_id, slug, business_name, store_name, tagline, description, phone, whatsapp, email, address, city, county, cui, reg_com, store_address, store_city, store_county, logo_url, cover_url, primary_color, is_published, custom_domain, social, gallery, features")
    .eq("slug", slug)
    .single();
  if (!business) notFound();

  const { data: storeSettings } = await createAdminClient()
    .from("store_settings")
    .select("page_content, storefront_design, default_shipping_cost, free_shipping_threshold, min_order_amount")
    .eq("business_id", business.id)
    .single();

  const color = business.primary_color ?? "#1AB554";
  const storeName = business.store_name ?? business.business_name;

  // Custom-domain aware base path (proxy rewrites customdomain.ro/x -> /slug/x).
  const host = (await headers()).get("host")?.split(":")[0] ?? "";
  const isCustomDomain = business.custom_domain && host === business.custom_domain;
  const basePath = isCustomDomain ? "" : `/${slug}`;

  // Acelasi header si footer ca pe restul magazinului. Logo-ul din continut a
  // disparut: il are acum header-ul.
  const pageContent = (storeSettings?.page_content ?? {}) as StorePageContent;
  const resolved = resolveDesign(storeSettings?.storefront_design, {
    primaryColor: color,
    pageContent: pageContent as Record<string, unknown>,
    features: (business.features as Record<string, unknown>) ?? {},
    coverUrl: business.cover_url,
    tagline: business.tagline,
  });
  const searchCategories = await loadSearchCategories(business.id, resolved.design);
  const chrome = buildChromeData({
    searchCategories, business: business as never, pageContent, basePath, design: resolved.design,
    // Transportul, pragul de livrare gratuita si comanda minima: sertarul de cos
    // se deschide acum si pe paginile fara catalog, iar fara ele n-ar putea arata
    // un total. Vezi `StoreCartPanels`.
    comert: {
      shippingCost: Number(storeSettings?.default_shipping_cost ?? 0),
      freeShippingThreshold: storeSettings?.free_shipping_threshold ?? null,
      minOrderAmount: storeSettings?.min_order_amount ?? null,
    },
  });

  return (
    <StorefrontThemeScope style={resolved.style}>
      <StorePageShell chrome={chrome} design={resolved.design} className="min-h-screen flex flex-col">
        <main className="max-w-2xl w-full mx-auto px-4 py-8 sm:py-10 flex-1">
          <h1 className="text-2xl sm:text-3xl font-black text-foreground mb-2">Retrage-te din contract</h1>
          <div className="w-12 h-1 rounded-full mb-5" style={{ backgroundColor: color }} />
          <p className="text-sm text-muted-foreground leading-relaxed mb-8">
            Conform OUG nr. 34/2014 si OUG nr. 18/2026, ai dreptul sa te retragi din contract in termen de 14 zile
            calendaristice de la primirea produsului, fara sa invoci vreun motiv. Completeaza formularul de mai jos, iar
            noi iti trimitem imediat, pe email, confirmarea cererii.
          </p>

          <ReturnRequestClient
            businessId={business.id}
            basePath={basePath}
            color={color}
            storeName={storeName}
            prefillOrder={order?.trim() ?? ""}
          />
        </main>
      </StorePageShell>
    </StorefrontThemeScope>
  );
}
