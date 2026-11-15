import { redirect } from "next/navigation";
import { mascheazaConfig } from "@/lib/integrari/secrete";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { CargusConfigClient } from "@/components/dashboard/CargusConfigClient";
import type { CargusConfig } from "@/lib/cargus";

export default async function CargusPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const config = (mascheazaConfig("cargus_config", settings?.cargus_config) as CargusConfig | null) ?? null;

  return <CargusConfigClient businessId={business.id} initialConfig={config} />;
}
