import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe, PLAN_PRICE_IDS } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Neautorizat" }, { status: 401 });

  const { plan, return_to } = await req.json() as { plan: string; return_to?: string };
  const priceId = PLAN_PRICE_IDS[plan];
  if (!priceId) return NextResponse.json({ error: "Plan invalid" }, { status: 400 });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const isOnboarding = return_to === "onboarding";
  const successUrl = isOnboarding
    ? `${siteUrl}/onboarding/plan?success=1`
    : `${siteUrl}/dashboard/settings?plan_success=1`;
  const cancelUrl = isOnboarding
    ? `${siteUrl}/onboarding/plan?cancelled=1`
    : `${siteUrl}/dashboard/settings`;

  // Look up existing Stripe customer to avoid duplicates
  const { data: profile } = await supabase
    .from("users_profile")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();

  const existingCustomerId = profile?.stripe_customer_id ?? null;

  // Cancel any existing active subscription to prevent double billing
  if (existingCustomerId) {
    try {
      const subscriptions = await stripe.subscriptions.list({
        customer: existingCustomerId,
        status: "active",
        limit: 10,
      });
      for (const sub of subscriptions.data) {
        await stripe.subscriptions.cancel(sub.id, { prorate: true });
      }
    } catch {
      // Non-critical: continue with checkout even if cancel fails
    }
  }

  // Build checkout session params
  const sessionParams: Parameters<typeof stripe.checkout.sessions.create>[0] = {
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: user.id,
    metadata: { user_id: user.id, plan },
    subscription_data: { metadata: { user_id: user.id, plan } },
  };

  // Reuse existing Stripe customer or pass email for new one
  if (existingCustomerId) {
    sessionParams.customer = existingCustomerId;
  } else {
    sessionParams.customer_email = user.email;
  }

  const session = await stripe.checkout.sessions.create(sessionParams);

  return NextResponse.json({ url: session.url });
}
