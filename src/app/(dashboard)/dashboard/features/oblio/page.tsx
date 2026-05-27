import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import OblioConfigClient from "@/components/dashboard/OblioConfigClient";
import type { OblioConfig } from "@/lib/oblio";

export default async function OblioPage() {
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
    .select("oblio_config")
    .eq("business_id", business.id)
    .single();

  const oblioConfig = (settings?.oblio_config as OblioConfig | null) ?? null;

  return <OblioConfigClient businessId={business.id} initialConfig={oblioConfig} />;
}
