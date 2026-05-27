import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import WootConfigClient from "@/components/dashboard/WootConfigClient";
import type { WootConfig } from "@/lib/woot";

export default async function WootPage() {
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
    .select("woot_config")
    .eq("business_id", business.id)
    .single();

  const wootConfig = (settings?.woot_config as WootConfig | null) ?? null;

  return <WootConfigClient businessId={business.id} initialConfig={wootConfig} />;
}
