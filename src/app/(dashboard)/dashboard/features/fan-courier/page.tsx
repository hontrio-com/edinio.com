import { redirect } from "next/navigation";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { FanCourierConfigClient } from "@/components/dashboard/FanCourierConfigClient";
import type { FanCourierConfig } from "@/lib/fancourier";

export default async function FanCourierPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const config = (settings?.fan_courier_config as FanCourierConfig | null) ?? null;

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <img
          src="/integrations/fan-courier.svg"
          alt="FAN Courier"
          className="h-8 w-auto object-contain"
        />
        <div>
          <h1 className="text-xl font-semibold text-foreground">FAN Courier</h1>
          <p className="text-sm text-muted-foreground">
            Genereaza AWB-uri FAN Courier direct din comenzile magazinului tau.
          </p>
        </div>
      </div>

      <FanCourierConfigClient businessId={business.id} initialConfig={config} />
    </div>
  );
}
