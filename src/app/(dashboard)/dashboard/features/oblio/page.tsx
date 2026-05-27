import { getCachedUser, getCachedCurrentBusiness, getCachedStoreSettings } from "@/lib/supabase/cached-queries";
import { redirect } from "next/navigation";
import OblioConfigClient from "@/components/dashboard/OblioConfigClient";
import type { OblioConfig } from "@/lib/oblio";

export default async function OblioPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const business = await getCachedCurrentBusiness(user.id);

  if (!business) redirect("/dashboard");

  const settings = await getCachedStoreSettings(business.id);

  const oblioConfig = (settings?.oblio_config as OblioConfig | null) ?? null;

  return <OblioConfigClient businessId={business.id} initialConfig={oblioConfig} />;
}
