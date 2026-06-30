import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseStoreSeo, deriveStoreTitle, deriveStoreDescription } from "@/lib/seo";
import { MiniStoreRenderer } from "@/components/ministore/MiniStoreRenderer";
import { ProductPage } from "@/components/ministore/ProductPage";
import { SuspendedStorePage } from "@/components/ministore/SuspendedStorePage";
import { parseStoreMode } from "@/lib/storefront/store-mode";
import { getStoreProduct, enrichStoreProduct } from "@/lib/storefront/product-data";
import { buildProductJsonLd } from "@/lib/storefront/product-jsonld";
import type { Json } from "@/types/database.types";
import { headers } from "next/headers";

interface Props { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }>; }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  // Read via the service role: the SEO overrides live in store_settings, which
  // is no longer anon-readable, so a nested anon select would return null there.
  const { data: business } = await createAdminClient()
    .from("businesses")
    .select("id, business_name, store_name, tagline, description, store_city, cover_url, custom_domain, store_settings(page_content)")
    .eq("slug", slug)
    .single();
  if (!business) return {};

  // Merchant overrides (Settings > SEO) win; otherwise fall back to the
  // auto-derived defaults (single source of truth in @/lib/seo).
  const rawSettings = (business as unknown as { store_settings: { page_content: unknown } | { page_content: unknown }[] | null }).store_settings;
  const settings = Array.isArray(rawSettings) ? rawSettings[0] : rawSettings;
  const seo = parseStoreSeo(settings?.page_content ?? null);

  const displayName = business.store_name ?? business.business_name;
  const title = seo.title || deriveStoreTitle(displayName, business.store_city);
  const description = seo.description || deriveStoreDescription({ tagline: business.tagline, description: business.description, displayName });
  // When a custom domain is configured, consolidate SEO to it (so edinio.com/slug
  // also points its canonical at the store's own domain).
  const url = business.custom_domain ? `https://${business.custom_domain}` : `https://www.edinio.com/${slug}`;

  // One Product Store: the homepage *is* the chosen product's landing page, so its
  // metadata comes from that product (canonical stays on the homepage URL). Store
  // SEO overrides (Settings > SEO) still win when set.
  const storeMode = parseStoreMode(settings?.page_content ?? null);
  if (storeMode.mode === "one_product" && storeMode.productId) {
    const product = await getStoreProduct(business.id, storeMode.productId);
    if (product) {
      const ps = product.page_sections as { seo?: { title?: string; description?: string }; short_description?: string } | null;
      const opsTitle = seo.title || ps?.seo?.title || product.name;
      const opsDescription = seo.description
        || ps?.seo?.description
        || (ps?.short_description ? ps.short_description.replace(/<[^>]+>/g, "").slice(0, 155) : "")
        || (product.description ? product.description.replace(/<[^>]+>/g, "").slice(0, 155) : product.name);
      const pImgs = product.images as string[] | null;
      const opsImage = seo.ogImage || pImgs?.[0] || business.cover_url;
      const opsImages = opsImage ? [opsImage] : [];
      return {
        title: { absolute: opsTitle },
        description: opsDescription,
        ...(seo.noindex ? { robots: { index: false, follow: true } } : {}),
        openGraph: { title: opsTitle, description: opsDescription, url, images: opsImages },
        twitter: {
          card: opsImages.length ? "summary_large_image" : "summary",
          title: opsTitle,
          description: opsDescription,
          ...(opsImages.length ? { images: opsImages } : {}),
        },
        alternates: { canonical: url },
      };
    }
    // Chosen product missing/inactive — fall through to the store metadata below.
  }

  const ogImage = seo.ogImage || business.cover_url;
  const images = ogImage ? [ogImage] : [];
  return {
    // `absolute` strips the root layout's "%s | Edinio" template — storefronts
    // must show only the merchant's own name in Google / browser tabs.
    title: { absolute: title },
    description,
    // Advanced opt-in: hide the homepage from search. "follow" stays on so
    // crawlers still reach the (indexable) product pages it links to.
    ...(seo.noindex ? { robots: { index: false, follow: true } } : {}),
    openGraph: { title, description, url, images },
    twitter: {
      card: images.length ? "summary_large_image" : "summary",
      title,
      description,
      ...(images.length ? { images } : {}),
    },
    alternates: { canonical: url },
  };
}

