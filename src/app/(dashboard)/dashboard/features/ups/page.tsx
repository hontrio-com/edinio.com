import { redirect } from "next/navigation";
import { mascheazaConfig } from "@/lib/integrari/secrete";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { UpsConfigClient } from "@/components/dashboard/UpsConfigClient";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import type { UpsConfig } from "@/lib/ups/client";

export default async function UpsPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  /*
   * ⚠ `mascheazaConfig` inlocuieste `client_secret` cu un substituent inainte sa ajunga
   * in browser. Restul configurarii pleaca intreaga, si asa trebuie: `client_id` ii
   * spune comerciantului CE APLICATIE din portalul UPS a legat, `account_number`
   * („Shipper Number") se tipareste pe fiecare eticheta si pe fiecare factura UPS pe
   * care o primeste, iar adresa de expeditie nu e credentiala.
   *
   * ⚠ Daca `ups_config` n-ar fi in `CAMPURI_SECRETE`, functia ar intoarce configul
   * NEATINS — adica exact Client Secret in HTML-ul paginii, tacut.
   */
  const config = (mascheazaConfig("ups_config", settings?.ups_config) as UpsConfig | null) ?? null;

  return (
    <div className="p-6 max-w-2xl">
      <IntegrationHeader
        id="ups"
        description="Colete prin UPS: livrari interne in Romania (UPS Express, UPS Express Saver) si catre Uniunea Europeana (UPS Standard, Express Plus), cu tarifele contractului tau. Accepta plata la livrare si livrare in puncte UPS Access Point."
      />
      <UpsConfigClient businessId={business.id} initialConfig={config} />
    </div>
  );
}
