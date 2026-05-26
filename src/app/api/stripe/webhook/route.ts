import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) return NextResponse.json({ error: "No signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.user_id;
    const plan = session.metadata?.plan;

    console.log("[webhook] checkout.session.completed", { userId, plan });

    if (!userId || !plan) {
      console.error("[webhook] Missing userId or plan in metadata");
      return NextResponse.json({ received: true });
    }

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    const { error } = await admin.from("users_profile").update({
      plan: plan as never,
      plan_expires_at: expiresAt.toISOString(),
    }).eq("id", userId);

    if (error) {
      console.error("[webhook] DB update failed:", error);
      return NextResponse.json({ error: "DB update failed" }, { status: 500 });
    }

    console.log("[webhook] Plan updated successfully:", { userId, plan });
  }

  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    const userId = sub.metadata?.user_id;
    if (!userId) return NextResponse.json({ received: true });

    await admin.from("users_profile").update({
      plan: "free" as never,
      plan_expires_at: null,
    }).eq("id", userId);
  }

  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object as Stripe.Invoice & {
      subscription_details?: { metadata?: Record<string, string> };
    };
    const userId = invoice.subscription_details?.metadata?.user_id;
    const plan = invoice.subscription_details?.metadata?.plan;
    if (!userId || !plan) return NextResponse.json({ received: true });

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    await admin.from("users_profile").update({
      plan: plan as never,
      plan_expires_at: expiresAt.toISOString(),
    }).eq("id", userId);
  }

  return NextResponse.json({ received: true });
}
