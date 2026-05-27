import { redirect } from "next/navigation";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { FgoConfigClient } from "@/components/dashboard/FgoConfigClient";
import type { FgoConfig } from "@/lib/fgo";

export default async function FgoPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const config = (settings?.fgo_config as FgoConfig | null) ?? null;

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <img
          src="/integrations/fgo.svg"
          alt="fGO"
          className="h-8 w-auto object-contain"
        />
        <div>
          <h1 className="text-xl font-semibold text-foreground">fGO Facturare</h1>
          <p className="text-sm text-muted-foreground">
            Genereaza automat facturi fGO pentru comenzile din magazinul tau.
          </p>
        </div>
      </div>

      <FgoConfigClient businessId={business.id} initialConfig={config} />
    </div>
  );
}
