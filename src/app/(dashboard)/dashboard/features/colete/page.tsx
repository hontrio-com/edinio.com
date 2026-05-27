import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { redirect } from "next/navigation";
import ColeteConfigClient from "@/components/dashboard/ColeteConfigClient";
import type { COConfig } from "@/lib/colete";

export default async function ColetePage() {
  const supabase = await createClient();
  const user = await getCachedUser();
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
    .select("colete_config")
    .eq("business_id", business.id)
    .single();

  const coleteConfig = (settings?.colete_config as COConfig | null) ?? null;

  return <ColeteConfigClient businessId={business.id} initialConfig={coleteConfig} />;
}
