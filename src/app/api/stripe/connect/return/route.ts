import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get("business_id");
  const dashboardUrl = new URL("/dashboard/features/stripe", request.nextUrl.origin).toString();

  if (!businessId) return NextResponse.redirect(dashboardUrl);

  // Verify authenticated user owns this business
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.nextUrl.origin).toString());

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return NextResponse.redirect(dashboardUrl);

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: settings } = await admin
    .from("store_settings")
    .select("stripe_config")
    .eq("business_id", businessId)
    .single();

  const stripeConfig = (settings?.stripe_config as Record<string, unknown> | null) ?? {};
  const accountId = stripeConfig.account_id as string | undefined;

  if (accountId) {
    try {
      const account = await stripe.accounts.retrieve(accountId);
      await admin
        .from("store_settings")
        .update({
          stripe_config: {
            ...stripeConfig,
            charges_enabled: account.charges_enabled,
            payouts_enabled: account.payouts_enabled,
            onboarding_complete: account.details_submitted,
            enabled: account.charges_enabled,
          },
        })
        .eq("business_id", businessId);
    } catch {
      // Stripe account retrieval failed - redirect without updating
    }
  }

  return NextResponse.redirect(dashboardUrl);
}
