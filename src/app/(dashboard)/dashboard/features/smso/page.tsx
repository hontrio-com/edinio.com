import { redirect } from "next/navigation";
import { getCachedUser, getCachedCurrentBusiness, getCachedStoreSettings } from "@/lib/supabase/cached-queries";
import { SmsoConfigClient } from "@/components/dashboard/SmsoConfigClient";
import type { SmsoConfig } from "@/lib/smso";

export default async function SmsoPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const business = await getCachedCurrentBusiness(user.id);

  if (!business) redirect("/dashboard");

  const settings = await getCachedStoreSettings(business.id);

  const smsoConfig: SmsoConfig = (settings?.smso_config as SmsoConfig | null) ?? {
    enabled: false,
    api_key: "",
    sender_id: "",
  };

  return <SmsoConfigClient businessId={business.id} initialConfig={smsoConfig} />;
}
