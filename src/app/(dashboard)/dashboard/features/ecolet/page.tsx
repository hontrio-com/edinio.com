import { redirect } from "next/navigation";
import { mascheazaConfig } from "@/lib/integrari/secrete";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { EcoletConfigClient } from "@/components/dashboard/EcoletConfigClient";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import type { EcoletConfig } from "@/lib/ecolet/client";

export default async function EcoletPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  /*
   * ⚠ `mascheazaConfig` inlocuieste tokenul cu un substituent inainte sa ajunga in
   * browser. Fara ea, tokenul eColet ar pleca in HTML-ul paginii la fiecare
   * incarcare — iar el e singura credentiala: cine il are poate emite transporturi
   * pe contul comerciantului.
   */
  const config = (mascheazaConfig("ecolet_config", settings?.ecolet_config) as EcoletConfig | null) ?? null;

  return (
    <div className="p-6 max-w-2xl">
      <IntegrationHeader
        id="ecolet"
        description="Platforma cu mai multi curieri: cumparatorul alege oferta in checkout, tu emiti dintr-un singur cont."
      />
      <EcoletConfigClient businessId={business.id} initialConfig={config} />
    </div>
  );
}
