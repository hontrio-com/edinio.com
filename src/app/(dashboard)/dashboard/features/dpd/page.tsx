import { redirect } from "next/navigation";
import { mascheazaConfig } from "@/lib/integrari/secrete";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { DpdConfigClient } from "@/components/dashboard/DpdConfigClient";
import type { DpdConfig } from "@/lib/dpd";

export default async function DpdPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const config = (mascheazaConfig("dpd_config", settings?.dpd_config) as DpdConfig | null) ?? null;

  return <DpdConfigClient businessId={business.id} initialConfig={config} />;
}
