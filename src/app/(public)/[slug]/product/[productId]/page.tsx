import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ProductPage } from "@/components/ministore/ProductPage";

interface Props {
  params: Promise<{ slug: string; productId: string }>;
}

// React cache() deduplicates this call between generateMetadata and the page
// — a single DB round trip serves both, per request.
const getProductCached = cache(async (productId: string, slug: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("name, description, page_sections, price, images")
    .eq("id", productId)
    .single();
  return data ? { ...data, slug } : null;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { productId, slug } = await params;
  const product = await getProductCached(productId, slug);
  if (!product) return {};
  const seo = (product.page_sections as { seo?: { title?: string; description?: string } } | null)?.seo;
  const title = seo?.title || product.name;
  const description = seo?.description
    || (product.description ? product.description.replace(/<[^>]+>/g, "").slice(0, 155) : product.name);
  const images = product.images as string[] | null;
  const url = `https://edinio.com/${slug}/product/${productId}`;
  return {
    title,
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

function buildProductJsonLd(product: { name: string; description: string | null; price: number | null; images: unknown }, slug: string, productId: string) {
  const images = product.images as string[] | null;
  const desc = product.description ? product.description.replace(/<[^>]+>/g, "").slice(0, 500) : product.name;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: desc,
    url: `https://edinio.com/${slug}/product/${productId}`,
    ...(images?.length ? { image: images } : {}),
    offers: {
      "@type": "Offer",
      priceCurrency: "RON",
      price: product.price ?? 0,
      availability: "https://schema.org/InStock",
      url: `https://edinio.com/${slug}/product/${productId}`,
    },
  };
}

export default async function ProductDetailPage({ params }: Props) {
  const { slug, productId } = await params;
  const supabase = await createClient();

  // business + store_settings in one query (join), product in parallel — 1 round trip
  const [{ data: businessRaw }, { data: product }] = await Promise.all([
    supabase
      .from("businesses")
      .select("*, store_settings(*)")
      .eq("slug", slug)
      .single(),
    supabase.from("products").select("*").eq("id", productId).single(),
  ]);

  if (!businessRaw || !product || product.business_id !== businessRaw.id || !product.is_active) notFound();

  const rawSettings = (businessRaw as unknown as { store_settings: unknown }).store_settings;
  const storeSettings = Array.isArray(rawSettings) ? (rawSettings[0] ?? null) : (rawSettings ?? null);

  // business without the nested store_settings key (ProductPage doesn't expect it)
  const { store_settings: _ignored, ...business } = businessRaw as typeof businessRaw & { store_settings: unknown };

  // Detect custom domain access
  const headersList = await headers();
  const host = (headersList.get("host") ?? "").split(":")[0];
  const isCustomDomain = business.custom_domain && host === business.custom_domain;
  const basePath = isCustomDomain ? "" : `/${business.slug}`;

  const jsonLd = buildProductJsonLd(product, slug, productId);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ProductPage
        business={business as never}
        product={product}
        storeSettings={storeSettings as never}
        basePath={basePath}
      />
    </>
  );
}
