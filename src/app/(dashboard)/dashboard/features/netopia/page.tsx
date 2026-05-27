import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { redirect } from "next/navigation";
import NetopiaConfigClient from "@/components/dashboard/NetopiaConfigClient";
import type { NetopiaConfig } from "@/lib/netopia";

export default async function NetopiaPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const netopiaConfig = (settings?.netopia_config as NetopiaConfig | null) ?? null;

  return (
    <NetopiaConfigClient businessId={business.id} initialConfig={netopiaConfig} />
  );
}
