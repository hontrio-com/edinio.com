import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { ProductForm } from "@/components/dashboard/ProductForm";

interface Props {
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ page?: string }>;
}

export default async function EditProductPage({ params, searchParams }: Props) {
  const { productId } = await params;
  const { page } = await searchParams;
  // Preserve the products-list page the merchant came from, so saving returns there.
  const backHref = page && Number(page) > 1 ? `/dashboard/products?page=${encodeURIComponent(page)}` : "/dashboard/products";
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: business } = await supabase
    .from("businesses")
    .select("id, slug, is_published, store_settings(olx_config, google_merchant_config)")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .single();
  if (!business) redirect("/dashboard");

  const settings = Array.isArray(business.store_settings) ? business.store_settings[0] : business.store_settings;
  const olxConnected = !!(settings?.olx_config as { connected?: boolean } | null)?.connected;
  const gmcConfig = settings?.google_merchant_config as { connected?: boolean; account_id?: string } | null;
  const gmcConnected = !!gmcConfig?.connected && !!gmcConfig?.account_id;

  const [{ data: product }, { data: categories }] = await Promise.all([
    supabase.from("products").select("*").eq("id", productId).eq("business_id", business.id).single(),
    supabase.from("categories").select("id, name, parent_id").eq("business_id", business.id).order("sort_order").order("name"),
  ]);

  if (!product) notFound();

  return (
    <ProductForm
      businessId={business.id}
      product={product}
      categories={categories ?? []}
      backHref={backHref}
      business={business.slug ? { slug: business.slug, is_published: !!business.is_published } : undefined}
      olxConnected={olxConnected}
      gmcConnected={gmcConnected}
    />
  );
}
