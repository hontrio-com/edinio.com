import { redirect } from "next/navigation";
import { mascheazaConfig } from "@/lib/integrari/secrete";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { FgoConfigClient } from "@/components/dashboard/FgoConfigClient";
import type { FgoConfig } from "@/lib/fgo";

export default async function FgoPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const config = (mascheazaConfig("fgo_config", settings?.fgo_config) as FgoConfig | null) ?? null;

  return <FgoConfigClient businessId={business.id} initialConfig={config} />;
}
