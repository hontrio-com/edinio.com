import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { SMSMarketingClient } from "@/components/dashboard/SMSMarketingClient";
import type { SmsoConfig } from "@/lib/smso";
import { getSmsTemplates } from "@/lib/actions/sms.actions";

import { connection } from "next/server";
// Validarea „instant" e amanata pentru aceasta ruta: `cacheComponents` a fost
// activat pe tot proiectul deodata, iar rutele se convertesc pe rand. Cand
// ruta e pregatita (date cachuite cu `use cache` sau invelite in `Suspense`),
// linia de mai jos se sterge si ruta incepe sa se prerandeze.
export const instant = false;

export default async function SmsMarketingPage() {
  // Pagina citeste date necachuite la fiecare cerere — exact ca pana acum.
  // `connection()` spune asta explicit, ca prerandarea sa nu incerce sa o
  // execute in timpul build-ului. Comportamentul la rulare e neschimbat.
  await connection();
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
  const smsoConfig = rawSettings?.smso_config as SmsoConfig | null;

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
