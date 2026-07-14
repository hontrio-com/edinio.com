import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { redirect } from "next/navigation";
import KlarnaConfigClient from "@/components/dashboard/KlarnaConfigClient";
import type { KlarnaConfig } from "@/lib/klarna";

export default async function KlarnaPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const klarnaConfig = (settings?.klarna_config as KlarnaConfig | null) ?? null;

  return <KlarnaConfigClient businessId={business.id} initialConfig={klarnaConfig} />;
}
