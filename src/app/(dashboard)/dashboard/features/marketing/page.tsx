import { redirect } from "next/navigation";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { MarketingConfigClient } from "@/components/dashboard/MarketingConfigClient";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import type { MarketingConfig } from "@/lib/marketing";

export default async function MarketingPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const config = (settings?.marketing_config as MarketingConfig | null) ?? null;

  return (
    <div className="p-6 max-w-2xl">
      <IntegrationHeader id="marketing" description="Conecteaza pixelii de tracking pentru a optimiza campaniile tale publicitare." />
      <MarketingConfigClient businessId={business.id} initialConfig={config} />
    </div>
  );
}
