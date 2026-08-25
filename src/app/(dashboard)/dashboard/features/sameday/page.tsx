import { redirect } from "next/navigation";
import { mascheazaConfig } from "@/lib/integrari/secrete";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { SamedayConfigClient } from "@/components/dashboard/SamedayConfigClient";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import type { SamedayConfig } from "@/lib/sameday/client";

export default async function SamedayPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const config = (mascheazaConfig("sameday_config", settings?.sameday_config) as SamedayConfig | null) ?? null;

  return (
    <div className="p-6 max-w-2xl">
      <IntegrationHeader id="sameday" description="Genereaza AWB-uri Sameday direct din comenzile magazinului tau." />
      <SamedayConfigClient businessId={business.id} initialConfig={config} />
    </div>
  );
}
