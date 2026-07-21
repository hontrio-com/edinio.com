import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import { FacebookCatalogClient } from "@/components/dashboard/FacebookCatalogClient";
import { storeBaseUrl } from "@/lib/seo";
import type { MarketingConfig } from "@/lib/marketing";

export default async function FacebookCatalogPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: biz } = await supabase
    .from("businesses")
    .select("id, slug, custom_domain, store_settings(marketing_config)")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .single();
  if (!biz) redirect("/dashboard");

  const settings = Array.isArray(biz.store_settings) ? biz.store_settings[0] : biz.store_settings;
  const pixelConfigured = !!(settings?.marketing_config as MarketingConfig | null)?.facebook_pixel_id?.trim();

  const { count } = await supabase
    .from("products").select("id", { count: "exact", head: true })
    .eq("business_id", biz.id).eq("is_active", true);

  const base = biz.slug ? storeBaseUrl({ slug: biz.slug, custom_domain: biz.custom_domain }) : "https://www.edinio.com";

  return (
    <div className="p-6 max-w-3xl">
      <IntegrationHeader id="facebook-catalog" description="Trimite produsele in Facebook si Instagram pentru reclame dinamice si Shops." />
      <FacebookCatalogClient
        feedUrl={`${base}/facebook-catalog.xml`}
        hasCustomDomain={!!biz.custom_domain}
        productCount={count ?? 0}
        pixelConfigured={pixelConfigured}
      />
    </div>
  );
}
