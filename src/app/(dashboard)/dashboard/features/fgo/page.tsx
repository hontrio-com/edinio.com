import { redirect } from "next/navigation";
import { mascheazaConfig } from "@/lib/integrari/secrete";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { FgoConfigClient } from "@/components/dashboard/FgoConfigClient";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import type { FgoConfig } from "@/lib/fgo";

// Validarea „instant" e amanata pentru aceasta ruta: `cacheComponents` a fost
// activat pe tot proiectul deodata, iar rutele se convertesc pe rand. Cand
// ruta e pregatita (date cachuite cu `use cache` sau invelite in `Suspense`),
// linia de mai jos se sterge si ruta incepe sa se prerandeze.
export const instant = false;

export default async function FgoPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const config = (mascheazaConfig("fgo_config", settings?.fgo_config) as FgoConfig | null) ?? null;

  return (
    <div className="p-6 max-w-2xl">
      <IntegrationHeader id="fgo" description="Genereaza automat facturi fGO pentru comenzile din magazinul tau." />
      <FgoConfigClient businessId={business.id} initialConfig={config} />
    </div>
  );
}
