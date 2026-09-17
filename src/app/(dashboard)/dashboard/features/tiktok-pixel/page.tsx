import { redirect } from "next/navigation";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { TikTokPixelConfigClient } from "@/components/dashboard/TikTokPixelConfigClient";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import type { MarketingConfig } from "@/lib/marketing-config";
import { getTikTokCapiStare } from "@/lib/actions/tiktok-capi.actions";

export default async function TikTokPixelPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const config = (settings?.marketing_config as MarketingConfig | null) ?? null;
  /* ⚠ Starea, nu tokenul: `getTikTokCapiStare` spune doar daca e salvat. */
  const capi = await getTikTokCapiStare(business.id);

  return (
    <div className="p-6 max-w-2xl">
      <IntegrationHeader id="tiktok-pixel" description="Urmareste conversiile si optimizeaza campaniile tale pe TikTok." />
      <TikTokPixelConfigClient businessId={business.id} initialConfig={config} capi={"error" in capi ? null : capi} />
    </div>
  );
}
