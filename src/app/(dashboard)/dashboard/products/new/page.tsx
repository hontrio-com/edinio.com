import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { ProductForm } from "@/components/dashboard/ProductForm";

export default async function NewProductPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const [{ data: business }, ] = await Promise.all([
    supabase.from("businesses").select("id, store_settings(google_merchant_config)").eq("user_id", user.id).order("created_at").limit(1).single(),
  ]);
  if (!business) redirect("/dashboard");

  const settings = Array.isArray(business.store_settings) ? business.store_settings[0] : business.store_settings;
  const gmcConfig = settings?.google_merchant_config as { connected?: boolean; account_id?: string } | null;
  const gmcConnected = !!gmcConfig?.connected && !!gmcConfig?.account_id;

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
      gmcConnected={gmcConnected}
    />
  );
}
