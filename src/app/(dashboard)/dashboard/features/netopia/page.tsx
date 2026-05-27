import { getCachedUser, getCachedCurrentBusiness, getCachedStoreSettings } from "@/lib/supabase/cached-queries";
import { redirect } from "next/navigation";
import NetopiaConfigClient from "@/components/dashboard/NetopiaConfigClient";
import type { NetopiaConfig } from "@/lib/netopia";

export default async function NetopiaPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const business = await getCachedCurrentBusiness(user.id);

  if (!business) redirect("/dashboard");

  const settings = await getCachedStoreSettings(business.id);

  const netopiaConfig = (settings?.netopia_config as NetopiaConfig | null) ?? null;

  return (
    <NetopiaConfigClient businessId={business.id} initialConfig={netopiaConfig} />
  );
}
