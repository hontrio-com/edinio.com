import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { storeBaseUrl } from "@/lib/seo";
import { parseStoreMode, parseStoreModeFromSettings } from "@/lib/storefront/store-mode";
import { enrichStoreProduct } from "@/lib/storefront/product-data";
import { buildProductJsonLd } from "@/lib/storefront/product-jsonld";
import type { Json } from "@/types/database.types";
import { ProductPage } from "@/components/ministore/ProductPage";
import { resolveProductOffers } from "@/lib/offers/offers";

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
    .select("id, name, description, page_sections, price, images, slug")
    .eq(col, productSlug)
    .single();
  return data;
});

// Store custom domain (canonical URL) + display mode (One Product Store), cached
// per request. store_settings is not anon-readable, so this reads via the service
// role to see page_content (where the OPS flag lives).
const getBusinessMetaCached = cache(async (slug: string) => {
  const { data } = await createAdminClient()
    .from("businesses")
    .select("custom_domain, store_settings(page_content)")
    .eq("slug", slug)
    .single();
  return {
    customDomain: data?.custom_domain ?? null,
    storeMode: parseStoreModeFromSettings((data as { store_settings?: unknown } | null)?.store_settings),
  };
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
  const { customDomain, storeMode } = await getBusinessMetaCached(slug);
  const url = `${storeBaseUrl({ slug, custom_domain: customDomain })}/product/${canonicalSlug}`;
  // One Product Store: only the main product is indexable (and it 301s to the
  // homepage, handled in the page). Every other product is noindex,follow.
  const noindex = storeMode.mode === "one_product" && storeMode.productId !== product.id;
  return {
    // `absolute` strips the root layout's "%s | Edinio" template.
    title: { absolute: title },
    description,
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
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
      .select("id, user_id, slug, business_name, store_name, tagline, description, phone, whatsapp, email, address, city, county, cui, reg_com, store_address, store_city, store_county, logo_url, cover_url, primary_color, is_published, custom_domain, social, gallery, features")
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

  // Detect custom domain access (also the One Product Store homepage target).
  const headersList = await headers();
  const host = (headersList.get("host") ?? "").split(":")[0];
  const isCustomDomain = business.custom_domain && host === business.custom_domain;
  const basePath = isCustomDomain ? "" : `/${business.slug}`;

  // One Product Store: the homepage already renders this exact product as the
  // store's landing page, so the canonical /product/<main> URL is duplicate
  // content — 301 it to the homepage. Secondary products stay reachable but get
  // noindex (see generateMetadata above).
  const storeMode = parseStoreMode((storeSettings?.page_content as Json) ?? null);
  if (storeMode.mode === "one_product" && storeMode.productId === product.id) {
    redirect(basePath || "/");
  }

  // Shared enrichment (Media Library alt text, card-payment flag, bundle
  // components) + server-side rich-text sanitization of the product, in place.
  const { altMap, hasCardPayment, bundleComponents } = await enrichStoreProduct(business, product);

  // Cross-sell / FBT offers for this product. `offers` is owner-only (not anon-readable),
  // so it's resolved server-side with the service role — exactly like storeSettings above.
  const productOffers = await resolveProductOffers(createAdminClient(), business.id, {
    id: product.id, category: product.category, price: Number(product.price) || 0,
  });

  const brand = business.store_name ?? business.business_name;
  const storeBase = storeBaseUrl(business);
  const productUrl = `${storeBase}/product/${product.slug ?? productSlug}`;
  const shippingCost = Number(storeSettings?.default_shipping_cost ?? 0) || 0;
  const de = (storeSettings?.page_content as { delivery_estimate?: { enabled?: boolean; min_days?: number; max_days?: number } } | null)?.delivery_estimate;
  const delivery = de?.enabled ? { min: de.min_days ?? 1, max: de.max_days ?? 3 } : { min: 1, max: 3 };
  const jsonLd = buildProductJsonLd(product, productUrl, brand, { cost: shippingCost, min: delivery.min, max: delivery.max });
  const breadcrumbJsonLd = buildBreadcrumbJsonLd(brand, storeBase, product.name, productUrl);

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
        productOffers={productOffers}
      />
    </>
  );
}
