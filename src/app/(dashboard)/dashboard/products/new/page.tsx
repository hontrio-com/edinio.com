import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { ProductForm } from "@/components/dashboard/ProductForm";

export default async function NewProductPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: business } = await supabase
    .from("businesses")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .single();
  if (!business) redirect("/dashboard");

  // store_settings holds courier/payment secrets — fetch ONLY the public-safe
  // columns the storefront preview needs (same set the public product page reads).
  const [{ data: categories }, { data: storeSettings }] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, parent_id")
      .eq("business_id", business.id)
      .order("sort_order")
      .order("name"),
    supabase
      .from("store_settings")
      .select("page_content, store_policies, default_shipping_cost, free_shipping_threshold, min_order_amount")
      .eq("business_id", business.id)
      .single(),
  ]);

  return (
    <ProductForm
      businessId={business.id}
      categories={categories ?? []}
      business={business}
      storeSettings={storeSettings as never}
    />
  );
}
