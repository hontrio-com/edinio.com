import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "No signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_CONNECT_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // account.updated — sync charges_enabled / payouts_enabled status
  if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account;
    const { data: rows } = await admin
      .from("store_settings")
      .select("id, stripe_config")
      .filter("stripe_config->>account_id", "eq", account.id);

    if (rows && rows.length > 0) {
      const row = rows[0];
      const existing = (row.stripe_config as Record<string, unknown>) ?? {};
      await admin
        .from("store_settings")
        .update({
          stripe_config: {
            ...existing,
            charges_enabled: account.charges_enabled,
            payouts_enabled: account.payouts_enabled,
            onboarding_complete: account.details_submitted,
            enabled: account.charges_enabled,
          },
        })
        .eq("id", row.id);
    }
  }

  // checkout.session.completed — mark order as paid
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.orderId;
    if (orderId && session.payment_status === "paid") {
      await admin
        .from("orders")
        .update({ payment_status: "paid", status: "confirmed" })
        .eq("id", orderId);
    }
  }

  return NextResponse.json({ received: true });
}
