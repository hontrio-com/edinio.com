import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { ProductForm } from "@/components/dashboard/ProductForm";

export default async function NewProductPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const [{ data: business }, ] = await Promise.all([
    supabase.from("businesses").select("id").eq("user_id", user.id).order("created_at").limit(1).single(),
  ]);
  if (!business) redirect("/dashboard");

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name, parent_id")
    .eq("business_id", business.id)
    .order("sort_order")
    .order("name");

  return (
    <ProductForm
      businessId={business.id}
      categories={categories ?? []}
    />
  );
}
