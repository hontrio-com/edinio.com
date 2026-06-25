import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeHtml } from "@/lib/utils/sanitize-html";
import { getPublicStoreConfig } from "@/lib/actions/store.actions";
import { storeBaseUrl } from "@/lib/seo";
import { readBundleConfig } from "@/lib/bundles";
import { ProductPage } from "@/components/ministore/ProductPage";

interface Props {
  params: Promise<{ slug: string; productSlug: string }>;
}

// React cache() deduplicates this call between generateMetadata and the page
// — a single DB round trip serves both, per request.
// UUID v4 pattern to detect legacy product links
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const getProductCached = cache(async (productSlug: string) => {
  const supabase = await createClient();
  const col = UUID_RE.test(productSlug) ? "id" : "slug";
  const { data } = await supabase
    .from("products")
    .select("name, description, page_sections, price, images, slug")
    .eq(col, productSlug)
    .single();
  return data;
});

// Custom domain of a store (cached per request) — needed for the canonical URL.
const getBusinessDomainCached = cache(async (slug: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("businesses").select("custom_domain").eq("slug", slug).single();
  return data?.custom_domain ?? null;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { productSlug, slug } = await params;
  const product = await getProductCached(productSlug);
  if (!product) return {};
  const ps = product.page_sections as { seo?: { title?: string; description?: string }; short_description?: string } | null;
  const seo = ps?.seo;
  const title = seo?.title || product.name;
  const description = seo?.description
    || (ps?.short_description ? ps.short_description.replace(/<[^>]+>/g, "").slice(0, 155) : "")
    || (product.description ? product.description.replace(/<[^>]+>/g, "").slice(0, 155) : product.name);
  const images = product.images as string[] | null;
  const canonicalSlug = product.slug ?? productSlug;
  const customDomain = await getBusinessDomainCached(slug);
  const url = `${storeBaseUrl({ slug, custom_domain: customDomain })}/product/${canonicalSlug}`;
  return {
    // `absolute` strips the root layout's "%s | Edinio" template.
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      type: "website",
      url,
      ...(images?.[0] ? { images: [{ url: images[0] }] } : {}),
    },
    twitter: {
      card: images?.[0] ? "summary_large_image" : "summary",
      title,
      description,
      ...(images?.[0] ? { images: [images[0]] } : {}),
    },
  };
}

// Computed once at module load (not during render — keeps the component pure).
const PRICE_VALID_UNTIL = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

function buildProductJsonLd(
  product: {
    name: string;
    description: string | null;
    price: number | null;
    images: unknown;
    sku?: string | null;
    track_inventory?: boolean;
    stock_quantity?: number | null;
  },
  productUrl: string,
  brand: string,
  shipping: { cost: number; min: number; max: number },
) {
  const images = product.images as string[] | null;
  const desc = product.description ? product.description.replace(/<[^>]+>/g, "").slice(0, 500) : product.name;
  const inStock = !product.track_inventory || (product.stock_quantity ?? 0) > 0;
  const freeReturn = shipping.cost <= 0;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: desc,
    url: productUrl,
    ...(product.sku ? { sku: product.sku } : {}),
    brand: { "@type": "Brand", name: brand },
    ...(images?.length ? { image: images } : {}),
    offers: {
      "@type": "Offer",
      priceCurrency: "RON",
      price: product.price ?? 0,
      itemCondition: "https://schema.org/NewCondition",
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      priceValidUntil: PRICE_VALID_UNTIL,
      url: productUrl,
      shippingDetails: {
        "@type": "OfferShippingDetails",
        shippingRate: { "@type": "MonetaryAmount", value: shipping.cost, currency: "RON" },
        shippingDestination: { "@type": "DefinedRegion", addressCountry: "RO" },
        deliveryTime: {
          "@type": "ShippingDeliveryTime",
          handlingTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 1, unitCode: "DAY" },
          transitTime: { "@type": "QuantitativeValue", minValue: shipping.min, maxValue: shipping.max, unitCode: "DAY" },
        },
      },
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        applicableCountry: "RO",
        returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
        merchantReturnDays: 14,
        returnMethod: "https://schema.org/ReturnByMail",
        returnFees: freeReturn ? "https://schema.org/FreeReturn" : "https://schema.org/ReturnShippingFees",
        ...(freeReturn ? {} : { returnShippingFeesAmount: { "@type": "MonetaryAmount", value: shipping.cost, currency: "RON" } }),
      },
    },
  };
}

function buildBreadcrumbJsonLd(storeName: string, storeUrl: string, productName: string, productUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: storeName, item: storeUrl },
      { "@type": "ListItem", position: 2, name: productName, item: productUrl },
    ],
  };
}

