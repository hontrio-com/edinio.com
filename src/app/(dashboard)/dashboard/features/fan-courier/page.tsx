import { redirect } from "next/navigation";
import { mascheazaConfig } from "@/lib/integrari/secrete";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { FanCourierConfigClient } from "@/components/dashboard/FanCourierConfigClient";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import type { FanCourierConfig } from "@/lib/fancourier";

// Validarea „instant" e amanata pentru aceasta ruta: `cacheComponents` a fost
// activat pe tot proiectul deodata, iar rutele se convertesc pe rand. Cand
// ruta e pregatita (date cachuite cu `use cache` sau invelite in `Suspense`),
// linia de mai jos se sterge si ruta incepe sa se prerandeze.
export const instant = false;

export default async function FanCourierPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const config = (mascheazaConfig("fan_courier_config", settings?.fan_courier_config) as FanCourierConfig | null) ?? null;

  return (
    <div className="p-6 max-w-2xl">
      <IntegrationHeader id="fan-courier" description="Genereaza AWB-uri FAN Courier direct din comenzile magazinului tau." />
      <FanCourierConfigClient businessId={business.id} initialConfig={config} />
    </div>
  );
}
