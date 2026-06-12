import { redirect } from "next/navigation";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { DpdConfigClient } from "@/components/dashboard/DpdConfigClient";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import type { DpdConfig } from "@/lib/dpd";

export default async function DpdPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const config = (settings?.dpd_config as DpdConfig | null) ?? null;

  return (
    <div className="p-6 max-w-2xl">
      <IntegrationHeader id="dpd" description="Genereaza AWB-uri DPD direct din comenzile magazinului tau." />
      <DpdConfigClient businessId={business.id} initialConfig={config} />
    </div>
  );
}
