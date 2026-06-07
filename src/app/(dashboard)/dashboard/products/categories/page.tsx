import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { CategoriesClient } from "@/components/dashboard/CategoriesClient";

export default async function CategoriesPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: business } = await supabase
    .from("businesses")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .single();

  if (!business) redirect("/dashboard");

  const { data: categories } = await supabase
    .from("categories")
    .select("id, business_id, parent_id, name, sort_order, image_url, created_at, updated_at")
    .eq("business_id", business.id)
    .order("sort_order")
    .order("created_at");

  return <CategoriesClient initialCategories={categories ?? []} />;
}
