import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { mascheazaConfig } from "@/lib/integrari/secrete";
import { redirect } from "next/navigation";
import RevolutConfigClient from "@/components/dashboard/RevolutConfigClient";
import type { RevolutConfig, RevolutConfigInput } from "@/lib/revolut";

// Validarea „instant" e amanata pentru aceasta ruta: `cacheComponents` a fost
// activat pe tot proiectul deodata, iar rutele se convertesc pe rand. Cand
// ruta e pregatita (date cachuite cu `use cache` sau invelite in `Suspense`),
// linia de mai jos se sterge si ruta incepe sa se prerandeze.
export const instant = false;

export default async function RevolutPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const full = (mascheazaConfig("revolut_config", settings?.revolut_config) as RevolutConfig | null) ?? null;
  // Only the editable fields reach the client — the server-side webhook signing
  // secret never leaves the server.
  const initialConfig: RevolutConfigInput | null = full
    ? { enabled: full.enabled, sandbox: full.sandbox, secret_key: full.secret_key, title: full.title }
    : null;

  return <RevolutConfigClient businessId={business.id} initialConfig={initialConfig} />;
}
