import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { finalizeStripeOrder, stripeAccountId } from "@/lib/stripe-finalize";
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

  // checkout.session.completed — marcheaza comanda platita.
  //
  // `async_payment_succeeded` acopera metodele care se deconteaza mai tarziu:
  // acolo sesiunea se „completeaza" cu payment_status `unpaid`, iar plata
  // confirma abia la al doilea eveniment.
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.orderId;
    const businessId = session.metadata?.businessId;
    const accountId = event.account ?? null;

    if (orderId && businessId && accountId) {
      const { data: order } = await admin
        .from("orders")
        .select("id, total, status, payment_status")
        .eq("id", orderId)
        .eq("business_id", businessId)
        .single();

      // Contul din eveniment trebuie sa fie chiar contul conectat al magazinului:
      // altfel un cont conectat oarecare ar putea marca platita comanda altuia
      // doar trimitand acelasi `orderId` in metadata.
      const { data: settings } = await admin
        .from("store_settings")
        .select("stripe_config")
        .eq("business_id", businessId)
        .single();

      if (order && stripeAccountId(settings?.stripe_config) === accountId) {
        await finalizeStripeOrder(
          admin,
          accountId,
          { id: order.id, businessId, total: Number(order.total) || 0, status: order.status as string | null },
          session.id,
        );
      } else {
        console.error("[stripe/webhook] comanda sau contul nu corespund:", { orderId, businessId, accountId });
      }
    }
  }

  return NextResponse.json({ received: true });
}
