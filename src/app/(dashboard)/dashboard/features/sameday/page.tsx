import { redirect } from "next/navigation";
import { mascheazaConfig } from "@/lib/integrari/secrete";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { SamedayConfigClient } from "@/components/dashboard/SamedayConfigClient";
import type { SamedayConfig } from "@/lib/sameday/client";

export default async function SamedayPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const config = (mascheazaConfig("sameday_config", settings?.sameday_config) as SamedayConfig | null) ?? null;

  return <SamedayConfigClient businessId={business.id} initialConfig={config} />;
}
