import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { redirect } from "next/navigation";
import ColeteConfigClient from "@/components/dashboard/ColeteConfigClient";
import type { COConfig } from "@/lib/colete";

export default async function ColetePage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const coleteConfig = (settings?.colete_config as COConfig | null) ?? null;

  return <ColeteConfigClient businessId={business.id} initialConfig={coleteConfig} />;
}
