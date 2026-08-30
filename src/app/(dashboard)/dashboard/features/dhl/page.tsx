import { redirect } from "next/navigation";
import { mascheazaConfig } from "@/lib/integrari/secrete";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { DhlConfigClient } from "@/components/dashboard/DhlConfigClient";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import type { DhlConfig } from "@/lib/dhl/client";

export default async function DhlPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");
  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  /* ⚠ `mascheazaConfig` inlocuieste `password` cu un substituent inainte sa ajunga in browser.
     ⚠ Daca `dhl_config` n-ar fi in `CAMPURI_SECRETE`, functia ar intoarce configul NEATINS —
     adica exact parola MyDHL API in HTML-ul paginii, tacut. */
  const config = (mascheazaConfig("dhl_config", settings?.dhl_config) as DhlConfig | null) ?? null;

  return (
    <div className="p-6 max-w-2xl">
      <IntegrationHeader
        id="dhl"
        description="Colete prin DHL Express: livrari interne in Romania (DHL Express Domestic) si in toata lumea (Express Worldwide, Economy Select, Express 9:00 si 12:00), cu tarifele contractului tau si eticheta in PDF. Fara plata la livrare — DHL Express nu ofera ramburs cu expediere din Romania."
      />
      <DhlConfigClient businessId={business.id} initialConfig={config} />
    </div>
  );
}
