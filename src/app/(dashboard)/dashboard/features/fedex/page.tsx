import { redirect } from "next/navigation";
import { mascheazaConfig } from "@/lib/integrari/secrete";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { FedexConfigClient } from "@/components/dashboard/FedexConfigClient";
import type { FedexConfig } from "@/lib/fedex/client";

export default async function FedexPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  /*
   * ⚠ `mascheazaConfig` inlocuieste `client_secret` cu un substituent inainte sa
   * ajunga in browser. Restul configurarii pleaca intreaga, si asa trebuie:
   * `client_id` il identifica pe comerciant CE PROIECT din portalul FedEx a legat,
   * `account_number` se tipareste pe fiecare factura FedEx pe care o primeste, iar
   * adresa de expeditie nu e credentiala.
   *
   * ⚠ Daca `fedex_config` n-ar fi in `CAMPURI_SECRETE`, functia ar intoarce configul
   * NEATINS — adica exact Secret Key in HTML-ul paginii, tacut.
   */
  const config = (mascheazaConfig("fedex_config", settings?.fedex_config) as FedexConfig | null) ?? null;

  return <FedexConfigClient businessId={business.id} initialConfig={config} />;
}
