import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { mascheazaConfig } from "@/lib/integrari/secrete";
import { SMSMarketingClient, type Campanie } from "@/components/dashboard/SMSMarketingClient";
import type { SmsoConfig } from "@/lib/smso";
import { getSmsTemplates } from "@/lib/actions/sms.actions";
import { statisticiSms } from "@/lib/sms/campanie";

export const metadata = { title: "SMS Marketing" };

/*
 * ⚠ Trimiterea NU mai sta intr-o singura cerere (27.09.2026): campania merge pe loturi de ~40 s,
 * chemate de ecran (`trimiteLot`). Plafonul ramane ca plasa pentru lotul care se lungeste.
 */
export const maxDuration = 300;

export default async function SmsMarketingPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: bizRow } = await supabase
    .from("businesses")
    .select("id, business_name, store_name, store_settings(smso_config)")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .single();

  if (!bizRow) redirect("/dashboard");

  const rawSettings = Array.isArray(bizRow.store_settings) ? bizRow.store_settings[0] ?? null : bizRow.store_settings ?? null;
  /*
   * Configul pleaca MASCAT catre client: pagina are nevoie doar de steagul
   * `enabled`, dar pana acum trimitea obiectul intreg, cu `api_key` cu tot,
   * intr-o Client Component care nu-l foloseste nicaieri.
   */
  const smsoConfig = mascheazaConfig("smso_config", rawSettings?.smso_config) as SmsoConfig | null;

  if (!smsoConfig?.enabled) redirect("/dashboard/settings");

  /*
   * ⚠ ISTORICUL SE OPRESTE LA CINCIZECI, SI O SPUNE (23.09.2026): se citeste si cate sunt de fapt.
   * Statisticile trec prin clientul de serviciu (functiile din baza nu sunt deschise utilizatorilor),
   * dupa ce magazinul a fost gasit chiar dupa `user_id`.
   */
  const [{ data: campaigns }, { count: cateCampanii }, initialTemplates, statistici, { data: categorii }] = await Promise.all([
    supabase
      .from("sms_campaigns")
      .select("id, message, recipient_count, sent_count, failed_count, status, created_at, segmente, motiv_oprire, cheie, sariti, finalizata_la")
      .eq("business_id", bizRow.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("sms_campaigns")
      .select("id", { count: "exact", head: true })
      .eq("business_id", bizRow.id),
    getSmsTemplates(bizRow.id),
    statisticiSms(createAdminClient(), bizRow.id),
    supabase.from("categories").select("name").eq("business_id", bizRow.id).order("name").limit(500),
  ]);

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <SMSMarketingClient
        businessId={bizRow.id}
        numeMagazin={(bizRow.store_name ?? bizRow.business_name ?? "").trim()}
        /* Sender ID-ul e de obicei un NUMAR la SMSO („4”): atunci pe telefon se arata numele magazinului. */
        expeditor={smsoConfig.sender_id && /\D/.test(String(smsoConfig.sender_id)) ? String(smsoConfig.sender_id) : null}
        initialCampaigns={(campaigns ?? []) as Campanie[]}
        totalCampanii={cateCampanii ?? (campaigns ?? []).length}
        initialTemplates={initialTemplates}
        statistici={statistici}
        categorii={[...new Set((categorii ?? []).map((c) => c.name).filter(Boolean))]}
      />
    </div>
  );
}