export default async function SlugPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  const initialPage = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const supabase = await createClient();

  const [{ data: business }, { data: { user } }] = await Promise.all([
    supabase.from("businesses").select("*").eq("slug", slug).single(),
    supabase.auth.getUser(),
  ]);

  if (!business) notFound();

  const isOwner = user?.id === business.user_id;

  if (!business.is_published && !isOwner) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-2xl mb-6 mx-auto"
          style={{ backgroundColor: business.primary_color }}>
          {(business.store_name ?? business.business_name)[0]?.toUpperCase()}
        </div>
        <h1 className="text-2xl font-semibold text-foreground mb-2">{business.store_name ?? business.business_name}</h1>
        <p className="text-muted-foreground mb-6">Magazinul este in curand disponibil.</p>
        {business.phone && (
          <a href={`tel:${business.phone}`}
            className="inline-flex items-center gap-2 px-5 py-3 text-sm font-medium text-white rounded-xl transition-colors"
            style={{ backgroundColor: business.primary_color }}>
            Contacteaza-ne
          </a>
        )}
      </div>
    );
  }

  // Check suspension or trial expiry — show suspended page to visitors.
  // Owners can still access their store to preview it.
  if (!isOwner) {
    let isSuspended = false;

    // Grace period expired (failed payment)
    if (business.suspended_until) {
      isSuspended = new Date(business.suspended_until) < new Date();
    }

    // Trial expired — use admin client to bypass RLS (anonymous visitors can't read users_profile)
    if (!isSuspended) {
      const admin = createAdminClient();
      const { data: ownerProfile } = await admin
        .from("users_profile")
        .select("plan, plan_expires_at")
        .eq("id", business.user_id)
        .single();

      if ((ownerProfile?.plan === "free" || ownerProfile?.plan === "trial") && ownerProfile?.plan_expires_at) {
        isSuspended = new Date(ownerProfile.plan_expires_at) < new Date();
      }
    }

    if (isSuspended) {
      return (
        <SuspendedStorePage
          businessName={business.store_name ?? business.business_name}
          primaryColor={business.primary_color}
          phone={business.phone}
        />
      );
    }
  }

  const [{ data: products }, { data: storeSettings }, { data: categoriesData }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, slug, description, price, compare_at_price, images, category, is_featured, is_active, is_bundle, track_inventory, stock_quantity, sort_order, created_at, business_id, page_sections, weight_grams")
      .eq("business_id", business.id)
      .eq("is_active", true)
      .order("is_featured", { ascending: false })
      .order("sort_order"),
    createAdminClient()
      .from("store_settings")
      .select("id, business_id, page_content, store_policies, default_shipping_cost, free_shipping_threshold, min_order_amount")
      .eq("business_id", business.id)
      .single(),
    supabase
      .from("categories")
      .select("id, name, parent_id, image_url, sort_order")
      .eq("business_id", business.id)
      .order("sort_order"),
  ]);

  // Detect custom domain access
  const headersList = await headers();
  const host = (headersList.get("host") ?? "").split(":")[0];
  const isCustomDomain = business.custom_domain && host === business.custom_domain;
  const basePath = isCustomDomain ? "" : `/${business.slug}`;

  // Fire-and-forget analytics (skip for owner)
  if (!isOwner) {
    const ua = headersList.get("user-agent") ?? "";
    const device = /mobile/i.test(ua) ? "mobile" : /tablet/i.test(ua) ? "tablet" : "desktop";
    supabase.from("site_analytics").insert({ business_id: business.id, event_type: "visit", device, country: "RO" }).then(() => {});
  }

  // One Product Store: render the chosen product's landing page as the homepage,
  // reusing the same ProductPage component as /product/[slug]. Falls back to the
  // catalog below if the product is missing/inactive (defence in depth — the
  // Settings toggle already requires a product before enabling this mode).
  const storeMode = parseStoreMode((storeSettings?.page_content as Json) ?? null);
  if (storeMode.mode === "one_product" && storeMode.productId) {
    const product = await getStoreProduct(business.id, storeMode.productId);
    if (product) {
      const { altMap, hasCardPayment, bundleComponents } = await enrichStoreProduct(business, product);
      // Product structured data for the landing page. The product's canonical URL
      // is this homepage (the /product/<main> URL 301s here), so the JSON-LD points
      // at the homepage too — mirrors the shipping/delivery used on the product route.
      const opsCanonical = isCustomDomain ? `https://${business.custom_domain}` : `https://www.edinio.com/${business.slug}`;
      const opsShippingCost = Number(storeSettings?.default_shipping_cost ?? 0) || 0;
      const opsDe = (storeSettings?.page_content as { delivery_estimate?: { enabled?: boolean; min_days?: number; max_days?: number } } | null)?.delivery_estimate;
      const opsDelivery = opsDe?.enabled ? { min: opsDe.min_days ?? 1, max: opsDe.max_days ?? 3 } : { min: 1, max: 3 };
      const opsJsonLd = buildProductJsonLd(product, opsCanonical, business.store_name ?? business.business_name, { cost: opsShippingCost, min: opsDelivery.min, max: opsDelivery.max });
      return (
        <>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(opsJsonLd) }}
          />
          <ProductPage
            business={business}
            product={product}
            storeSettings={storeSettings as never}
            basePath={basePath}
            hasCardPayment={hasCardPayment}
            bundleComponents={bundleComponents}
            altMap={altMap}
            isHome
          />
        </>
      );
    }
  }

  const displayName = business.store_name ?? business.business_name;
  const canonicalUrl = isCustomDomain ? `https://${business.custom_domain}` : `https://www.edinio.com/${business.slug}`;
  const storeJsonLd = {
    "@context": "https://schema.org",
    "@type": "Store",
    name: displayName,
    url: canonicalUrl,
    ...(business.description ? { description: business.description.slice(0, 500) } : {}),
    ...(business.cover_url ? { image: business.cover_url } : {}),
    ...(business.logo_url ? { logo: business.logo_url } : {}),
    ...(business.store_city ? {
      address: {
        "@type": "PostalAddress",
        addressLocality: business.store_city,
        addressCountry: "RO",
      },
    } : {}),
    ...(business.phone ? { telephone: business.phone } : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(storeJsonLd) }}
      />
      <MiniStoreRenderer
        business={business}
        products={products ?? []}
        storeSettings={storeSettings}
        basePath={basePath}
        categories={categoriesData ?? []}
        initialPage={initialPage}
      />
    </>
  );
}
