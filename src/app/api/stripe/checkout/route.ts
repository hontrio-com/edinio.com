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
    : `${siteUrl}/dashboard/settings?plan=plan`;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: user.id,
    customer_email: user.email,
    metadata: { user_id: user.id, plan },
    subscription_data: { metadata: { user_id: user.id, plan } },
  });

  return NextResponse.json({ url: session.url });
}
