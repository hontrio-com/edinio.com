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
    .select("id, slug, is_published")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .single();
  if (!business) redirect("/dashboard");

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
    />
  );
}
