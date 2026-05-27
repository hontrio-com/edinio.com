import { getCachedUser, getCachedCurrentBusiness, getCachedStoreSettings } from "@/lib/supabase/cached-queries";
import { redirect } from "next/navigation";
import WootConfigClient from "@/components/dashboard/WootConfigClient";
import type { WootConfig } from "@/lib/woot";

export default async function WootPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const business = await getCachedCurrentBusiness(user.id);

  if (!business) redirect("/dashboard");

  const settings = await getCachedStoreSettings(business.id);

  const wootConfig = (settings?.woot_config as WootConfig | null) ?? null;

  return <WootConfigClient businessId={business.id} initialConfig={wootConfig} />;
}
