import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { mascheazaConfig } from "@/lib/integrari/secrete";
import { redirect } from "next/navigation";
import ColeteConfigClient from "@/components/dashboard/ColeteConfigClient";
import type { COConfig } from "@/lib/colete";

export default async function ColetePage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const coleteConfig = (mascheazaConfig("colete_config", settings?.colete_config) as COConfig | null) ?? null;

  return <ColeteConfigClient businessId={business.id} initialConfig={coleteConfig} />;
}
