import { redirect } from "next/navigation";
import { mascheazaConfig } from "@/lib/integrari/secrete";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { CurieraConfigClient } from "@/components/dashboard/CurieraConfigClient";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import type { CurieraConfig } from "@/lib/curiera/client";

export default async function CurieraPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  /*
   * ⚠ `mascheazaConfig` inlocuieste cheia API cu un substituent inainte sa ajunga in
   * browser. Fara ea, cheia ar pleca in HTML-ul paginii la fiecare incarcare, iar ea e
   * singura credentiala: cine o are emite si anuleaza AWB-uri pe contul comerciantului.
   */
  const config = (mascheazaConfig("curiera_config", settings?.curiera_config) as CurieraConfig | null) ?? null;

  return (
    <div className="p-6 max-w-2xl">
      <IntegrationHeader
        id="curiera"
        description="Genereaza AWB-uri Curiera din comenzi, cu ramburs, livrare la adresa sau in lockere FANbox, si urmarirea coletului."
      />
      <CurieraConfigClient businessId={business.id} initialConfig={config} />
    </div>
  );
}
