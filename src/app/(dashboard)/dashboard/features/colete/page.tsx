import { getCachedUser, getCachedCurrentBusiness, getCachedStoreSettings } from "@/lib/supabase/cached-queries";
import { redirect } from "next/navigation";
import ColeteConfigClient from "@/components/dashboard/ColeteConfigClient";
import type { COConfig } from "@/lib/colete";

export default async function ColetePage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const business = await getCachedCurrentBusiness(user.id);

  if (!business) redirect("/dashboard");

  const settings = await getCachedStoreSettings(business.id);

  const coleteConfig = (settings?.colete_config as COConfig | null) ?? null;

  return <ColeteConfigClient businessId={business.id} initialConfig={coleteConfig} />;
}
