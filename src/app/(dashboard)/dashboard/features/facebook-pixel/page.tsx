import { redirect } from "next/navigation";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { FacebookPixelConfigClient } from "@/components/dashboard/FacebookPixelConfigClient";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import type { MarketingConfig } from "@/lib/marketing";

export default async function FacebookPixelPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const config = (settings?.marketing_config as MarketingConfig | null) ?? null;

  return (
    <div className="p-6 max-w-2xl">
      <IntegrationHeader id="facebook-pixel" description="Urmareste vizitatorii si optimizeaza campaniile tale pe Facebook si Instagram." />
      <FacebookPixelConfigClient businessId={business.id} initialConfig={config} />
    </div>
  );
}
