import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { SMSMarketingClient } from "@/components/dashboard/SMSMarketingClient";
import type { SmsoConfig } from "@/lib/smso";
import { getSmsTemplates } from "@/lib/actions/sms.actions";

export default async function SmsMarketingPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: business } = await supabase
    .from("businesses")
    .select("id, business_name")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .single();

  if (!business) redirect("/dashboard");

  const { data: settings } = await supabase
    .from("store_settings")
    .select("smso_config")
    .eq("business_id", business.id)
    .single();

  const smsoConfig = settings?.smso_config as SmsoConfig | null;

  if (!smsoConfig?.enabled) redirect("/dashboard/settings");

  const { data: campaigns } = await supabase
    .from("sms_campaigns")
    .select("*")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const initialTemplates = await getSmsTemplates(business.id);

  return (
    <SMSMarketingClient
      businessId={business.id}
      smsoConfig={smsoConfig}
      initialCampaigns={(campaigns ?? []).map(c => ({ ...c, status: c.status as "sent" | "partial" | "failed" }))}
      initialTemplates={initialTemplates}
    />
  );
}
