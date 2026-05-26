import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProductsClient } from "@/components/dashboard/ProductsClient";
import { getProductLimit } from "@/lib/plan-limits";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: business }, { search: searchQuery }, { data: profile }] = await Promise.all([
    supabase
      .from("businesses")
      .select("id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single(),
    searchParams,
    supabase.from("users_profile").select("plan").eq("id", user.id).single(),
  ]);

  if (!business) redirect("/dashboard");

  const [{ data: products }, { data: categories }] = await Promise.all([
    supabase
      .from("products")
      .select("*")
      .eq("business_id", business.id)
      .order("is_featured", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("categories")
      .select("id, name, parent_id")
      .eq("business_id", business.id)
      .order("sort_order")
      .order("name"),
  ]);

  const plan = profile?.plan ?? "free";
  const productLimit = getProductLimit(plan);
  const productCount = products?.length ?? 0;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <ProductsClient
        products={products ?? []}
        businessId={business.id}
        initialSearch={searchQuery ?? ""}
        categories={categories ?? []}
        productLimit={productLimit}
        productCount={productCount}
        plan={plan}
      />
    </div>
  );
}
