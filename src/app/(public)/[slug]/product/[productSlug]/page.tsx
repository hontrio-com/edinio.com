import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeHtml } from "@/lib/utils/sanitize-html";
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
  const url = `https://www.edinio.com/${slug}/product/${canonicalSlug}`;
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

function buildProductJsonLd(product: { name: string; description: string | null; price: number | null; images: unknown }, slug: string, productSlug: string) {
  const images = product.images as string[] | null;
  const desc = product.description ? product.description.replace(/<[^>]+>/g, "").slice(0, 500) : product.name;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: desc,
    url: `https://www.edinio.com/${slug}/product/${productSlug}`,
    ...(images?.length ? { image: images } : {}),
    offers: {
      "@type": "Offer",
      priceCurrency: "RON",
      price: product.price ?? 0,
      availability: "https://schema.org/InStock",
      url: `https://www.edinio.com/${slug}/product/${productSlug}`,
    },
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
    .select("page_content, store_policies, default_shipping_cost, free_shipping_threshold")
    .eq("business_id", business.id)
    .single();

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

  const jsonLd = buildProductJsonLd(product, slug, product.slug ?? productSlug);

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
