import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { ProductForm } from "@/components/dashboard/ProductForm";
import { parseShippingClasses } from "@/lib/shipping/rules";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

export default async function NewProductPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const [{ data: business }, ] = await Promise.all([
    supabase.from("businesses").select("id, store_settings(google_merchant_config, shipping_classes)").eq("user_id", user.id).order("created_at").limit(1).single(),
  ]);
  if (!business) redirect("/dashboard");

  const settings = Array.isArray(business.store_settings) ? business.store_settings[0] : business.store_settings;
  const gmcConfig = settings?.google_merchant_config as { connected?: boolean; account_id?: string } | null;
  const gmcConnected = !!gmcConfig?.connected && !!gmcConfig?.account_id;
  const shippingClasses = parseShippingClasses(settings?.shipping_classes);

  // Windowed past the 1000-row PostgREST cap so big imported taxonomies
  // stay complete in the category dropdown.
  const categories = await fetchAllRows("dashboard.product-new.categories", (from, to) =>
    supabase
      .from("categories")
      .select("id, name, parent_id")
      .eq("business_id", business.id)
      .order("sort_order")
      .order("name")
      .order("id")
      .range(from, to)
  );

  return (
    <ProductForm
      businessId={business.id}
      categories={categories}
      gmcConnected={gmcConnected}
      shippingClasses={shippingClasses}
    />
  );
}