export default async function ProductDetailPage({ params }: Props) {
  const { slug, productSlug } = await params;
  const supabase = await createClient();

  // business + product in parallel (publication gated by RLS on both tables).
  const [{ data: business }, { data: product }] = await Promise.all([
    supabase
      .from("businesses")
      .select("id, user_id, slug, business_name, store_name, tagline, description, phone, whatsapp, email, address, city, logo_url, cover_url, primary_color, is_published, custom_domain, social, gallery, features")
      .eq("slug", slug)
      .single(),
    supabase.from("products").select("*").eq(UUID_RE.test(productSlug) ? "id" : "slug", productSlug).single(),
  ]);

  if (!business || !product || product.business_id !== business.id || !product.is_active) notFound();

  // SEO: redirect /product/{uuid} → /product/{slug} (301)
  if (UUID_RE.test(productSlug) && product.slug) {
    redirect(`/${slug}/product/${product.slug}`);
  }

  // store_settings is no longer anon-readable — fetch the public-safe columns via service role.
  const { data: storeSettings } = await createAdminClient()
    .from("store_settings")
    .select("page_content, store_policies, default_shipping_cost, free_shipping_threshold, min_order_amount")
    .eq("business_id", business.id)
    .single();

  // SEO: map product image URLs to their Media Library alt text / title. media_library
  // is owner-only (no anon access), so we read it via the service role here.
  const imgUrls = ((product.images as string[] | null) ?? []).filter(Boolean);
  const altMap: Record<string, string> = {};
  if (imgUrls.length) {
    const { data: media } = await createAdminClient()
      .from("media_library")
      .select("url, alt_text, title")
      .eq("business_id", business.id)
      .in("url", imgUrls);
    for (const m of media ?? []) {
      const a = m.alt_text || m.title;
      if (a) altMap[m.url] = a;
    }
  }

  // Sanitize rich-text server-side so the client renders trusted HTML only.
  product.description = sanitizeHtml(product.description);
  const psRaw = product.page_sections as Record<string, unknown> | null;
  if (psRaw && typeof psRaw.short_description === "string") {
    psRaw.short_description = sanitizeHtml(psRaw.short_description);
  }

  // Detect custom domain access
  const headersList = await headers();
  const host = (headersList.get("host") ?? "").split(":")[0];
  const isCustomDomain = business.custom_domain && host === business.custom_domain;
  const basePath = isCustomDomain ? "" : `/${business.slug}`;

  const brand = business.store_name ?? business.business_name;
  const storeBase = storeBaseUrl(business);
  const productUrl = `${storeBase}/product/${product.slug ?? productSlug}`;
  const shippingCost = Number(storeSettings?.default_shipping_cost ?? 0) || 0;
  const de = (storeSettings?.page_content as { delivery_estimate?: { enabled?: boolean; min_days?: number; max_days?: number } } | null)?.delivery_estimate;
  const delivery = de?.enabled ? { min: de.min_days ?? 1, max: de.max_days ?? 3 } : { min: 1, max: 3 };
  const jsonLd = buildProductJsonLd(product, productUrl, brand, { cost: shippingCost, min: delivery.min, max: delivery.max });
  const breadcrumbJsonLd = buildBreadcrumbJsonLd(brand, storeBase, product.name, productUrl);

  // Card payment available? (same resolver as checkout — only counts a processor
  // that is actually configured/usable). Drives the CTA label.
  const publicConfig = await getPublicStoreConfig(business.id);
  const hasCardPayment = !!publicConfig?.payment_methods?.some((m) => m.type !== "cash_on_delivery");

  // For bundles, load the component products so the page can list "what's inside".
  const bundleCfg = product.is_bundle ? readBundleConfig(product.page_sections) : null;
  let bundleComponents: {
    id: string; name: string; slug: string | null; price: number; image_url: string | null; quantity: number; out_of_stock: boolean;
  }[] = [];
  if (bundleCfg) {
    const { data: comps } = await supabase
      .from("products")
      .select("id, name, slug, price, images, track_inventory, stock_quantity")
      .eq("business_id", business.id)
      .in("id", bundleCfg.items.map((i) => i.product_id));
    const cmap = new Map((comps ?? []).map((c) => [c.id, c]));
    bundleComponents = bundleCfg.items.map((it) => {
      const c = cmap.get(it.product_id);
      return {
        id: it.product_id,
        name: c?.name ?? "Produs",
        slug: c?.slug ?? null,
        price: Number(c?.price) || 0,
        image_url: c && Array.isArray(c.images) && c.images.length ? (c.images[0] as string) : null,
        quantity: it.quantity,
        out_of_stock: !!(c && c.track_inventory && (c.stock_quantity ?? 0) < it.quantity),
      };
    });
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <ProductPage
        business={business as never}
        product={product}
        storeSettings={storeSettings as never}
        basePath={basePath}
        hasCardPayment={hasCardPayment}
        bundleComponents={bundleComponents}
        altMap={altMap}
      />
    </>
  );
}
