import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SmsoConfigClient } from "@/components/dashboard/SmsoConfigClient";
import type { SmsoConfig } from "@/lib/smso";

export default async function SmsoPage() {
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
    .select("smso_config")
    .eq("business_id", business.id)
    .single();

  const smsoConfig: SmsoConfig = (settings?.smso_config as SmsoConfig | null) ?? {
    enabled: false,
    api_key: "",
    sender_id: "",
  };

  return <SmsoConfigClient businessId={business.id} initialConfig={smsoConfig} />;
}
