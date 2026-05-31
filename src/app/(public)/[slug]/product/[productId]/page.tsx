import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
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
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: `https://edinio.com/${slug}/product/${productId}`,
      ...(images?.[0] ? { images: [{ url: images[0] }] } : {}),
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

  return (
    <ProductPage
      business={business as never}
      product={product}
      storeSettings={storeSettings as never}
    />
  );
}
