import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get("business_id");
  const dashboardUrl = new URL("/dashboard/features/stripe", request.nextUrl.origin).toString();

  if (!businessId) return NextResponse.redirect(dashboardUrl);

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

  const accountId = (settings?.stripe_config as Record<string, unknown> | null)?.account_id as string | undefined;
  if (!accountId) return NextResponse.redirect(dashboardUrl);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;

  try {
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${baseUrl}/api/stripe/connect/refresh?business_id=${businessId}`,
      return_url: `${baseUrl}/api/stripe/connect/return?business_id=${businessId}`,
      type: "account_onboarding",
    });
    return NextResponse.redirect(accountLink.url);
  } catch {
    return NextResponse.redirect(dashboardUrl);
  }
}
