import { redirect } from "next/navigation";
import { mascheazaConfig } from "@/lib/integrari/secrete";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { SmsoConfigClient } from "@/components/dashboard/SmsoConfigClient";
import type { SmsoConfig } from "@/lib/smso";

// Validarea „instant" e amanata pentru aceasta ruta: `cacheComponents` a fost
// activat pe tot proiectul deodata, iar rutele se convertesc pe rand. Cand
// ruta e pregatita (date cachuite cu `use cache` sau invelite in `Suspense`),
// linia de mai jos se sterge si ruta incepe sa se prerandeze.
export const instant = false;

export default async function SmsoPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const smsoConfig: SmsoConfig = (mascheazaConfig("smso_config", settings?.smso_config) as SmsoConfig | null) ?? {
    enabled: false,
    api_key: "",
    sender_id: "",
  };

  return <SmsoConfigClient businessId={business.id} initialConfig={smsoConfig} />;
}
