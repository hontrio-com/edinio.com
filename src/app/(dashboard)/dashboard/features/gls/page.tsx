import { redirect } from "next/navigation";
import { mascheazaConfig } from "@/lib/integrari/secrete";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { GlsConfigClient } from "@/components/dashboard/GlsConfigClient";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import type { GlsConfig } from "@/lib/gls/client";

export default async function GlsPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  /*
   * ⚠ `mascheazaConfig` inlocuieste parola cu un substituent inainte sa ajunga in
   * browser. Fara ea, parola MyGLS ar pleca in HTML-ul paginii la fiecare
   * incarcare a setarilor.
   */
  const config = (mascheazaConfig("gls_config", settings?.gls_config) as GlsConfig | null) ?? null;

  return (
    <div className="p-6 max-w-2xl">
      <IntegrationHeader
        id="gls"
        description="Genereaza AWB-uri GLS direct din comenzile magazinului tau."
      />
      <GlsConfigClient businessId={business.id} initialConfig={config} />
    </div>
  );
}
