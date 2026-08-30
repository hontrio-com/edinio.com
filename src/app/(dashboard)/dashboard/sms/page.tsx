import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { mascheazaConfig } from "@/lib/integrari/secrete";
import { SMSMarketingClient } from "@/components/dashboard/SMSMarketingClient";
import type { SmsoConfig } from "@/lib/smso";
import { getSmsTemplates } from "@/lib/actions/sms.actions";

export default async function SmsMarketingPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: bizRow } = await supabase
    .from("businesses")
    .select("id, business_name, store_settings(smso_config)")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .single();

  if (!bizRow) redirect("/dashboard");

  const rawSettings = Array.isArray(bizRow.store_settings) ? bizRow.store_settings[0] ?? null : bizRow.store_settings ?? null;
  /*
   * Configul pleaca MASCAT catre client: pagina are nevoie doar de steagul
   * `enabled`, dar pana acum trimitea obiectul intreg, cu `api_key` cu tot,
   * intr-o Client Component care nu-l foloseste nicaieri. Adica cheia SMSO
   * cobora in browser degeaba, vizibila din payload-ul RSC.
   *
   * Nu se mascheaza de la sine dupa criptare: pe drumul asta nu se cere nimic
   * de la SMSO, deci citirea ramane pe clientul comerciantului si campul ar
   * sosi oricum `enc.v1.…` — tot inutil de trimis mai departe.
   */
  const smsoConfig = mascheazaConfig("smso_config", rawSettings?.smso_config) as SmsoConfig | null;

  if (!smsoConfig?.enabled) redirect("/dashboard/settings");

  const [{ data: campaigns }, initialTemplates] = await Promise.all([
    supabase
      .from("sms_campaigns")
      .select("*")
      .eq("business_id", bizRow.id)
      .order("created_at", { ascending: false })
      .limit(50),
    getSmsTemplates(bizRow.id),
  ]);

  return (
    <SMSMarketingClient
      businessId={bizRow.id}
      smsoConfig={smsoConfig}
      initialCampaigns={(campaigns ?? []).map(c => ({ ...c, status: c.status as "sent" | "partial" | "failed" }))}
      initialTemplates={initialTemplates}
    />
  );
}
