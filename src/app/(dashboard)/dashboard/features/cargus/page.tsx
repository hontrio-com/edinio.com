import { redirect } from "next/navigation";
import { getCachedUser, getCachedCurrentBusiness, getCachedStoreSettings } from "@/lib/supabase/cached-queries";
import { CargusConfigClient } from "@/components/dashboard/CargusConfigClient";
import type { CargusConfig } from "@/lib/cargus";

export default async function CargusPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const business = await getCachedCurrentBusiness(user.id);

  if (!business) redirect("/dashboard");

  const settings = await getCachedStoreSettings(business.id);

  const config = (settings?.cargus_config as CargusConfig | null) ?? null;

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <img
          src="/integrations/cargus.svg"
          alt="Cargus"
          className="h-8 w-auto object-contain"
        />
        <div>
          <h1 className="text-xl font-semibold text-foreground">Cargus</h1>
          <p className="text-sm text-muted-foreground">
            Genereaza AWB-uri Cargus direct din comenzile magazinului tau.
          </p>
        </div>
      </div>

      <CargusConfigClient businessId={business.id} initialConfig={config} />
    </div>
  );
}
