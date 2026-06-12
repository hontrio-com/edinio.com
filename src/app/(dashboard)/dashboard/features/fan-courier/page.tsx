import { redirect } from "next/navigation";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { FanCourierConfigClient } from "@/components/dashboard/FanCourierConfigClient";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import type { FanCourierConfig } from "@/lib/fancourier";

export default async function FanCourierPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const config = (settings?.fan_courier_config as FanCourierConfig | null) ?? null;

  return (
    <div className="p-6 max-w-2xl">
      <IntegrationHeader id="fan-courier" description="Genereaza AWB-uri FAN Courier direct din comenzile magazinului tau." />
      <FanCourierConfigClient businessId={business.id} initialConfig={config} />
    </div>
  );
}
