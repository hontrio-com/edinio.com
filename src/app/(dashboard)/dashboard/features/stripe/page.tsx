import { redirect } from "next/navigation";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { StripeConnectClient, type StripeConfig } from "@/components/dashboard/StripeConnectClient";

export default async function StripeFeaturePage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);

  const stripeConfig = (settings?.stripe_config as StripeConfig | null) ?? null;

  return <StripeConnectClient config={stripeConfig} businessId={business?.id ?? ""} />;
}
