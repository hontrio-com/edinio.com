import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { redirect } from "next/navigation";
import NetopiaConfigClient from "@/components/dashboard/NetopiaConfigClient";
import type { NetopiaConfig } from "@/lib/netopia";

export default async function NetopiaPage() {
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
    .select("netopia_config")
    .eq("business_id", business.id)
    .single();

  const netopiaConfig = (settings?.netopia_config as NetopiaConfig | null) ?? null;

  return (
    <NetopiaConfigClient businessId={business.id} initialConfig={netopiaConfig} />
  );
}
