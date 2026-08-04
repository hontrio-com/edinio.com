import { redirect } from "next/navigation";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { StripeConnectClient, type StripeConfig } from "@/components/dashboard/StripeConnectClient";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";

// Validarea „instant" e amanata pentru aceasta ruta: `cacheComponents` a fost
// activat pe tot proiectul deodata, iar rutele se convertesc pe rand. Cand
// ruta e pregatita (date cachuite cu `use cache` sau invelite in `Suspense`),
// linia de mai jos se sterge si ruta incepe sa se prerandeze.
export const instant = false;

export default async function StripeFeaturePage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);

  const stripeConfig = (settings?.stripe_config as StripeConfig | null) ?? null;

  return (
    <div className="p-6 max-w-2xl">
      <IntegrationHeader id="stripe" description="Procesator de plati cu cardul." />
      <StripeConnectClient config={stripeConfig} businessId={business?.id ?? ""} />
    </div>
  );
}
