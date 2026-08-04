import { redirect } from "next/navigation";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { KlaviyoClient } from "@/components/dashboard/KlaviyoClient";
import { toPublicKlaviyoConfig, type KlaviyoConfig } from "@/lib/klaviyo";

// Validarea „instant" e amanata pentru aceasta ruta: `cacheComponents` a fost
// activat pe tot proiectul deodata, iar rutele se convertesc pe rand. Cand
// ruta e pregatita (date cachuite cu `use cache` sau invelite in `Suspense`),
// linia de mai jos se sterge si ruta incepe sa se prerandeze.
export const instant = false;

export default async function KlaviyoPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  // Only the client-safe view is passed down — the API key never leaves the server.
  const config = (settings?.klaviyo_config as KlaviyoConfig | null) ?? null;

  return <KlaviyoClient businessId={business.id} initialConfig={toPublicKlaviyoConfig(config)} />;
}
