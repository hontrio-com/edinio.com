import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { getBundleEligibleProducts } from "@/lib/actions/bundle.actions";
import { BundleForm } from "@/components/dashboard/BundleForm";
import { readBundleConfig } from "@/lib/bundles";

export default async function EditBundlePage({ params, searchParams }: { params: Promise<{ bundleId: string }>; searchParams: Promise<{ page?: string }> }) {
  const { bundleId } = await params;
  const { page } = await searchParams;
  // Preserve the bundles-list page the merchant came from, so saving returns there.
  const backHref = page && Number(page) > 1 ? `/dashboard/products/bundles?page=${encodeURIComponent(page)}` : "/dashboard/products/bundles";
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: biz } = await supabase
    .from("businesses").select("id, categories(id, name)").eq("user_id", user.id).eq("type", "ministore").limit(1).single();
  if (!biz) redirect("/dashboard");

  const { data: row } = await supabase
    .from("products")
    .select("id, name, slug, description, images, category, is_active, is_featured, page_sections")
    .eq("id", bundleId).eq("business_id", biz.id).eq("is_bundle", true).single();
  if (!row) notFound();

  const cfg = readBundleConfig(row.page_sections);
  const eligible = await getBundleEligibleProducts(biz.id);
  const categories = Array.isArray(biz.categories) ? biz.categories.map((c) => ({ id: c.id, name: c.name })) : [];

  const bundle = {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    images: Array.isArray(row.images) ? (row.images as string[]) : [],
    category: row.category,
    is_active: row.is_active,
    is_featured: row.is_featured,
    items: cfg?.items ?? [],
    pricing_mode: cfg?.pricing_mode ?? "discount_percent" as const,
    discount_percent: cfg?.discount_percent,
    discount_amount: cfg?.discount_amount,
  };

  return (
    <div className="p-6">
      <BundleForm businessId={biz.id} eligibleProducts={eligible} categories={categories} bundle={bundle} backHref={backHref} />
    </div>
  );
}
