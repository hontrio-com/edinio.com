import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { mascheazaConfig } from "@/lib/integrari/secrete";
import { redirect } from "next/navigation";
import OblioConfigClient from "@/components/dashboard/OblioConfigClient";
import type { OblioConfig } from "@/lib/oblio";

export default async function OblioPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const oblioConfig = (mascheazaConfig("oblio_config", settings?.oblio_config) as OblioConfig | null) ?? null;

  return <OblioConfigClient businessId={business.id} initialConfig={oblioConfig} />;
}
