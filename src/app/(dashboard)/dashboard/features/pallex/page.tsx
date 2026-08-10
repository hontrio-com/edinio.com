import { redirect } from "next/navigation";
import { mascheazaConfig } from "@/lib/integrari/secrete";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { PallexConfigClient } from "@/components/dashboard/PallexConfigClient";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import type { PallExConfig } from "@/lib/pallex/client";

export default async function PallexPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  /*
   * ⚠ `mascheazaConfig` inlocuieste parola cu un substituent inainte sa ajunga in
   * browser. Fara ea, parola ClientPlus ar pleca in HTML-ul paginii la fiecare
   * incarcare a setarilor — iar Pall-Ex se autentifica prin HTTP Basic, deci
   * parola aia e tot ce trebuie ca sa emiti transporturi pe contractul lui.
   */
  const config = (mascheazaConfig("pallex_config", settings?.pallex_config) as PallExConfig | null) ?? null;

  return (
    <div className="p-6 max-w-2xl">
      <IntegrationHeader
        id="pallex"
        description="Transport de marfa paletizata: creeaza partide Pall-Ex direct din comenzile magazinului."
      />
      <PallexConfigClient businessId={business.id} initialConfig={config} />
    </div>
  );
}
