import { redirect } from "next/navigation";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { CargusConfigClient } from "@/components/dashboard/CargusConfigClient";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import type { CargusConfig } from "@/lib/cargus";

export default async function CargusPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const config = (settings?.cargus_config as CargusConfig | null) ?? null;

  return (
    <div className="p-6 max-w-2xl">
      <IntegrationHeader id="cargus" description="Genereaza AWB-uri Cargus direct din comenzile magazinului tau." />
      <CargusConfigClient businessId={business.id} initialConfig={config} />
    </div>
  );
}
