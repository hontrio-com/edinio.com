import { redirect } from "next/navigation";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { GoogleAdsConfigClient } from "@/components/dashboard/GoogleAdsConfigClient";
import type { MarketingConfig } from "@/lib/marketing-config";

export default async function GoogleAdsPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const config = (settings?.marketing_config as MarketingConfig | null) ?? null;

  return <GoogleAdsConfigClient businessId={business.id} initialConfig={config} />;
}
