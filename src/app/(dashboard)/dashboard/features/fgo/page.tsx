import { redirect } from "next/navigation";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { FgoConfigClient } from "@/components/dashboard/FgoConfigClient";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import type { FgoConfig } from "@/lib/fgo";

export default async function FgoPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const config = (settings?.fgo_config as FgoConfig | null) ?? null;

  return (
    <div className="p-6 max-w-2xl">
      <IntegrationHeader id="fgo" description="Genereaza automat facturi fGO pentru comenzile din magazinul tau." />
      <FgoConfigClient businessId={business.id} initialConfig={config} />
    </div>
  );
}
