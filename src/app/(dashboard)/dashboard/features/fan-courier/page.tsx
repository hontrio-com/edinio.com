import { redirect } from "next/navigation";
import { mascheazaConfig } from "@/lib/integrari/secrete";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { FanCourierConfigClient } from "@/components/dashboard/FanCourierConfigClient";
import type { FanCourierConfig } from "@/lib/fancourier";

export default async function FanCourierPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const config = (mascheazaConfig("fan_courier_config", settings?.fan_courier_config) as FanCourierConfig | null) ?? null;

  return <FanCourierConfigClient businessId={business.id} initialConfig={config} />;
}
