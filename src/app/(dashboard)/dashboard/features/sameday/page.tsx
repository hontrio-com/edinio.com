import { redirect } from "next/navigation";
import { getCachedUser, getCachedCurrentBusiness, getCachedStoreSettings } from "@/lib/supabase/cached-queries";
import { SamedayConfigClient } from "@/components/dashboard/SamedayConfigClient";
import type { SamedayConfig } from "@/lib/sameday";

export default async function SamedayPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const business = await getCachedCurrentBusiness(user.id);

  if (!business) redirect("/dashboard");

  const settings = await getCachedStoreSettings(business.id);

  const config = (settings?.sameday_config as SamedayConfig | null) ?? null;

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <img
          src="/integrations/sameday.svg"
          alt="Sameday"
          className="h-8 w-auto object-contain"
        />
        <div>
          <h1 className="text-xl font-semibold text-foreground">Sameday</h1>
          <p className="text-sm text-muted-foreground">
            Genereaza AWB-uri Sameday direct din comenzile magazinului tau.
          </p>
        </div>
      </div>

      <SamedayConfigClient businessId={business.id} initialConfig={config} />
    </div>
  );
}
