import { redirect } from "next/navigation";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { StripeConnectClient, type StripeConfig } from "@/components/dashboard/StripeConnectClient";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";

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
