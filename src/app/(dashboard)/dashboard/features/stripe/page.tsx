import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { StripeConnectClient, type StripeConfig } from "@/components/dashboard/StripeConnectClient";

export default async function StripeFeaturePage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: business } = await supabase
    .from("businesses")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .single();

  let stripeConfig: StripeConfig | null = null;
  if (business) {
    const { data: settings } = await supabase
      .from("store_settings")
      .select("stripe_config")
      .eq("business_id", business.id)
      .single();
    stripeConfig = (settings?.stripe_config as StripeConfig | null) ?? null;
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/features"
          className="flex items-center justify-center w-8 h-8 rounded-lg border border-border hover:bg-muted transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Stripe</h1>
          <p className="text-xs text-muted-foreground">Procesator de plati cu cardul</p>
        </div>
        <img src="/integrations/stripe.svg" alt="Stripe" className="h-6 w-auto ml-auto" />
      </div>

      <StripeConnectClient config={stripeConfig} />
    </div>
  );
}
