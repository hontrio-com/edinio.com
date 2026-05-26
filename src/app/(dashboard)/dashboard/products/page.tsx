import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProductsClient } from "@/components/dashboard/ProductsClient";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: business }, { search: searchQuery }] = await Promise.all([
    supabase
      .from("businesses")
      .select("id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single(),
    searchParams,
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

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <ProductsClient
        products={products ?? []}
        businessId={business.id}
        initialSearch={searchQuery ?? ""}
        categories={categories ?? []}
      />
    </div>
  );
}
