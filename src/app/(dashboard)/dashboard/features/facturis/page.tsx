import { redirect } from "next/navigation";
import { mascheazaConfig } from "@/lib/integrari/secrete";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { FacturisConfigClient } from "@/components/dashboard/FacturisConfigClient";
import type { FacturisConfig } from "@/lib/facturis/config";

/*
 * Configurarea Facturis Online. Cheia API si parola pleaca spre browser MASCATE (goale, cu
 * `_completate`): sunt secretele comerciantului si n-au ce cauta in payload-ul paginii.
 */
export default async function FacturisPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const config = (mascheazaConfig("facturis_config", settings?.facturis_config) as FacturisConfig | null) ?? null;

  return <FacturisConfigClient businessId={business.id} initialConfig={config} />;
}
