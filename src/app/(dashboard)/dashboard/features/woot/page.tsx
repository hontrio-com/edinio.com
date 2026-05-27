import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { redirect } from "next/navigation";
import WootConfigClient from "@/components/dashboard/WootConfigClient";
import type { WootConfig } from "@/lib/woot";

export default async function WootPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const wootConfig = (settings?.woot_config as WootConfig | null) ?? null;

  return <WootConfigClient businessId={business.id} initialConfig={wootConfig} />;
}
