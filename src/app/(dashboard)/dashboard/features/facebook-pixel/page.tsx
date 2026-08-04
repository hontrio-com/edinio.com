import { redirect } from "next/navigation";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { FacebookPixelConfigClient } from "@/components/dashboard/FacebookPixelConfigClient";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import type { MarketingConfig } from "@/lib/marketing";

// Validarea „instant" e amanata pentru aceasta ruta: `cacheComponents` a fost
// activat pe tot proiectul deodata, iar rutele se convertesc pe rand. Cand
// ruta e pregatita (date cachuite cu `use cache` sau invelite in `Suspense`),
// linia de mai jos se sterge si ruta incepe sa se prerandeze.
export const instant = false;

export default async function FacebookPixelPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const config = (settings?.marketing_config as MarketingConfig | null) ?? null;

  return (
    <div className="p-6 max-w-2xl">
      <IntegrationHeader id="facebook-pixel" description="Urmareste vizitatorii si optimizeaza campaniile tale pe Facebook si Instagram." />
      <FacebookPixelConfigClient businessId={business.id} initialConfig={config} />
    </div>
  );
}
