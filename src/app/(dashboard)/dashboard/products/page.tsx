import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { ProductsClient } from "@/components/dashboard/ProductsClient";
import { getProductLimit } from "@/lib/plan-limits";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const [{ data: bizRow }, { search: searchQuery }, { data: profile }] = await Promise.all([
    supabase
      .from("businesses")
      .select("id, products(id, name, slug, sku, price, compare_at_price, images, category, is_active, is_featured, track_inventory, stock_quantity, sort_order, created_at, business_id), categories(id, name, parent_id, sort_order)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single(),
    searchParams,
    supabase.from("users_profile").select("plan").eq("id", user.id).single(),
  ]);

  if (!bizRow) redirect("/dashboard");

  const products = Array.isArray(bizRow.products)
    ? [...bizRow.products].sort((a, b) => {
        if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      })
    : [];

  const categories = Array.isArray(bizRow.categories)
    ? [...bizRow.categories].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
    : [];

  const plan = profile?.plan ?? "free";
  const productLimit = getProductLimit(plan);

  return (
    <div className="p-6">
      <ProductsClient
        products={products}
        businessId={bizRow.id}
        initialSearch={searchQuery ?? ""}
        categories={categories}
        productLimit={productLimit}
        productCount={products.length}
        plan={plan}
      />
    </div>
  );
}
