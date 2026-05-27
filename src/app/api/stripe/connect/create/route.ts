import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: business } = await supabase
    .from("businesses")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .single();

  if (!business) return NextResponse.json({ error: "No business found" }, { status: 400 });

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: settings } = await admin
    .from("store_settings")
    .select("stripe_config")
    .eq("business_id", business.id)
    .single();

  const stripeConfig = (settings?.stripe_config as Record<string, unknown> | null) ?? {};
  let accountId = stripeConfig.account_id as string | undefined;

  if (!accountId) {
    const account = await stripe.accounts.create({ type: "standard" });
    accountId = account.id;
    await admin
      .from("store_settings")
      .update({ stripe_config: { account_id: accountId, onboarding_complete: false, enabled: false } })
      .eq("business_id", business.id);
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.headers.get("origin") ?? "https://www.edinio.com";

  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${baseUrl}/api/stripe/connect/refresh?business_id=${business.id}`,
    return_url: `${baseUrl}/api/stripe/connect/return?business_id=${business.id}`,
    type: "account_onboarding",
  });

  return NextResponse.json({ url: accountLink.url });
}
