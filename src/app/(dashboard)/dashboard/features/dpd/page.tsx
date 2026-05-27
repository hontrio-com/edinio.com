import { redirect } from "next/navigation";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { DpdConfigClient } from "@/components/dashboard/DpdConfigClient";
import type { DpdConfig } from "@/lib/dpd";

export default async function DpdPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const config = (settings?.dpd_config as DpdConfig | null) ?? null;

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <img
          src="/integrations/dpd.svg"
          alt="DPD"
          className="h-8 w-auto object-contain"
        />
        <div>
          <h1 className="text-xl font-semibold text-foreground">DPD</h1>
          <p className="text-sm text-muted-foreground">
            Genereaza AWB-uri DPD direct din comenzile magazinului tau.
          </p>
        </div>
      </div>

      <DpdConfigClient businessId={business.id} initialConfig={config} />
    </div>
  );
}
