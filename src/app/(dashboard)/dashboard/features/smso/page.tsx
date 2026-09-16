import { redirect } from "next/navigation";
import { mascheazaConfig } from "@/lib/integrari/secrete";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { SmsoConfigClient } from "@/components/dashboard/SmsoConfigClient";
import { getSmsoWebhookUrl, getSmsDezabonati } from "@/lib/actions/sms.actions";
import type { SmsoConfig } from "@/lib/smso";

export default async function SmsoPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const smsoConfig: SmsoConfig = (mascheazaConfig("smso_config", settings?.smso_config) as SmsoConfig | null) ?? {
    enabled: false,
    api_key: "",
    sender_id: "",
  };

  /*
   * ⚠ Adresa si lista se aduc AICI, pe server, nu dintr-un efect din browser.
   *
   * Amandoua sunt gata in clipa in care pagina se randeaza, deci o a doua calatorie n-ar aduce nimic
   * in plus. Mai important: adresa se compune cu secretul serverului, si nu are ce cauta intr-un
   * drum pornit din browser daca poate fi calculata o data, aici.
   */
  const adresa = await getSmsoWebhookUrl(business.id);
  const dezabonati = await getSmsDezabonati(business.id);

  return (
    <SmsoConfigClient
      businessId={business.id}
      initialConfig={smsoConfig}
      webhookUrl={"url" in adresa ? adresa.url : null}
      dezabonati={dezabonati}
    />
  );
}
