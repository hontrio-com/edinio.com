import { redirect } from "next/navigation";
import { mascheazaConfig } from "@/lib/integrari/secrete";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { PallexConfigClient } from "@/components/dashboard/PallexConfigClient";
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

  return <PallexConfigClient businessId={business.id} initialConfig={config} />;
}
