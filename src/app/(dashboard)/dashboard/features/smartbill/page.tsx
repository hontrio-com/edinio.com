import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SmartbillConfigClient } from "@/components/dashboard/SmartbillConfigClient";
import type { SmartbillConfig } from "@/lib/smartbill";

export default async function SmartbillPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: business } = await supabase
    .from("businesses")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .single();

  if (!business) redirect("/dashboard");

  const { data: settings } = await supabase
    .from("store_settings")
    .select("smartbill_config")
    .eq("business_id", business.id)
    .single();

  const config: SmartbillConfig = (settings?.smartbill_config as SmartbillConfig | null) ?? {
    enabled: false,
    email: "",
    token: "",
    company_vat_code: "",
    series_name: "",
    tax_name: "",
    send_email: false,
  };

  return <SmartbillConfigClient businessId={business.id} initialConfig={config} />;
}
