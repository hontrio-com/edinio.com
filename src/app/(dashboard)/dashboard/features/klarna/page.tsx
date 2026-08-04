import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { mascheazaConfig } from "@/lib/integrari/secrete";
import { redirect } from "next/navigation";
import KlarnaConfigClient from "@/components/dashboard/KlarnaConfigClient";
import type { KlarnaConfig } from "@/lib/klarna";

// Validarea „instant" e amanata pentru aceasta ruta: `cacheComponents` a fost
// activat pe tot proiectul deodata, iar rutele se convertesc pe rand. Cand
// ruta e pregatita (date cachuite cu `use cache` sau invelite in `Suspense`),
// linia de mai jos se sterge si ruta incepe sa se prerandeze.
export const instant = false;

export default async function KlarnaPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const klarnaConfig = (mascheazaConfig("klarna_config", settings?.klarna_config) as KlarnaConfig | null) ?? null;

  return <KlarnaConfigClient businessId={business.id} initialConfig={klarnaConfig} />;
}
