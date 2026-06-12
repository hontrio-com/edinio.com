import { redirect } from "next/navigation";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { GoogleAdsConfigClient } from "@/components/dashboard/GoogleAdsConfigClient";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import type { MarketingConfig } from "@/lib/marketing";

export default async function GoogleAdsPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const config = (settings?.marketing_config as MarketingConfig | null) ?? null;

  return (
    <div className="p-6 max-w-2xl">
      <IntegrationHeader id="google-ads" description="Urmareste conversiile si optimizeaza campaniile tale pe Google." />
      <GoogleAdsConfigClient businessId={business.id} initialConfig={config} />
    </div>
  );
}
