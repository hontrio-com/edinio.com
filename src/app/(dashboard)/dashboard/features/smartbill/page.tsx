import { redirect } from "next/navigation";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { SmartbillConfigClient } from "@/components/dashboard/SmartbillConfigClient";
import type { SmartbillConfig } from "@/lib/smartbill";

export default async function SmartbillPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const config: SmartbillConfig = (settings?.smartbill_config as SmartbillConfig | null) ?? {
    enabled: false,
    email: "",
    token: "",
    company_vat_code: "",
    series_name: "",
    estimate_series_name: "",
    tax_name: "",
    send_email: false,
    auto_invoice: false,
    auto_invoice_trigger: "confirmed",
  };

  return <SmartbillConfigClient businessId={business.id} initialConfig={config} />;
}
